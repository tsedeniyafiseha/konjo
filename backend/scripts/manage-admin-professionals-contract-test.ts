import assert from 'node:assert/strict';

import { ManageAdminProfessionals } from '../src/application/manage-admin-professionals.ts';
import type { AdminProfessionalCommandStore, Clock, IdGenerator } from '../src/application/ports.ts';

const now = new Date('2026-09-18T15:00:00.000Z');
const clock: Clock = { now: () => now };
const generatedIds = ['audit-review', 'audit-update', 'audit-state'];
const ids: IdGenerator = {
  next: () => {
    const id = generatedIds.shift();
    assert.ok(id, 'The handler requested more IDs than expected.');
    return id;
  },
};
const calls: unknown[] = [];
const store: AdminProfessionalCommandStore = {
  approveForDevelopment(input) {
    calls.push(input);
    return null;
  },
  reviewApplication(input) {
    calls.push(input);
    return null;
  },
  updateProfessional(input) {
    calls.push(input);
    return null;
  },
  setProfessionalState(input) {
    calls.push(input);
    return null;
  },
};
const handler = new ManageAdminProfessionals(store, ids, clock);

assert.equal(await handler.approveForDevelopment('professional-1'), null);
assert.equal(await handler.reviewApplication('admin-1', 'professional-1', 'approve'), null);
assert.equal(await handler.updateProfessional('admin-1', 'professional-1', {
  featured: true,
  femaleOnlyEligible: true,
}), null);
assert.equal(await handler.setProfessionalState('admin-1', 'professional-1', 'suspend'), null);

assert.deepEqual(calls, [
  { professionalId: 'professional-1', occurredAt: now.toISOString() },
  { auditId: 'audit-review', adminId: 'admin-1', occurredAt: now.toISOString(), professionalId: 'professional-1', action: 'approve' },
  { auditId: 'audit-update', adminId: 'admin-1', occurredAt: now.toISOString(), professionalId: 'professional-1', featured: true, femaleOnlyEligible: true },
  { auditId: 'audit-state', adminId: 'admin-1', occurredAt: now.toISOString(), professionalId: 'professional-1', action: 'suspend' },
]);

console.log('Admin professional application contract passed.');
