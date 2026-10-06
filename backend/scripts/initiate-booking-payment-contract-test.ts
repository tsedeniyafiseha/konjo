import assert from 'node:assert/strict';

import type { BookingPaymentContext, InitiateBookingPaymentResult } from '../src/application/contracts.ts';
import { InitiateBookingPaymentHandler } from '../src/application/initiate-booking-payment.ts';
import type { BookingPaymentStore, Clock, PaymentGateway } from '../src/application/ports.ts';

const accepted: BookingPaymentContext = {
  bookingId: 'booking-1',
  clientId: 'client-1',
  paymentMethod: 'telebirr',
  amount: 1800,
  currency: 'ETB',
  bookingStatus: 'accepted',
  paymentIntent: null,
};
let context: BookingPaymentContext | null = accepted;
let committed: InitiateBookingPaymentResult = {
  result: 'created',
  paymentIntent: {
    id: 'payment-1', bookingId: 'booking-1', provider: 'telebirr',
    providerReference: 'telebirr-provider-1', status: 'pending', amount: 1800,
    refundedAmount: 0, currency: 'ETB', createdAt: '2026-09-18T12:00:00.000Z',
    updatedAt: '2026-09-18T12:00:00.000Z',
  },
};
let gatewayCalls = 0;
const store: BookingPaymentStore = {
  getBookingPaymentContext(clientId, bookingId) {
    assert.equal(clientId, 'client-1');
    assert.equal(bookingId, 'booking-1');
    return context;
  },
  commitBookingPayment(clientId, bookingId, providerIntent, occurredAt) {
    assert.equal(clientId, 'client-1');
    assert.equal(bookingId, 'booking-1');
    assert.deepEqual(providerIntent, { providerReference: 'telebirr-provider-1', status: 'pending' });
    assert.equal(occurredAt, '2026-09-18T12:00:00.000Z');
    return committed;
  },
};
const gateway: PaymentGateway = {
  async createIntent(input) {
    gatewayCalls += 1;
    assert.deepEqual(input, {
      provider: 'telebirr', amount: 1800, currency: 'ETB',
      idempotencyKey: 'booking:booking-1:payment:v1',
      bookingId: 'booking-1',
    });
    return { providerReference: 'telebirr-provider-1', status: 'pending' };
  },
  verifyWebhook: () => true,
};
const clock: Clock = { now: () => new Date('2026-09-18T12:00:00.000Z') };
const handler = new InitiateBookingPaymentHandler(store, gateway, clock);

assert.deepEqual(await handler.execute('client-1', 'booking-1'), committed);
assert.equal(gatewayCalls, 1);

context = { ...accepted, bookingStatus: 'requested' };
assert.deepEqual(await handler.execute('client-1', 'booking-1'), { result: 'not_accepted' });
assert.equal(gatewayCalls, 1, 'an unaccepted booking must not call the payment provider');

context = null;
assert.deepEqual(await handler.execute('client-1', 'booking-1'), { result: 'not_found' });
assert.equal(gatewayCalls, 1);

context = { ...accepted, paymentIntent: committed.result === 'created' ? committed.paymentIntent : null };
assert.deepEqual(await handler.execute('client-1', 'booking-1'), {
  result: 'duplicate',
  paymentIntent: context.paymentIntent,
});
assert.equal(gatewayCalls, 1, 'an idempotent retry must not call the payment provider');

console.log('Payment starts only after professional acceptance and retries are idempotent.');
