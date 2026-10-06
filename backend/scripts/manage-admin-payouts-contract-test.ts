import assert from 'node:assert/strict';

import type { QueueAdminPayoutStoreInput, SettleAdminPayoutStoreInput } from '../src/application/contracts.ts';
import { ManageAdminPayouts } from '../src/application/manage-admin-payouts.ts';
import type { AdminPayoutCommandStore, Clock, IdGenerator } from '../src/application/ports.ts';

const now = new Date('2026-09-24T09:00:00.000Z');
const clock: Clock = { now: () => now };
const generatedIds = ['audit-queue', 'payout-1', 'audit-settle'];
const ids: IdGenerator = { next: () => { const id = generatedIds.shift(); assert.ok(id); return id; } };
const calls: unknown[] = [];
const payout = {
  id: 'payout-1', professionalId: 'professional-1', status: 'queued' as const, amount: 1100, bookingCount: 1,
  createdAt: now.toISOString(), paidAt: null,
  payoutMethod: { type: 'telebirr' as const, accountName: 'Pro', accountNumber: '+251911000000' },
  paidReference: null, paidNote: null,
};
const store: AdminPayoutCommandStore = {
  queueAdminPayout(input: QueueAdminPayoutStoreInput) { calls.push(input); return payout; },
  settleAdminPayout(input: SettleAdminPayoutStoreInput) {
    calls.push(input);
    return { ...payout, status: 'paid', paidAt: now.toISOString(), paidReference: input.paidReference, paidNote: input.paidNote };
  },
};
const handler = new ManageAdminPayouts(store, ids, clock);

assert.equal(await handler.queue('admin-1', 'professional-1'), payout);
const settled = await handler.settle('admin-1', 'professional-1', 'payout-1', { paidReference: 'TB-12345', paidNote: 'Paid by Telebirr' });
assert.equal(settled?.status, 'paid');
assert.equal(settled?.paidReference, 'TB-12345');
assert.deepEqual(calls, [
  { auditId: 'audit-queue', adminId: 'admin-1', occurredAt: now.toISOString(), professionalId: 'professional-1', payoutId: 'payout-1' },
  { auditId: 'audit-settle', adminId: 'admin-1', occurredAt: now.toISOString(), professionalId: 'professional-1', payoutId: 'payout-1', paidReference: 'TB-12345', paidNote: 'Paid by Telebirr' },
]);

console.log('Admin payout application contract passed.');
