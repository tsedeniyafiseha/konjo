import assert from 'node:assert/strict';

import type { RescheduleBookingStoreInput } from '../src/application/contracts.ts';
import type { BookingRescheduleStore, Clock } from '../src/application/ports.ts';
import { RescheduleBookingHandler } from '../src/application/reschedule-booking.ts';

const occurredAt = '2026-09-17T20:00:00.000Z';
const calls: RescheduleBookingStoreInput[] = [];
const store: BookingRescheduleStore = {
  rescheduleBooking(input) {
    calls.push(input);
    return { result: 'slot_unavailable' };
  },
};
const clock: Clock = { now: () => new Date(occurredAt) };
const handler = new RescheduleBookingHandler(store, clock);

assert.deepEqual(await handler.execute({
  clientId: 'client-1',
  bookingId: 'booking-1',
  dateIso: '2026-09-21',
  time: '12:00 PM',
}), { result: 'slot_unavailable' });
assert.deepEqual(calls, [{
  clientId: 'client-1',
  bookingId: 'booking-1',
  dateIso: '2026-09-21',
  time: '12:00 PM',
  occurredAt,
}]);

console.log('Reschedule-booking application command contracts passed.');
