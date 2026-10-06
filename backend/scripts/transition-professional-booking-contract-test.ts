import assert from 'node:assert/strict';

import type { TransitionProfessionalBookingStoreInput } from '../src/application/contracts.ts';
import type { Clock, ProfessionalBookingTransitionStore } from '../src/application/ports.ts';
import { TransitionProfessionalBookingHandler } from '../src/application/transition-professional-booking.ts';

const occurredAt = '2026-09-18T02:00:00.000Z';
const calls: TransitionProfessionalBookingStoreInput[] = [];
const store: ProfessionalBookingTransitionStore = {
  transitionBooking(input) {
    calls.push(input);
    return 'updated';
  },
};
const clock: Clock = { now: () => new Date(occurredAt) };
const handler = new TransitionProfessionalBookingHandler(store, clock);

assert.equal(await handler.execute({
  professionalId: 'professional-1',
  bookingId: 'booking-1',
  action: 'travel',
}), 'updated');
assert.equal(await handler.execute({
  professionalId: 'professional-1',
  bookingId: 'booking-1',
  action: 'accept',
  travelFee: 250,
}), 'updated');
// At checkout the professional names the extra services; the handler passes
// them to the store untouched, which prices and records them.
assert.equal(await handler.execute({
  professionalId: 'professional-1',
  bookingId: 'booking-1',
  action: 'complete',
  extraAmount: 300,
  extraNote: 'Added two rows of braids',
}), 'updated');
assert.deepEqual(calls, [{
  professionalId: 'professional-1',
  bookingId: 'booking-1',
  action: 'travel',
  occurredAt,
}, {
  professionalId: 'professional-1',
  bookingId: 'booking-1',
  action: 'accept',
  travelFee: 250,
  occurredAt,
}, {
  professionalId: 'professional-1',
  bookingId: 'booking-1',
  action: 'complete',
  extraAmount: 300,
  extraNote: 'Added two rows of braids',
  occurredAt,
}]);

console.log('Professional booking transition application command contracts passed.');
