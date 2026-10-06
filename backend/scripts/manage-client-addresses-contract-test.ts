import assert from 'node:assert/strict';
import { ManageClientAddresses } from '../src/application/manage-client-addresses.ts';
import type { ClientAddressCommandStore, Clock, IdGenerator } from '../src/application/ports.ts';

const now = new Date('2026-09-18T22:00:00.000Z');
const calls: unknown[] = [];
const store: ClientAddressCommandStore = {
  createAddress(input) { calls.push({ operation: 'create', ...input }); return { result: 'service_zone_unavailable' }; },
  updateAddress(input) { calls.push({ operation: 'update', ...input }); return { result: 'not_found' }; },
  deleteAddress(input) { calls.push({ operation: 'delete', ...input }); return true; },
  setDefaultAddress(input) { calls.push({ operation: 'default', ...input }); return true; },
};
const ids: IdGenerator = { next: () => 'address-1' };
const clock: Clock = { now: () => now };
const manager = new ManageClientAddresses(store, ids, clock);
assert.deepEqual(await manager.create('client-1', { label: 'Home', zone: 'Bole', detail: 'Apartment 10', makeDefault: true }), { result: 'service_zone_unavailable' });
assert.deepEqual(await manager.update('client-1', 'address-1', { label: 'Office', zone: 'CMC', detail: 'Office 20' }), { result: 'not_found' });
assert.equal(await manager.delete('client-1', 'address-1'), true);
assert.equal(await manager.setDefault('client-1', 'address-1'), true);
assert.equal(calls.length, 4);
assert.ok(calls.every((call) => (call as { occurredAt: string }).occurredAt === now.toISOString()));
console.log('Client address application contract passed.');
