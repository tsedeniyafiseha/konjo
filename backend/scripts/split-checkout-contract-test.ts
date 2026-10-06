import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { bookingPaymentSummary } from '../../shared/booking-payments.ts';
import { chapaMerchantReference, createPaymentGateway } from '../src/adapters/payment-gateway.ts';
import { createNotificationGateway } from '../src/adapters/notification-gateway.ts';
import { configureSqlite, migrateSqliteSchema } from '../src/adapters/sqlite/schema.ts';
import { seedSqliteReferenceData } from '../src/adapters/sqlite/seed-data.ts';
import { SqliteDomainEventOutbox } from '../src/adapters/sqlite/domain-event-outbox.ts';
import { SqliteBookingCommandRepository } from '../src/adapters/sqlite/booking-command-repository.ts';
import { SqliteBookingPaymentSettlement } from '../src/adapters/sqlite/booking-payment-settlement.ts';
import { SqlitePaymentEventRepository } from '../src/adapters/sqlite/payment-event-repository.ts';
import { SqliteProfessionalBookingTransitionRepository } from '../src/adapters/sqlite/professional-booking-transition-repository.ts';
import { SqliteAvailabilityRepository } from '../src/adapters/sqlite/availability-repository.ts';
import { bookingTimeSlots } from '../src/domain/booking-time.ts';
import { SqliteClientReadRepository } from '../src/adapters/sqlite/client-read-repository.ts';
import { SqliteAdminRefundRepository } from '../src/adapters/sqlite/admin-refund-repository.ts';
import { InitiateBookingPaymentHandler } from '../src/application/initiate-booking-payment.ts';
import type { ApiPaymentIntent } from '../../shared/api-contracts.ts';

const db = new DatabaseSync(':memory:');
configureSqlite(db);
migrateSqliteSchema(db);
seedSqliteReferenceData(db);
const now = '2026-09-22T10:00:00.000Z';
const appointmentDate = '2099-01-05';
const appointmentStart = '2099-01-05T07:00:00.000Z';
assert.equal(bookingTimeSlots.length,48);
assert.equal(bookingTimeSlots[0],'12:00 AM');
assert.equal(bookingTimeSlots.at(-1),'11:30 PM');
db.prepare('INSERT INTO administrators(id,email,full_name,password_hash,created_at) VALUES (?,?,?,?,?)')
  .run('split-admin','admin@example.test','Test Admin','unused',now);
db.prepare('INSERT INTO users(id,role,email,full_name,password_hash,created_at) VALUES (?,?,?,?,?,?)')
  .run('split-client','client','split@example.test','Test Client','unused',now);
const pro = (db.prepare('SELECT id FROM professionals LIMIT 1').get() as { id: string }).id;
db.prepare(`INSERT INTO bookings(id,client_request_id,client_id,professional_id,service_id,service_name,date_iso,time,
  address_label,address_zone,address_detail,payment_method,service_price,travel_fee,total,status,accept_by,created_at,payment_plan)
  VALUES ('split','split-request','split-client',?,'service','Test service',?,'10:00 AM','Test','Bole','Test address','telebirr',900.01,100,1000.01,'requested',?,?,'split')`).run(pro,appointmentDate,now,now);
