import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { configureSqlite, migrateSqliteSchema } from '../src/adapters/sqlite/schema.ts';
import { seedSqliteReferenceData } from '../src/adapters/sqlite/seed-data.ts';
import { SqliteDomainEventOutbox } from '../src/adapters/sqlite/domain-event-outbox.ts';
import { SqliteBookingCommandRepository } from '../src/adapters/sqlite/booking-command-repository.ts';
import { SqliteBookingPaymentSettlement } from '../src/adapters/sqlite/booking-payment-settlement.ts';
import { SqliteProfessionalBookingTransitionRepository } from '../src/adapters/sqlite/professional-booking-transition-repository.ts';
import { SqliteAvailabilityRepository } from '../src/adapters/sqlite/availability-repository.ts';
import { SqliteClientReadRepository } from '../src/adapters/sqlite/client-read-repository.ts';
import type { BookingRow } from '../src/adapters/sqlite/booking-records.ts';
import type { CreateBookingCommandInput } from '../src/application/contracts.ts';

// Rewards: 20% off the first booking, and a 20% coupon after every 10th
// completed booking, funded by Konjo. Mirrors the Postgres functions.
const db = new DatabaseSync(':memory:');
configureSqlite(db);
migrateSqliteSchema(db);
seedSqliteReferenceData(db);
const now = '2026-10-03T10:00:00.000Z';
const appointmentDate = '2099-01-05'; // a Monday
const pro = db.prepare('SELECT id, services_json FROM professionals LIMIT 1').get() as unknown as { id: string; services_json: string };
const service = (JSON.parse(pro.services_json) as { id: string; price: number }[])[0];
db.prepare("UPDATE professional_catalog_working_days SET hours = '12:00 AM – 11:59 PM' WHERE professional_id = ? AND day = 'Monday'").run(pro.id);
for (const client of ['first-timer', 'regular']) {
  db.prepare('INSERT INTO users(id,role,email,full_name,password_hash,created_at) VALUES (?,?,?,?,?,?)')
    .run(client, 'client', `${client}@example.test`, client, 'unused', now);
}
const outbox = new SqliteDomainEventOutbox(db);
const settlement = new SqliteBookingPaymentSettlement(db, outbox);
const commands = new SqliteBookingCommandRepository(db, new SqliteAvailabilityRepository(db), outbox);
const transitions = new SqliteProfessionalBookingTransitionRepository(db, settlement, outbox);
const reads = new SqliteClientReadRepository(db);
const input = (clientId: string, requestId: string, time = '10:00 AM'): CreateBookingCommandInput => ({
  requestId, clientId, professionalId: pro.id, serviceId: service.id, dateIso: appointmentDate, time,
  addressLabel: 'Home', addressZone: 'Bole', addressDetail: 'Blue gate near the main road', femaleOnly: false, paymentMethod: 'telebirr',
});
const expectedFee = Math.round(service.price * 0.18);
const expectedDiscount = Math.round(service.price * 0.2);

// A first-timer sees the welcome discount before booking, and it is applied on commit.
assert.deepEqual(reads.getRewards('first-timer').offer, { reason: 'first_booking', rateBps: 2000 });
const welcomeQuote = commands.quoteBooking(input('first-timer', 'welcome-request-1'));
assert.ok(welcomeQuote);
assert.equal(welcomeQuote.discountReason, 'first_booking');
assert.equal(welcomeQuote.discountAmount, expectedDiscount);
assert.equal(welcomeQuote.total, service.price + expectedFee - expectedDiscount, 'the discount comes off the client total');
const welcome = commands.commitBooking(input('first-timer', 'welcome-request-1'), welcomeQuote);
assert.ok(welcome);
assert.equal(welcome.booking.discountAmount, expectedDiscount);
assert.equal(welcome.booking.discountReason, 'first_booking');
assert.equal(welcome.booking.total, welcomeQuote.total);
assert.equal(reads.listBookings('first-timer')[0]?.paymentSummary?.depositAmount, Math.ceil((service.price + expectedFee - expectedDiscount) / 2), 'the deposit is half of the discounted booking');
assert.equal(reads.getRewards('first-timer').offer, null, 'the welcome discount is used once');
const welcomeRow = db.prepare('SELECT * FROM bookings WHERE id = ?').get(welcome.booking.id) as unknown as BookingRow;
assert.equal(settlement.commissionForBooking(welcomeRow), expectedFee - expectedDiscount, 'Konjo funds the discount out of its commission');
// A cancelled first booking gives the welcome discount back.
db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(welcome.booking.id);
assert.deepEqual(reads.getRewards('first-timer').offer, { reason: 'first_booking', rateBps: 2000 });

// A regular client earns a coupon on their 10th completed booking.
const insertBooking = db.prepare(`INSERT INTO bookings(id,client_request_id,client_id,professional_id,service_id,service_name,date_iso,time,
  address_label,address_zone,address_detail,payment_method,service_price,travel_fee,total,status,accept_by,created_at,payment_plan,started_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
for (let index = 1; index <= 10; index += 1) {
  insertBooking.run(`regular-${index}`, `regular-request-${index}`, 'regular', pro.id, service.id, 'Test service', '2026-09-01', '10:00 AM',
    'Home', 'Bole', 'Test address', 'telebirr', service.price, 0, service.price, index < 10 ? 'completed' : 'in_progress', now, now, 'split', now);
}
assert.equal(reads.getRewards('regular').bookingsUntilNextCoupon, 1);
assert.equal(reads.getRewards('regular').availableCoupons, 0);
assert.equal(reads.getRewards('regular').offer, null);
assert.equal(transitions.transitionBooking({ professionalId: pro.id, bookingId: 'regular-10', action: 'complete', occurredAt: now }), 'updated');
let rewards = reads.getRewards('regular');
assert.equal(rewards.completedBookings, 10);
assert.equal(rewards.availableCoupons, 1);
assert.equal(rewards.bookingsUntilNextCoupon, 10);
assert.deepEqual(rewards.offer, { reason: 'loyalty', rateBps: 2000 });

// The coupon is applied to the next booking and spent by it.
const loyaltyQuote = commands.quoteBooking(input('regular', 'loyalty-request-1', '2:00 PM'));
assert.ok(loyaltyQuote);
assert.equal(loyaltyQuote.discountReason, 'loyalty');
assert.equal(loyaltyQuote.discountAmount, expectedDiscount);
const loyalty = commands.commitBooking(input('regular', 'loyalty-request-1', '2:00 PM'), loyaltyQuote);
assert.ok(loyalty);
assert.equal(loyalty.booking.discountReason, 'loyalty');
rewards = reads.getRewards('regular');
assert.equal(rewards.availableCoupons, 0);
assert.equal(rewards.offer, null);
assert.equal((commands.quoteBooking(input('regular', 'plain-request-1', '7:00 PM'))?.discountAmount ?? -1), 0, 'no reward on an ordinary booking');
// Cancelling the booking frees the coupon again.
db.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").run(loyalty.booking.id);
rewards = reads.getRewards('regular');
assert.equal(rewards.availableCoupons, 1);
assert.deepEqual(rewards.offer, { reason: 'loyalty', rateBps: 2000 });
db.close();

console.log('Client rewards contracts passed.');
