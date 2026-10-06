import assert from 'node:assert/strict';

import type { SubmitBookingReviewStoreInput } from '../src/application/contracts.ts';
import type { BookingReviewStore, Clock, IdGenerator } from '../src/application/ports.ts';
import { SubmitBookingReviewHandler } from '../src/application/submit-booking-review.ts';

const occurredAt = '2026-09-18T03:00:00.000Z';
const calls: SubmitBookingReviewStoreInput[] = [];
const store: BookingReviewStore = {
  submitReview(input) {
    calls.push(input);
    return { result: 'not_completed' };
  },
};
const ids: IdGenerator = { next: () => 'review-1' };
const clock: Clock = { now: () => new Date(occurredAt) };
const handler = new SubmitBookingReviewHandler(store, ids, clock);

assert.deepEqual(await handler.execute({
  clientId: 'client-1',
  bookingId: 'booking-1',
  techniqueRating: 5,
  professionalismRating: 4,
  tags: [' Gentle ', 'On time', 'Gentle'],
  reviewText: 'Careful and professional.',
}), { result: 'not_completed' });
assert.deepEqual(calls, [{
  clientId: 'client-1',
  bookingId: 'booking-1',
  techniqueRating: 5,
  professionalismRating: 4,
  tags: ['Gentle', 'On time'],
  reviewText: 'Careful and professional.',
  reviewId: 'review-1',
  occurredAt,
}]);

console.log('Submit-booking-review application command contracts passed.');
