import assert from 'node:assert/strict';

import type { ArchiveBookingStoreInput } from '../src/application/contracts.ts';
import type { BookingCancellationStore } from '../src/application/ports.ts';
import { ArchiveBookingHandler } from '../src/application/archive-booking.ts';

const occurredAt = '2026-09-26T10:00:00.000Z';
const calls: ArchiveBookingStoreInput[] = [];
const store: BookingCancellationStore = {
  cancelBooking() { throw new Error('unused'); },
  archiveBooking(input) {
    calls.push(input);
    return input.bookingId === 'open' ? 'not_allowed' : input.bookingId === 'missing' ? 'not_found' : 'archived';
  },
};
const handler = new ArchiveBookingHandler(store, { now: () => new Date(occurredAt) });

assert.equal(await handler.execute({ clientId: 'client-1', bookingId: 'done' }), 'archived');
assert.deepEqual(calls, [{ clientId: 'client-1', bookingId: 'done', occurredAt }], 'the clock stamps when the client hid the booking');
assert.equal(await handler.execute({ clientId: 'client-1', bookingId: 'open' }), 'not_allowed', 'only finished bookings can leave the history');
assert.equal(await handler.execute({ clientId: 'client-1', bookingId: 'missing' }), 'not_found');

console.log('Client booking archive contracts passed.');
