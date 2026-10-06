import assert from 'node:assert/strict';

import type { BookingCreationResult, BookingQuote, CreateBookingCommandInput } from '../src/application/contracts.ts';
import { SupabaseBookingRepository } from '../src/adapters/supabase-booking-repository.ts';

const input: CreateBookingCommandInput = {
  requestId: 'booking-request-0001',
  clientId: '94000000-0000-4000-8000-000000000002',
  professionalId: '94000000-0000-4000-8000-000000000001',
  serviceId: '94000000-0000-4000-8000-000000000010',
  dateIso: '2026-09-20',
  time: '9:00 AM',
  addressLabel: 'Home',
  addressZone: 'Bole',
  addressDetail: 'Apartment 10 near the main road',
  femaleOnly: false,
  paymentMethod: 'cash',
};
const quote: BookingQuote = {
  serviceName: 'Silk press', addressZone: 'Bole', servicePrice: 1200,
  serviceFee: 216, travelFee: 120, total: 1536, commissionRateBps: 1800,
};
const bookingResult = {
  booking: { id: 'booking-1' },
  paymentIntent: null,
  duplicate: false,
} as BookingCreationResult;
const paymentContext = {
  bookingId: 'booking-1', clientId: input.clientId, paymentMethod: 'cash', amount: 1320,
  currency: 'ETB', bookingStatus: 'accepted', paymentIntent: null,
};
const paymentIntent = {
  id: 'payment-1', bookingId: 'booking-1', provider: 'cash', providerReference: 'cash-provider-1',
  status: 'cash_due', amount: 1320, refundedAmount: 0, currency: 'ETB',
  createdAt: '2026-09-19T00:00:00.000Z', updatedAt: '2026-09-19T00:00:00.000Z',
};
const initiatedPayment = { result: 'created', paymentIntent };
const calls: Array<{ name: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
const rescheduled = { result: 'updated', booking: bookingResult.booking };
const review = { result: 'created', review: { id: 'review-1' } };
const results: unknown[] = [
  null,
  quote,
  bookingResult,
  paymentContext,
  initiatedPayment,
  [bookingResult.booking],
  paymentIntent,
  rescheduled,
  'cancelled',
  review,
  'female_only_unavailable',
  null,
];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (request, init = {}) => {
  calls.push({
    name: String(request).split('/rpc/')[1],
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
    headers: init.headers as Record<string, string>,
  });
  return Response.json(results.shift());
};

try {
  const repository = new SupabaseBookingRepository(
    'https://project.supabase.co/',
    'sb_secret_server_only',
  );
  assert.equal(await repository.findBookingByRequest(input.clientId, input.requestId), null);
  assert.deepEqual(await repository.quoteBooking(input), quote);
  assert.deepEqual(await repository.commitBooking(input, quote), bookingResult);
  assert.deepEqual(await repository.getBookingPaymentContext(input.clientId, 'booking-1'), paymentContext);
  assert.deepEqual(await repository.commitBookingPayment(
    input.clientId,
    'booking-1',
    { providerReference: 'cash-provider-1', status: 'cash_due' },
    '2026-09-19T00:00:00.000Z',
  ), initiatedPayment);
  assert.equal((await repository.listBookings(input.clientId)).length, 1);
  assert.deepEqual(await repository.getPaymentIntent(input.clientId, 'payment-1'), paymentIntent);
  assert.deepEqual(await repository.rescheduleBooking({
    clientId: input.clientId,
    bookingId: 'booking-1',
    dateIso: '2026-09-21',
    time: '10:30 AM',
    occurredAt: '2026-09-19T00:00:00.000Z',
  }), rescheduled);
  assert.equal(await repository.cancelBooking({
    clientId: input.clientId,
    bookingId: 'booking-1',
    occurredAt: '2026-09-19T00:00:00.000Z',
  }), 'cancelled');
  assert.deepEqual(await repository.submitReview({
    clientId: input.clientId,
    bookingId: 'booking-1',
    reviewId: 'review-1',
    techniqueRating: 5,
    professionalismRating: 4,
    tags: ['Gentle'],
    reviewText: 'Excellent service.',
    occurredAt: '2026-09-19T00:00:00.000Z',
  }), review);
  assert.equal(await repository.explainQuoteFailure(input), 'female_only_unavailable');
  assert.equal(await repository.explainQuoteFailure(input), null);
  assert.deepEqual(calls.map((call) => call.name), [
    'find_marketplace_booking_by_request',
    'quote_marketplace_booking',
    'commit_marketplace_booking',
    'get_booking_payment_context',
    'commit_booking_payment_intent',
    'list_client_bookings',
    'get_client_payment_intent',
    'reschedule_client_booking',
    'cancel_client_booking',
    'submit_client_booking_review',
    'explain_marketplace_booking_quote',
    'explain_marketplace_booking_quote',
  ]);
  assert.deepEqual(calls[2].body, {
    p_input: input,
    p_quote: quote,
  });
  assert.deepEqual(calls[3].body, { p_client_id: input.clientId, p_booking_id: 'booking-1' });
  assert.deepEqual(calls[4].body, {
    p_client_id: input.clientId,
    p_booking_id: 'booking-1',
    p_provider_intent: { providerReference: 'cash-provider-1', status: 'cash_due' },
    p_occurred_at: '2026-09-19T00:00:00.000Z',
  });
  for (const call of calls) {
    assert.equal(call.headers.apikey, 'sb_secret_server_only');
    assert.equal(call.headers.Authorization, undefined);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Supabase booking adapter contract passed.');