const outbox = new SqliteDomainEventOutbox(db);
const settlement = new SqliteBookingPaymentSettlement(db,outbox);
const payments = new SqlitePaymentEventRepository(db,settlement,outbox);
const commands = new SqliteBookingCommandRepository(db,{getProfessionalAvailability: () => null},outbox);
const transitions = new SqliteProfessionalBookingTransitionRepository(db,settlement,outbox);
const availability = new SqliteAvailabilityRepository(db);
const reads = new SqliteClientReadRepository(db);
const handler = new InitiateBookingPaymentHandler(commands,createPaymentGateway('test-secret',null),{now: () => new Date(now)});
const transition = (action: Parameters<typeof transitions.transitionBooking>[0]['action'], occurredAt = now) => transitions.transitionBooking({professionalId:pro,bookingId:'split',action,occurredAt});
const capture = (payment: ApiPaymentIntent, amount = payment.amount) => payments.processPaymentEvent({eventId:`capture:${payment.id}`,provider:'telebirr',providerReference:payment.providerReference,status:'captured',payloadHash:'capture',occurredAt:now,verifiedAmount:amount,verifiedCurrency:'ETB'});
const created = async () => {
  const result = await handler.execute('split-client','split');
  assert.ok(result.result === 'created' || result.result === 'duplicate');
  return result.paymentIntent;
};
assert.equal(bookingPaymentSummary(1000.01,'split','accepted',[]).depositAmount,500.01);
assert.deepEqual(await handler.execute('someone-else','split'),{result:'not_found'});
assert.deepEqual(await handler.execute('split-client','split'),{result:'not_accepted'});
db.prepare("UPDATE professional_catalog_working_days SET hours = '12:00 AM – 11:59 PM' WHERE professional_id = ? AND day = 'Monday'").run(pro);
const openSlots = availability.getProfessionalAvailability(pro,appointmentDate)?.slots ?? [];
assert.ok(openSlots.includes('12:00 AM'));
assert.ok(openSlots.includes('10:00 PM'));
assert.ok(!openSlots.includes('10:00 AM'),'the booked hour must be unavailable');
assert.ok(!openSlots.includes('10:30 AM'),'every slot overlapping the booked duration must be unavailable');
assert.equal(transition('accept'),'updated');
// An accepted booking only occupies its own slot; the professional stays bookable around it (mirrors Postgres).
assert.equal(availability.getProfessionalAvailability(pro,appointmentDate)?.available,true);
assert.ok(!availability.getProfessionalAvailability(pro,appointmentDate)?.slots.includes('10:00 AM'));
assert.ok(availability.getProfessionalAvailability(pro,appointmentDate,undefined,'split')?.slots.includes('10:00 AM'));
assert.equal(transition('travel'),'payment_required', 'any time after acceptance, but only once the deposit is paid');
const failed = await created();
assert.equal(failed.amount,500.01);
assert.equal((await created()).id,failed.id);
payments.processPaymentEvent({eventId:'failed',provider:'telebirr',providerReference:failed.providerReference,status:'failed',payloadHash:'failed',occurredAt:now});
const deposit = await created();
assert.notEqual(deposit.id,failed.id);
assert.equal(deposit.attempt,2);
assert.equal(capture(deposit,5).result,'invalid_transition');
assert.equal(capture(deposit).result,'updated');
assert.equal(capture(deposit).result,'duplicate');
assert.equal(transition('travel'),'updated', 'the professional may set off before the appointment hour');
assert.equal(transition('check-in',appointmentStart),'invalid_transition');
assert.equal(transition('arrive',appointmentStart),'updated');
assert.equal(transition('check-in',appointmentStart),'updated');
// Checkout: the professional names what the client took beyond the booking. The
// extra and Konjo's fee on it join the total, so the final payment collects it all.
assert.equal(transitions.transitionBooking({professionalId:'someone-else',bookingId:'split',action:'complete',occurredAt:appointmentStart,extraAmount:200}),'not_found');
assert.equal(transitions.transitionBooking({professionalId:pro,bookingId:'split',action:'complete',occurredAt:appointmentStart,extraAmount:200,extraNote:'Two extra rows'}),'updated');
assert.deepEqual({...db.prepare('SELECT extra_amount, extra_fee, extra_note, total FROM bookings WHERE id=?').get('split')},{extra_amount:200,extra_fee:36,extra_note:'Two extra rows',total:1236.01});
assert.equal(reads.listBookings('split-client')[0].extraNote,'Two extra rows');
assert.equal((db.prepare('SELECT count(*) AS n FROM professional_earnings WHERE booking_id=?').get('split') as {n:number}).n,0);
const balance = await created();
assert.equal(balance.stage,'balance');
assert.equal(balance.amount,736,'the final payment is the remaining half plus the extras and their fee');
assert.equal(reads.listBookings('split-client')[0].paymentSummary?.fullyPaid,false);
assert.equal(capture(balance).result,'updated');
const booking = reads.listBookings('split-client')[0];
assert.equal(booking.paymentSummary?.fullyPaid,true);
assert.equal(booking.payments?.length,3);
assert.equal(booking.arrivedAt,appointmentStart);
assert.equal((db.prepare('SELECT count(*) AS n FROM professional_earnings WHERE booking_id=?').get('split') as {n:number}).n,1);
assert.deepEqual({...db.prepare('SELECT gross_amount, commission_amount, net_amount FROM professional_earnings WHERE booking_id=?').get('split')},{gross_amount:1236.01,commission_amount:198,net_amount:1038.01},'the professional receives the extra in full; Konjo keeps its fee on it');
assert.equal(db.prepare('SELECT entry_group FROM ledger_entries GROUP BY entry_group HAVING round(sum(amount),2) <> 0').all().length,0);
const refunds = new SqliteAdminRefundRepository(db,settlement,outbox);
assert.equal(refunds.refundBooking({auditId:'refund-1',adminId:'split-admin',bookingId:'split',occurredAt:now}).result,'refunded');
assert.equal(reads.listBookings('split-client')[0].paymentSummary?.paidAmount,0);
assert.equal(refunds.refundBooking({auditId:'refund-2',adminId:'split-admin',bookingId:'split',occurredAt:now}).result,'already_refunded');
assert.equal(db.prepare('SELECT entry_group FROM ledger_entries GROUP BY entry_group HAVING round(sum(amount),2) <> 0').all().length,0);
migrateSqliteSchema(db);
assert.equal(reads.listBookings('split-client')[0].payments?.length,3);
db.close();

