import assert from 'node:assert/strict';

import type { CancelBookingStoreInput } from '../src/application/contracts.ts';
import type { BookingCancellationStore, Clock } from '../src/application/ports.ts';
import { CancelBookingHandler } from '../src/application/cancel-booking.ts';

const occurredAt = '2026-09-18T01:00:00.000Z';
const calls: CancelBookingStoreInput[] = [];
const store: BookingCancellationStore = {
  archiveBooking() { return 'archived'; },
  cancelBooking(input) {
    calls.push(input);
    return 'cancelled';
  },
};
const clock: Clock = { now: () => new Date(occurredAt) };
const handler = new CancelBookingHandler(store, clock);

assert.equal(await handler.execute({ clientId: 'client-1', bookingId: 'booking-1' }), 'cancelled');
assert.deepEqual(calls, [{ clientId: 'client-1', bookingId: 'booking-1', occurredAt }]);

console.log('Cancel-booking application command contracts passed.');
