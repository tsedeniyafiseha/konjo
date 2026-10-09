import assert from 'node:assert/strict';

import { SupabaseTrustSafetyRepository } from '../src/adapters/supabase-trust-safety-repository.ts';

const occurredAt = '2026-09-19T00:00:00.000Z';
const calls: Array<{ name: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
const safety = { id: 'incident-1', status: 'open' };
const dispute = { id: 'dispute-1', status: 'open' };
const quality = { id: 'flag-1', status: 'resolved' };
const report = { id: 'report-1', status: 'open' };
const results: unknown[] = [
  { result: 'created', incident: safety }, { result: 'created', report }, ['professional-1'], true,
  dispute, { ...safety, status: 'resolved' }, quality, { ...dispute, status: 'resolved' },
  { ...report, status: 'resolved' },
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
  assert.equal((await repository.createContentReport({
    reportId: 'report-1', reportedById: 'client-1', targetType: 'professional',
    targetId: 'professional-1', reason: 'safety_concern', details: 'Unsafe messages.', occurredAt,
  })).result, 'created');
  assert.deepEqual(await repository.listBlockedProfessionals('client-1'), ['professional-1']);
  assert.equal(await repository.setProfessionalBlocked({
    clientId: 'client-1', professionalId: 'professional-1', blocked: true, occurredAt,
  }), true);
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
  assert.equal((await repository.resolveContentReport({
    auditId: 'audit-4', adminId: 'admin-1', reportId: 'report-1', status: 'resolved',
    action: 'suspend_professional', resolution: 'Account suspended.', occurredAt,
  }))?.status, 'resolved');
  assert.deepEqual(calls.map((call) => call.name), [
    'open_safety_incident', 'create_content_report', 'list_client_blocked_professionals',
    'set_client_professional_block', 'open_booking_dispute', 'resolve_safety_incident',
    'resolve_professional_quality_flag', 'resolve_booking_dispute', 'resolve_content_report',
  ]);
  assert.equal(calls[0].body.p_accuracy_meters, 12);
  assert.equal(calls[1].body.p_target_type, 'professional');
  for (const call of calls) {
    assert.equal(call.headers.apikey, 'sb_secret_server_only');
    assert.equal(call.headers.Authorization, undefined);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Supabase trust-and-safety adapter contract passed.');
