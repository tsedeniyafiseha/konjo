import assert from 'node:assert/strict';

import { ManageClientAccount } from '../src/application/manage-client-account.ts';
import type { ClientAccountCommandStore, Clock, IdGenerator } from '../src/application/ports.ts';

const now = new Date('2026-09-18T21:00:00.000Z');
const clock: Clock = { now: () => now };
const ids: IdGenerator = { next: () => 'address-1' };
const calls: unknown[] = [];
const store: ClientAccountCommandStore = {
  updateProfile(input) {
    calls.push({ operation: 'profile', ...input });
    return null;
  },
  completeOnboarding(input) {
    calls.push({ operation: 'onboarding', ...input });
    return { result: 'client_not_found' };
  },
  deleteAccount(input) {
    calls.push({ operation: 'delete', ...input });
    return true;
  },
};
const manager = new ManageClientAccount(store, ids, clock);

assert.equal(await manager.updateProfile('client-1', {
  fullName: 'Client One',
  phoneNumber: '+251911223344',
  preferredLanguage: 'am',
}), null);
assert.deepEqual(await manager.completeOnboarding('client-1', {
  fullName: 'Client One',
  phoneNumber: '+251911223344',
  preferredLanguage: 'am',
  address: { label: 'Home', zone: 'Bole', detail: 'Apartment 10, Main Street' },
}), { result: 'client_not_found' });
assert.equal(await manager.deleteAccount('professional-1', 'professional'), true);
assert.deepEqual(calls, [
  {
    operation: 'profile', userId: 'client-1', fullName: 'Client One',
    phoneNumber: '+251911223344', preferredLanguage: 'am', occurredAt: now.toISOString(),
  },
  {
    operation: 'onboarding', userId: 'client-1', fullName: 'Client One',
    phoneNumber: '+251911223344', preferredLanguage: 'am', occurredAt: now.toISOString(),
    address: { id: 'address-1', label: 'Home', zone: 'Bole', detail: 'Apartment 10, Main Street' },
  },
  {
    operation: 'delete', userId: 'professional-1', role: 'professional',
    occurredAt: now.toISOString(),
  },
]);

console.log('Client account application contract passed.');