const originalFetch = globalThis.fetch;
try {
  // Chapa v2: hosted checkout, amounts in santim, 20-character merchant references, verify by that reference.
  const gateway = createPaymentGateway('webhook-secret','CHAPA_TEST_PRIV_contract');
  const reference = chapaMerchantReference('booking:split:payment:deposit:1');
  assert.match(reference, /^KJ[0-9A-F]{18}$/, 'merchant references fit Chapa\'s 20-character limit');
  assert.equal(chapaMerchantReference('booking:split:payment:deposit:1'), reference, 'and are stable per attempt');
  globalThis.fetch = (async (url, init) => {
    assert.equal(String(url),'https://api.chapa.global/v2/payments/hosted');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.amount,50001,'ETB 500.01 is sent as 50001 santim');
    assert.equal(body.merchant_reference,reference);
    assert.equal(body.customer.first_name,'Sara');
    assert.equal(body.customer.phone_number,'+251911000000');
    return Response.json({status:'success',data:{checkout_url:'https://checkout.chapa.global/test/payment/hosted/TESTREF'}});
  }) as typeof fetch;
  const intent = await gateway.createIntent({provider:'telebirr',amount:500.01,currency:'ETB',idempotencyKey:'booking:split:payment:deposit:1',
    customer:{firstName:'Sara',lastName:'Bekele',email:'sara@example.com',phoneNumber:'+251911000000'}});
  assert.equal(intent.providerReference,reference);
  assert.equal(intent.checkoutUrl,'https://checkout.chapa.global/test/payment/hosted/TESTREF');
  globalThis.fetch = (async (url) => {
    assert.equal(String(url),`https://api.chapa.global/v2/payments/${reference}/verify`);
    return Response.json({status:'success',data:{merchant_reference:reference,amount:50001,currency:'ETB',status:'SUCCESS'}});
  }) as typeof fetch;
  assert.deepEqual(await gateway.verifyTransaction!(reference),{amount:500.01,currency:'ETB',status:'captured',merchantReference:reference});
  globalThis.fetch = (async () => Response.json({status:'success',data:{merchant_reference:reference,amount:50001,currency:'ETB',status:'PENDING'}})) as typeof fetch;
  assert.equal((await gateway.verifyTransaction!(reference)).status,'pending');
  globalThis.fetch = (async () => Response.json({status:'error',message:'Payment not found',error:{code:'NOT_FOUND'}},{status:404})) as typeof fetch;
  await assert.rejects(() => gateway.verifyTransaction!('wrong-reference'),/NOT_FOUND/);
  globalThis.fetch = (async () => Response.json({status:'error',message:'Merchant reference has been used before',error:{code:'INVALID_STATE'}},{status:409})) as typeof fetch;
  await assert.rejects(() => gateway.createIntent({provider:'telebirr',amount:1,currency:'ETB',idempotencyKey:'booking:split:payment:deposit:2'}),/INVALID_STATE/);
  const push = createNotificationGateway({mode:'provider',deliveryUrl:null,deliveryToken:null});
  const job = {id:'notification',channel:'push' as const,template:'booking_accepted',payload:{bookingId:'split'},destination:'ExpoPushToken[test]',attempt:1};
  let sends = 0;
  globalThis.fetch = (async (url) => {
    assert.equal(String(url),'https://exp.host/--/api/v2/push/send'); sends++;
    return Response.json({data:{status:'ok',id:'ticket-1'}});
  }) as typeof fetch;
  assert.equal(await push.deliver(job),'expo-ticket:ticket-1');
  globalThis.fetch = (async (url) => {
    assert.equal(String(url),'https://exp.host/--/api/v2/push/getReceipts');
    return Response.json({data:{}});
  }) as typeof fetch;
  const pending = {...job,pushTicket:'ticket-1',pushTicketStartedAt:new Date().toISOString()};
  assert.equal(await push.deliver(pending),'expo-ticket:ticket-1');
  globalThis.fetch = (async () => Response.json({data:{'ticket-1':{status:'ok'}}})) as typeof fetch;
  assert.equal(await push.deliver(pending),'ticket-1');
  assert.equal(sends,1,'receipt polling must never resend a push');
  globalThis.fetch = (async () => Response.json({data:{'ticket-1':{status:'error',details:{error:'DeviceNotRegistered'}}}})) as typeof fetch;
  await assert.rejects(() => push.deliver(pending),/DeviceNotRegistered/);
} finally { globalThis.fetch = originalFetch; }
console.log('Split checkout, ownership, retries, balanced settlement/refunds, ETB verification and push receipt contracts passed.');
