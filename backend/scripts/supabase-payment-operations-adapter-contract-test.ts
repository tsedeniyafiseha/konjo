import assert from 'node:assert/strict';

import { SupabasePaymentOperationsRepository } from '../src/adapters/supabase-payment-operations-repository.ts';

const calls: Array<{ name: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
const paymentResult = { result: 'updated', paymentIntent: { id: 'payment-1' } };
const payout = { id: 'payout-1', professionalId: 'professional-1', status: 'queued' };
const results: unknown[] = [paymentResult, payout, { ...payout, status: 'paid' }];
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
  const repository = new SupabasePaymentOperationsRepository('https://project.supabase.co/', 'sb_secret_server_only');
  assert.deepEqual(await repository.processPaymentEvent({
    eventId: 'event-1', provider: 'card', providerReference: 'provider-1',
    status: 'captured', payloadHash: 'a'.repeat(64), occurredAt: '2026-09-19T00:00:00.000Z',
  }), paymentResult);
  assert.deepEqual(await repository.queuePayout({
    payoutId: 'payout-1', professionalId: 'professional-1', occurredAt: '2026-09-19T00:00:00.000Z',
  }), payout);
  assert.equal((await repository.settlePayout({
    payoutId: 'payout-1', professionalId: 'professional-1', occurredAt: '2026-09-19T00:00:00.000Z',
  }))?.status, 'paid');
  assert.deepEqual(calls.map((call) => call.name), [
    'process_provider_payment_event', 'queue_professional_payout', 'settle_professional_payout',
  ]);
  for (const call of calls) {
    assert.equal(call.headers.apikey, 'sb_secret_server_only');
    assert.equal(call.headers.Authorization, undefined);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Supabase payment operations adapter contract passed.');
