import assert from 'node:assert/strict';

import type {
  AdminCatalogCommandResults,
  CreateBroadcastStoreInput,
  CreatePromotionStoreInput,
  SetPromotionActiveStoreInput,
  UpdateCommissionStoreInput,
  UpdateTravelFeeCapStoreInput,
  UpsertServiceCategoryStoreInput,
  UpsertZoneStoreInput,
} from '../src/application/contracts.ts';
import { ManageAdminCatalog } from '../src/application/manage-admin-catalog.ts';
import type { AdminCatalogCommandStore, Clock, IdGenerator } from '../src/application/ports.ts';

const now = new Date('2026-09-18T12:00:00.000Z');
const clock: Clock = { now: () => now };
const generatedIds = ['audit-category', 'audit-commission', 'audit-travel-fee-cap', 'audit-zone', 'audit-promotion', 'promotion-1', 'audit-state', 'audit-broadcast', 'broadcast-1'];
const ids: IdGenerator = {
  next: () => {
    const id = generatedIds.shift();
    assert.ok(id, 'The handler requested more IDs than expected.');
    return id;
  },
};

const calls: unknown[] = [];
const category: AdminCatalogCommandResults['category'] = {
  id: 'hair',
  slug: 'hair',
  name: 'Hair',
  active: true,
  sortOrder: 1,
  updatedAt: now.toISOString(),
};
const settings: AdminCatalogCommandResults['settings'] = {
  commissionRateBps: 1800,
  commissionRatePercent: 18,
  travelFeeCap: 500,
  updatedAt: now.toISOString(),
};
const zone: AdminCatalogCommandResults['zone'] = {
  id: 'bole',
  label: 'Bole',
  travelFee: 150,
  active: true,
  updatedAt: now.toISOString(),
};
const promotion: AdminCatalogCommandResults['promotion'] = {
  id: 'promotion-1',
  code: 'WELCOME',
  description: 'Welcome offer',
  discountPercent: 10,
  active: true,
  startsAt: '2026-09-18T00:00:00.000Z',
  endsAt: '2026-09-30T00:00:00.000Z',
  createdAt: now.toISOString(),
};
const broadcast: AdminCatalogCommandResults['broadcast'] = {
  id: 'broadcast-1',
  audience: 'clients',
  message: 'Welcome to Konjo',
  recipientCount: 4,
  createdAt: now.toISOString(),
};

const store: AdminCatalogCommandStore = {
  upsertCategory(input: UpsertServiceCategoryStoreInput) {
    calls.push(input);
    return category;
  },
  updateCommission(input: UpdateCommissionStoreInput) {
    calls.push(input);
    return settings;
  },
  updateTravelFeeCap(input: UpdateTravelFeeCapStoreInput) {
    calls.push(input);
    return settings;
  },
  upsertZone(input: UpsertZoneStoreInput) {
    calls.push(input);
    return zone;
  },
  createPromotion(input: CreatePromotionStoreInput) {
    calls.push(input);
    return promotion;
  },
  setPromotionActive(input: SetPromotionActiveStoreInput) {
    calls.push(input);
    return promotion;
  },
  createBroadcast(input: CreateBroadcastStoreInput) {
    calls.push(input);
    return broadcast;
  },
};

const handler = new ManageAdminCatalog(store, ids, clock);

assert.equal(await handler.upsertCategory('admin-1', {
  id: 'hair',
  slug: 'hair',
  name: 'Hair',
  active: true,
  sortOrder: 1,
}), category);
assert.equal(await handler.updateCommission('admin-1', { commissionRateBps: 1800 }), settings);
assert.equal(await handler.updateTravelFeeCap('admin-1', { travelFeeCap: 500 }), settings);
assert.equal(await handler.upsertZone('admin-1', {
  id: 'bole',
  label: 'Bole',
  travelFee: 150,
  active: true,
}), zone);
assert.equal(await handler.createPromotion('admin-1', {
  code: 'WELCOME',
  description: 'Welcome offer',
  discountPercent: 10,
  active: true,
  startsAt: '2026-09-18T00:00:00.000Z',
  endsAt: '2026-09-30T00:00:00.000Z',
}), promotion);
assert.equal(await handler.setPromotionActive('admin-1', {
  promotionId: 'promotion-1',
  active: false,
}), promotion);
assert.equal(await handler.createBroadcast('admin-1', {
  audience: 'clients',
  message: 'Welcome to Konjo',
}), broadcast);

assert.deepEqual(calls, [
  { auditId: 'audit-category', adminId: 'admin-1', occurredAt: now.toISOString(), id: 'hair', slug: 'hair', name: 'Hair', active: true, sortOrder: 1 },
  { auditId: 'audit-commission', adminId: 'admin-1', occurredAt: now.toISOString(), commissionRateBps: 1800 },
  { auditId: 'audit-travel-fee-cap', adminId: 'admin-1', occurredAt: now.toISOString(), travelFeeCap: 500 },
  { auditId: 'audit-zone', adminId: 'admin-1', occurredAt: now.toISOString(), id: 'bole', label: 'Bole', travelFee: 150, active: true },
  { auditId: 'audit-promotion', adminId: 'admin-1', occurredAt: now.toISOString(), code: 'WELCOME', description: 'Welcome offer', discountPercent: 10, active: true, startsAt: '2026-09-18T00:00:00.000Z', endsAt: '2026-09-30T00:00:00.000Z', promotionId: 'promotion-1' },
  { auditId: 'audit-state', adminId: 'admin-1', occurredAt: now.toISOString(), promotionId: 'promotion-1', active: false },
  { auditId: 'audit-broadcast', adminId: 'admin-1', occurredAt: now.toISOString(), audience: 'clients', message: 'Welcome to Konjo', broadcastId: 'broadcast-1' },
]);

console.log('Admin catalog application contract passed.');
