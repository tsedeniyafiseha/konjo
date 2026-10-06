import assert from 'node:assert/strict';

import { ReadMarketplace } from '../src/application/read-marketplace.ts';
import type { Clock, MarketplaceReadStore } from '../src/application/ports.ts';

const now = new Date('2026-09-18T23:00:00.000Z');
const calls: Array<Record<string, unknown>> = [];
const store: MarketplaceReadStore = {
  listProfessionalReviews() { return []; },
  listProfessionals(filters, today) {
    calls.push({ operation: 'professionals', filters, today });
    return [];
  },
  listServiceZones() {
    calls.push({ operation: 'zones' });
    return [];
  },
  listServiceCategories(activeOnly) {
    calls.push({ operation: 'categories', activeOnly });
    return [];
  },
  listPromotions() {
    calls.push({ operation: 'promotions' });
    return [];
  },
  findServiceZone(zone) {
    calls.push({ operation: 'zone', zone });
    return null;
  },
  bookingRequiresClientIdentity(userId, professionalId) {
    calls.push({ operation: 'booking-identity', userId, professionalId });
    return true;
  },
};
const clock: Clock = { now: () => now };
const reads = new ReadMarketplace(store, clock);

assert.deepEqual(reads.listProfessionals({ category: 'massage', available: true }), []);
assert.deepEqual(reads.listServiceZones(), []);
assert.deepEqual(reads.listServiceCategories(), []);
assert.deepEqual(reads.listServiceCategories(false), []);
assert.deepEqual(reads.listPromotions(), []);
assert.equal(reads.findServiceZone('Bole'), null);
assert.equal(reads.bookingRequiresClientIdentity('client-1', 'professional-1'), true);
assert.deepEqual(calls, [
  {
    operation: 'professionals',
    filters: { category: 'massage', available: true },
    today: '2026-09-18',
  },
  { operation: 'zones' },
  { operation: 'categories', activeOnly: true },
  { operation: 'categories', activeOnly: false },
  { operation: 'promotions' },
  { operation: 'zone', zone: 'Bole' },
  { operation: 'booking-identity', userId: 'client-1', professionalId: 'professional-1' },
]);

console.log('Marketplace read application contract passed.');
