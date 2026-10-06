import assert from 'node:assert/strict';

import { SupabaseAdminOperationsRepository } from '../src/adapters/supabase-admin-operations-repository.ts';

const occurredAt = '2026-09-19T00:00:00.000Z';
const base = { auditId: 'audit-1', adminId: 'admin-1', occurredAt };
const calls: Array<{ name: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
const results: unknown[] = [
  { id: 'category-1' }, { commissionRateBps: 1800 }, { travelFeeCap: 500 }, { id: 'zone-1' },
  { id: 'promotion-1', active: true }, { id: 'promotion-1', active: false },
  { id: 'broadcast-1' }, { id: 'professional-1', featured: true },
  { id: 'professional-1', approvalStatus: 'suspended' },
  { result: 'not_found' }, null,
  { id: 'payout-1', status: 'queued' }, { id: 'payout-1', status: 'paid', paidReference: 'TB-1' },
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
  const repository = new SupabaseAdminOperationsRepository('https://project.supabase.co/', 'sb_secret_server_only');
  await repository.upsertCategory({ ...base, id: 'category-1', slug: 'hair', name: 'Hair', active: true, sortOrder: 1 });
  await repository.updateCommission({ ...base, commissionRateBps: 1800 });
  await repository.updateTravelFeeCap({ ...base, travelFeeCap: 500 });
  await repository.upsertZone({ ...base, id: 'zone-1', label: 'Bole', travelFee: 120, active: true });
  await repository.createPromotion({ ...base, promotionId: 'promotion-1', code: 'WELCOME', description: 'Welcome', discountPercent: 10, active: true, startsAt: occurredAt, endsAt: '2026-10-01T00:00:00.000Z' });
  await repository.setPromotionActive({ ...base, promotionId: 'promotion-1', active: false });
  await repository.createBroadcast({ ...base, broadcastId: 'broadcast-1', audience: 'clients', message: 'Welcome' });
  await repository.updateProfessional({ ...base, professionalId: 'professional-1', featured: true, femaleOnlyEligible: true });
  await repository.setProfessionalState({ ...base, professionalId: 'professional-1', action: 'suspend' });
  assert.equal((await repository.refundBooking({ ...base, bookingId: 'booking-1' })).result, 'not_found');
  await repository.record({ ...base, action: 'bookings.exported', targetType: 'booking', targetId: null, metadata: { count: 1 } });
  assert.equal((await repository.queueAdminPayout({ ...base, professionalId: 'professional-1', payoutId: 'payout-1' }))?.status, 'queued');
  assert.equal((await repository.settleAdminPayout({
    ...base, professionalId: 'professional-1', payoutId: 'payout-1', paidReference: 'TB-1', paidNote: null,
  }))?.paidReference, 'TB-1');
  assert.deepEqual(calls.map((call) => call.name), [
    'upsert_admin_service_category', 'update_admin_commission', 'update_admin_travel_fee_cap', 'upsert_admin_zone',
    'create_admin_promotion', 'set_admin_promotion_active', 'create_admin_broadcast',
    'update_admin_professional', 'set_admin_professional_state',
    'refund_admin_booking', 'record_admin_audit',
    'queue_admin_payout', 'settle_admin_payout',
  ]);
  assert.deepEqual(calls[11].body, {
    p_audit_id: 'audit-1', p_admin_id: 'admin-1', p_occurred_at: occurredAt, p_professional_id: 'professional-1', p_payout_id: 'payout-1',
  });
  assert.deepEqual(calls[12].body, {
    p_audit_id: 'audit-1', p_admin_id: 'admin-1', p_occurred_at: occurredAt, p_professional_id: 'professional-1', p_payout_id: 'payout-1',
    p_paid_reference: 'TB-1', p_paid_note: null,
  });
  assert.deepEqual(calls[2].body, {
    p_audit_id: 'audit-1', p_admin_id: 'admin-1', p_occurred_at: occurredAt, p_travel_fee_cap: 500,
  });
  assert.equal(calls[7].body.p_female_only_eligible, true);
  for (const call of calls) {
    assert.equal(call.headers.apikey, 'sb_secret_server_only');
    assert.equal(call.headers.Authorization, undefined);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Supabase administrator operations adapter contract passed.');
