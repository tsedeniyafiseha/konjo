import assert from 'node:assert/strict';

import { SupabaseAdminReadRepository } from '../src/adapters/supabase-admin-read-repository.ts';

const calls: Array<{ name: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
const results: unknown[] = [
  { pendingApplications: 1 }, { commissionRateBps: 1800 },
  [{ id: 'professional-1' }], [{ id: 'booking-1' }], [{ id: 'payout-1' }],
  [{ bookingId: 'booking-1' }], [{ id: 'audit-1' }], [{ id: 'zone-1' }],
  [{ id: 'dispute-1' }], [{ id: 'flag-1' }], [{ id: 'incident-1' }],
  [{ id: 'report-1' }], [{ id: 'broadcast-1' }],
  [{ professionalId: 'professional-1', amount: 1100 }],
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
  const repository = new SupabaseAdminReadRepository('https://project.supabase.co/', 'sb_secret_server_only');
  assert.equal((await repository.getSummary()).pendingApplications, 1);
  assert.equal((await repository.getPlatformSettings()).commissionRateBps, 1800);
  assert.equal((await repository.listProfessionals()).length, 1);
  assert.equal((await repository.listBookings({ status: 'accepted', query: 'client' }, 25)).length, 1);
  assert.equal((await repository.listPayouts()).length, 1);
  assert.equal((await repository.listRevenueRows()).length, 1);
  assert.equal((await repository.listAuditLogs(50)).length, 1);
  assert.equal((await repository.listZones()).length, 1);
  assert.equal((await repository.listDisputes()).length, 1);
  assert.equal((await repository.listQualityFlags()).length, 1);
  assert.equal((await repository.listSafetyIncidents()).length, 1);
  assert.equal((await repository.listContentReports()).length, 1);
  assert.equal((await repository.listBroadcasts()).length, 1);
  assert.equal((await repository.listPendingPayouts())[0]?.amount, 1100);
  assert.deepEqual(calls.map((call) => call.name), [
    'get_admin_summary', 'get_admin_platform_settings', 'list_admin_professionals',
    'list_admin_bookings', 'list_admin_payouts', 'list_admin_revenue_rows',
    'list_admin_audit_logs', 'list_admin_zones', 'list_admin_disputes',
    'list_admin_quality_flags', 'list_admin_safety_incidents', 'list_admin_content_reports', 'list_admin_broadcasts',
    'list_admin_pending_payouts',
  ]);
  assert.deepEqual(calls[3].body, {
    p_filters: { status: 'accepted', query: 'client' }, p_limit: 25,
  });
  for (const call of calls) {
    assert.equal(call.headers.apikey, 'sb_secret_server_only');
    assert.equal(call.headers.Authorization, undefined);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Supabase administrator read adapter contract passed.');
