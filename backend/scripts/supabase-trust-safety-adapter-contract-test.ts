import assert from 'node:assert/strict';

import { SupabaseTrustSafetyRepository } from '../src/adapters/supabase-trust-safety-repository.ts';

const occurredAt = '2026-09-19T00:00:00.000Z';
const calls: Array<{ name: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
const safety = { id: 'incident-1', status: 'open' };
const dispute = { id: 'dispute-1', status: 'open' };
const quality = { id: 'flag-1', status: 'resolved' };
const results: unknown[] = [
  { result: 'created', incident: safety }, dispute, { ...safety, status: 'resolved' },
  quality, { ...dispute, status: 'resolved' },
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
  const repository = new SupabaseTrustSafetyRepository('https://project.supabase.co/', 'sb_secret_server_only');
  assert.equal((await repository.openSafetyIncident({
    incidentId: 'incident-1', userId: 'client-1', role: 'client', bookingId: 'booking-1',
    latitude: 9.01, longitude: 38.76, accuracyMeters: 12, occurredAt,
  })).result, 'created');
  assert.equal((await repository.openBookingDispute({
    disputeId: 'dispute-1', clientId: 'client-1', bookingId: 'booking-1',
    reason: 'Service did not match the booking.', occurredAt,
  }))?.id, 'dispute-1');
  assert.equal((await repository.resolveSafetyIncident({
    auditId: 'audit-1', adminId: 'admin-1', incidentId: 'incident-1',
    resolution: 'Participants contacted.', occurredAt,
  }))?.status, 'resolved');
  assert.equal((await repository.resolveQualityFlag({
    auditId: 'audit-2', adminId: 'admin-1', flagId: 'flag-1',
    resolution: 'Coaching completed.', action: 'restore', occurredAt,
  }))?.id, 'flag-1');
  assert.equal((await repository.resolveBookingDispute({
    auditId: 'audit-3', adminId: 'admin-1', disputeId: 'dispute-1', status: 'resolved',
    resolution: 'Client contacted.', occurredAt,
  }))?.status, 'resolved');
  assert.deepEqual(calls.map((call) => call.name), [
    'open_safety_incident', 'open_booking_dispute', 'resolve_safety_incident',
    'resolve_professional_quality_flag', 'resolve_booking_dispute',
  ]);
  assert.equal(calls[0].body.p_accuracy_meters, 12);
  for (const call of calls) {
    assert.equal(call.headers.apikey, 'sb_secret_server_only');
    assert.equal(call.headers.Authorization, undefined);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Supabase trust-and-safety adapter contract passed.');
