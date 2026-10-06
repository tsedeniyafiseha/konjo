import assert from 'node:assert/strict';

import type { ProcessPaymentEventStoreInput } from '../src/application/contracts.ts';
import type {
  Clock,
  PayloadHasher,
  PaymentEventStore,
  PaymentGateway,
} from '../src/application/ports.ts';
import { ProcessPaymentWebhookHandler } from '../src/application/process-payment-webhook.ts';

const occurredAt = '2026-09-18T04:00:00.000Z';
const calls: ProcessPaymentEventStoreInput[] = [];
const store: PaymentEventStore = {
  processPaymentEvent(input) {
    calls.push(input);
    return { result: 'not_found' };
  },
};
const gateway: PaymentGateway = {
  async createIntent() {
    return { providerReference: 'unused', status: 'pending' };
  },
  verifyWebhook(rawBody, signature) {
    return rawBody === '{"event":1}' && signature === 'valid-signature';
  },
};
const hasher: PayloadHasher = { hash: (value) => `hash:${value}` };
const clock: Clock = { now: () => new Date(occurredAt) };
const handler = new ProcessPaymentWebhookHandler(store, gateway, hasher, clock);

assert.equal(handler.verify('{"event":1}', 'valid-signature'), true);
assert.equal(handler.verify('{"event":1}', 'invalid-signature'), false);
assert.deepEqual(await handler.execute({
  rawBody: '{"event":1}',
  eventId: 'provider-event-1',
  provider: 'telebirr',
  providerReference: 'telebirr-reference-1',
  status: 'captured',
}), { result: 'not_found' });
assert.deepEqual(calls, [{
  eventId: 'provider-event-1',
  provider: 'telebirr',
  providerReference: 'telebirr-reference-1',
  status: 'captured',
  payloadHash: 'hash:{"event":1}',
  occurredAt,
}]);

console.log('Payment webhook application command contracts passed.');
