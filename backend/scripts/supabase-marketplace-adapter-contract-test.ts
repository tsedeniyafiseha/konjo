import assert from 'node:assert/strict';

import { SupabaseMarketplaceReadRepository } from '../src/adapters/supabase-marketplace-read-repository.ts';

const professionalId = '93000000-0000-4000-8000-000000000001';
const clientId = '93000000-0000-4000-8000-000000000002';
const calls: Array<{ name: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
const results: unknown[] = [
  [{ id: professionalId, displayName: 'Professional' }],
  [{ id: 'bole', label: 'Bole', travelFee: 120 }],
  [{ id: 'category-id', slug: 'hair', name: 'Hair styling', active: true, sortOrder: 10 }],
  [],
  { id: 'bole', label: 'Bole', travelFee: 120 },
  true,
  { professionalId, dateIso: '2026-09-20', available: true, slots: ['9:00 AM'] },
  { verified: true, faydaLastFour: '1234', verifiedAt: '2026-09-18T12:00:00.000Z' },
  { verified: true, faydaLastFour: '1234', verifiedAt: '2026-09-18T12:00:00.000Z' },
];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  calls.push({
    name: url.split('/rpc/')[1],
    body: JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>,
    headers: init.headers as Record<string, string>,
  });
  return Response.json(results.shift());
};

try {
  const repository = new SupabaseMarketplaceReadRepository(
    'https://project.supabase.co/',
    'sb_secret_server_only',
  );
  assert.equal((await repository.listProfessionals({ category: 'hair' }, '2026-09-18')).length, 1);
  assert.equal((await repository.listServiceZones())[0]?.label, 'Bole');
  assert.equal((await repository.listServiceCategories(true))[0]?.slug, 'hair');
  assert.deepEqual(await repository.listPromotions(), []);
  assert.equal((await repository.findServiceZone('Bole'))?.travelFee, 120);
  assert.equal(await repository.bookingRequiresClientIdentity(clientId, professionalId), true);
  assert.deepEqual(
    await repository.getProfessionalAvailability(professionalId, '2026-09-20', 'service-1'),
    { professionalId, dateIso: '2026-09-20', available: true, slots: ['9:00 AM'] },
  );
  assert.equal(
    (await repository.recordClientVerification(clientId, '1234', '2026-09-18T12:00:00.000Z')).verified,
    true,
  );
  assert.equal((await repository.getIdentityStatus(clientId)).faydaLastFour, '1234');

  assert.deepEqual(calls.map((call) => call.name), [
    'list_marketplace_professionals',
    'list_marketplace_zones',
    'list_marketplace_categories',
    'list_marketplace_promotions',
    'find_marketplace_zone',
    'booking_requires_client_identity',
    'get_marketplace_professional_availability',
    'record_client_identity_verification',
    'get_client_identity_verification',
  ]);
  assert.deepEqual(calls[0].body, {
    p_filters: { category: 'hair' },
    p_today: '2026-09-18',
  });
  for (const call of calls) {
    assert.equal(call.headers.apikey, 'sb_secret_server_only');
    assert.equal(call.headers.Authorization, undefined);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Supabase marketplace and identity adapter contract passed.');
