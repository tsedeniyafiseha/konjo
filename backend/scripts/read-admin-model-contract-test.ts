import assert from 'node:assert/strict';

import { ReadAdminModel } from '../src/application/read-admin-model.ts';
import type { AdminReadStore } from '../src/application/ports.ts';

const calls: Array<Record<string, unknown>> = [];
const summary = {
  pendingApplications: 1,
  activeProfessionals: 2,
  openBookings: 3,
  openNotificationFailures: 4,
  queuedPayoutAmount: 5,
  capturedPaymentAmount: 6,
  openQualityFlags: 7,
  openSafetyIncidents: 8,
};
const settings = {
  commissionRateBps: 1800,
  commissionRatePercent: 18,
  travelFeeCap: 500,
  updatedAt: '2026-09-18T23:00:00.000Z',
};
const store: AdminReadStore = {
  getSummary() {
    calls.push({ operation: 'summary' });
    return summary;
  },
  getPlatformSettings() {
    calls.push({ operation: 'settings' });
    return settings;
  },
  listProfessionalApplications(status) {
    calls.push({ operation: 'applications', status });
    return [];
  },
  listProfessionals() {
    calls.push({ operation: 'professionals' });
    return [];
  },
  listBookings(filters, limit) {
    calls.push({ operation: 'bookings', filters, limit });
    return [];
  },
  listPendingPayouts() {
    calls.push({ operation: 'pending-payouts' });
    return [];
  },
  listPayouts() {
    calls.push({ operation: 'payouts' });
    return [];
  },
  listRevenueRows() {
    calls.push({ operation: 'revenue' });
    return [];
  },
  listAuditLogs(limit) {
    calls.push({ operation: 'audit-logs', limit });
    return [];
  },
  listZones() {
    calls.push({ operation: 'zones' });
    return [];
  },
  listDisputes() {
    calls.push({ operation: 'disputes' });
    return [];
  },
  listQualityFlags() {
    calls.push({ operation: 'quality-flags' });
    return [];
  },
  listSafetyIncidents() {
    calls.push({ operation: 'safety-incidents' });
    return [];
  },
  listBroadcasts() {
    calls.push({ operation: 'broadcasts' });
    return [];
  },
};
const reads = new ReadAdminModel(store);

assert.deepEqual(reads.getSummary(), summary);
assert.deepEqual(reads.getPlatformSettings(), settings);
assert.deepEqual(reads.listProfessionalApplications('pending'), []);
assert.deepEqual(reads.listProfessionals(), []);
assert.deepEqual(reads.listBookings({ status: 'accepted' }), []);
assert.deepEqual(reads.listPayouts(), []);
assert.deepEqual(reads.listPendingPayouts(), []);
assert.deepEqual(reads.listRevenueRows(), []);
assert.deepEqual(reads.listAuditLogs(), []);
assert.deepEqual(reads.listZones(), []);
assert.deepEqual(reads.listDisputes(), []);
assert.deepEqual(reads.listQualityFlags(), []);
assert.deepEqual(reads.listSafetyIncidents(), []);
assert.deepEqual(reads.listBroadcasts(), []);
assert.deepEqual(calls, [
  { operation: 'summary' },
  { operation: 'settings' },
  { operation: 'applications', status: 'pending' },
  { operation: 'professionals' },
  { operation: 'bookings', filters: { status: 'accepted' }, limit: 100 },
  { operation: 'payouts' },
  { operation: 'pending-payouts' },
  { operation: 'revenue' },
  { operation: 'audit-logs', limit: 100 },
  { operation: 'zones' },
  { operation: 'disputes' },
  { operation: 'quality-flags' },
  { operation: 'safety-incidents' },
  { operation: 'broadcasts' },
]);

console.log('Admin read model application contract passed.');
