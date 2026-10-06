import assert from 'node:assert/strict';

import type { ApiPaymentIntent } from '../../shared/api-contracts.ts';
import type { BookingPaymentContext, ProcessPaymentEventStoreInput } from '../src/application/contracts.ts';
import type { BookingPaymentStore, PaymentEventStore, PaymentGateway } from '../src/application/ports.ts';
import { PaymentProviderError } from '../src/application/ports.ts';
import { VerifyBookingPaymentHandler } from '../src/application/verify-booking-payment.ts';

const occurredAt = '2026-09-26T09:00:00.000Z';
const reference = 'KJ0123456789ABCDEF01';
function intent(overrides: Partial<ApiPaymentIntent> = {}): ApiPaymentIntent {
  return { id: 'intent-1', bookingId: 'booking-1', provider: 'telebirr', providerReference: reference, status: 'pending',
    amount: 500, refundedAmount: 0, currency: 'ETB', checkoutUrl: 'https://checkout.chapa.global/test/payment/hosted/X', createdAt: occurredAt, updatedAt: occurredAt, stage: 'deposit', attempt: 1, ...overrides };
}
let context: BookingPaymentContext | null = { bookingId: 'booking-1', clientId: 'client-1', paymentMethod: 'telebirr', amount: 500, currency: 'ETB', bookingStatus: 'accepted', stage: 'deposit', attempt: 1, paymentIntent: intent() };
const events: ProcessPaymentEventStoreInput[] = [];
let eventResult: 'updated' | 'duplicate' | 'invalid_transition' = 'updated';
const payments: BookingPaymentStore = { getBookingPaymentContext: () => context, commitBookingPayment: () => { throw new Error('unused'); } };
const store: PaymentEventStore = { processPaymentEvent(input) { events.push(input); return eventResult === 'invalid_transition' ? { result: 'invalid_transition' } : { result: eventResult, paymentIntent: intent({ status: input.status }) }; } };
let providerStatus: 'captured' | 'failed' | 'pending' = 'captured';
let providerDown = false;
const gateway: PaymentGateway = {
  async verifyTransaction(ref) { if (providerDown) throw new Error('timeout'); assert.equal(ref, reference); return { amount: 500, currency: 'ETB', status: providerStatus, merchantReference: ref }; },
  async createIntent() { return { providerReference: 'unused', status: 'pending' }; },
  verifyWebhook: () => true,
};
const handler = new VerifyBookingPaymentHandler(payments, store, gateway, { hash: (value) => `hash:${value}` }, { now: () => new Date(occurredAt) });

// A captured payment is recorded through the event store under the webhook's event id.
let result = await handler.execute('client-1', 'booking-1');
assert.equal(result.result, 'verified');
assert.equal(result.result === 'verified' && result.status, 'captured');
assert.equal(events.length, 1);
assert.equal(events[0].eventId, `chapa:${reference}:captured`);
assert.equal(events[0].verifiedAmount, 500);
assert.equal(events[0].payloadHash, `hash:${JSON.stringify({ provider: 'telebirr', reference, status: 'captured', amount: 500, currency: 'ETB' })}`);

// Still pending at the provider: nothing is recorded.
providerStatus = 'pending';
result = await handler.execute('client-1', 'booking-1');
assert.deepEqual(result, { result: 'verified', status: 'pending', paymentIntent: intent() });
assert.equal(events.length, 1);

// Already settled by the webhook: the current intent is returned, not an error.
providerStatus = 'captured';
eventResult = 'invalid_transition';
result = await handler.execute('client-1', 'booking-1');
assert.equal(result.result, 'verified');

// Provider outage surfaces as a provider error for the route to map to 502.
providerDown = true;
await assert.rejects(handler.execute('client-1', 'booking-1'), PaymentProviderError);
providerDown = false;

// Sandbox and cash intents are never sent to the provider.
context = { ...context!, paymentIntent: intent({ providerReference: 'chapa_sandbox_0123456789abcdef0123456789abcdef' }) };
assert.equal((await handler.execute('client-1', 'booking-1')).result, 'unsupported');
context = { ...context!, paymentIntent: intent({ provider: 'cash', providerReference: 'cash_x', status: 'cash_due' }) };
assert.equal((await handler.execute('client-1', 'booking-1')).result, 'no_pending_payment');
context = { ...context!, paymentIntent: null };
assert.equal((await handler.execute('client-1', 'booking-1')).result, 'no_pending_payment');
context = null;
assert.equal((await handler.execute('client-1', 'booking-1')).result, 'not_found');

console.log('Booking payment verification contracts passed.');
