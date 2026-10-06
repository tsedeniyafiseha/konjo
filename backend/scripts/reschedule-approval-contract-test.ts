import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { configureSqlite, migrateSqliteSchema } from '../src/adapters/sqlite/schema.ts';
import { seedSqliteReferenceData } from '../src/adapters/sqlite/seed-data.ts';
import { SqliteDomainEventOutbox } from '../src/adapters/sqlite/domain-event-outbox.ts';
import { SqliteBookingPaymentSettlement } from '../src/adapters/sqlite/booking-payment-settlement.ts';
import { SqliteBookingRescheduleRepository } from '../src/adapters/sqlite/booking-reschedule-repository.ts';
import { SqliteProfessionalBookingTransitionRepository } from '../src/adapters/sqlite/professional-booking-transition-repository.ts';
import { SqliteAvailabilityRepository } from '../src/adapters/sqlite/availability-repository.ts';
import { SqliteClientReadRepository } from '../src/adapters/sqlite/client-read-repository.ts';

// Moving an accepted booking needs the professional's answer; a requested one just moves.
const db = new DatabaseSync(':memory:');
configureSqlite(db);
migrateSqliteSchema(db);
seedSqliteReferenceData(db);
const now = '2026-10-05T10:00:00.000Z';
const pro = db.prepare('SELECT id, services_json FROM professionals LIMIT 1').get() as unknown as { id: string; services_json: string };
const service = (JSON.parse(pro.services_json) as { id: string; price: number }[])[0];
db.prepare('INSERT INTO users(id,role,email,full_name,password_hash,created_at) VALUES (?,?,?,?,?,?)').run('client-1', 'client', 'c@example.test', 'Client', 'unused', now);
const insert = db.prepare(`INSERT INTO bookings(id,client_request_id,client_id,professional_id,service_id,service_name,date_iso,time,
  address_label,address_zone,address_detail,payment_method,service_price,travel_fee,total,status,accept_by,created_at,payment_plan)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
insert.run('accepted-1', 'req-1', 'client-1', pro.id, service.id, 'Test', '2099-01-05', '10:00 AM', 'Home', 'Bole', 'Addr', 'telebirr', service.price, 0, service.price, 'accepted', now, now, 'split');
insert.run('requested-1', 'req-2', 'client-1', pro.id, service.id, 'Test', '2099-01-06', '10:00 AM', 'Home', 'Bole', 'Addr', 'telebirr', service.price, 0, service.price, 'requested', now, now, 'split');
const outbox = new SqliteDomainEventOutbox(db);
const reschedule = new SqliteBookingRescheduleRepository(db, new SqliteAvailabilityRepository(db), outbox);
const transitions = new SqliteProfessionalBookingTransitionRepository(db, new SqliteBookingPaymentSettlement(db, outbox), outbox);
const reads = new SqliteClientReadRepository(db);
const booking = (id: string) => reads.listBookings('client-1').find((item) => item.id === id)!;
const events = () => (db.prepare('SELECT event_type FROM domain_event_outbox ORDER BY rowid').all() as unknown as { event_type: string }[]).map((row) => row.event_type);

// Requested booking: moved straight away.
assert.equal(reschedule.rescheduleBooking({ clientId: 'client-1', bookingId: 'requested-1', dateIso: '2099-01-06', time: '2:00 PM', occurredAt: now }).result, 'updated');
assert.equal(booking('requested-1').time, '2:00 PM');
assert.equal(booking('requested-1').proposedTime, null);

// Accepted booking: a proposal the professional must answer.
assert.equal(reschedule.rescheduleBooking({ clientId: 'client-1', bookingId: 'accepted-1', dateIso: '2099-01-05', time: '4:00 PM', occurredAt: now }).result, 'updated');
assert.equal(booking('accepted-1').time, '10:00 AM', 'the confirmed time stays until the professional answers');
assert.equal(booking('accepted-1').proposedTime, '4:00 PM');
assert.equal(booking('accepted-1').status, 'accepted');
assert.equal(transitions.transitionBooking({ professionalId: 'someone-else', bookingId: 'accepted-1', action: 'approve-reschedule', occurredAt: now }), 'not_found');
assert.equal(transitions.transitionBooking({ professionalId: pro.id, bookingId: 'requested-1', action: 'approve-reschedule', occurredAt: now }), 'invalid_transition', 'nothing to approve on a booking without a proposal');
assert.equal(transitions.transitionBooking({ professionalId: pro.id, bookingId: 'accepted-1', action: 'decline-reschedule', occurredAt: now }), 'updated');
assert.equal(booking('accepted-1').time, '10:00 AM');
assert.equal(booking('accepted-1').proposedTime, null);
assert.equal(reschedule.rescheduleBooking({ clientId: 'client-1', bookingId: 'accepted-1', dateIso: '2099-01-05', time: '6:00 PM', occurredAt: now }).result, 'updated');
assert.equal(transitions.transitionBooking({ professionalId: pro.id, bookingId: 'accepted-1', action: 'approve-reschedule', occurredAt: now }), 'updated');
assert.equal(booking('accepted-1').time, '6:00 PM', 'approval moves the booking');
assert.equal(booking('accepted-1').proposedTime, null);
assert.equal(booking('accepted-1').status, 'accepted', 'the booking continues through the normal flow');
assert.deepEqual(events(), ['BookingRescheduled', 'BookingRescheduled', 'BookingRescheduleDeclined', 'BookingRescheduled', 'BookingRescheduleAccepted']);
db.close();

console.log('Reschedule approval contracts passed.');
