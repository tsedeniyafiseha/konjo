import assert from 'node:assert/strict';
import { ManageProfessionalSelfService } from '../src/application/manage-professional-self-service.ts';
import type { Clock, ProfessionalSelfServiceCommandStore } from '../src/application/ports.ts';

const now = new Date('2026-09-19T00:00:00.000Z');
const calls: unknown[] = [];
const settings = { services: [], workingDays: [], travelZones: [], sameDayBookings: false };
const store: ProfessionalSelfServiceCommandStore = {
  updateCatalog(input) { calls.push({ operation: 'catalog', ...input }); return { result: 'updated', settings: input.settings }; },
  setAvailability(input) { calls.push({ operation: 'availability', ...input }); return true; },
};
const clock: Clock = { now: () => now };
const manager = new ManageProfessionalSelfService(store, clock);
assert.deepEqual(await manager.updateCatalog('professional-1', settings), { result: 'updated', settings });
assert.equal(await manager.setAvailability('professional-1', true), true);
assert.deepEqual(calls, [
  { operation: 'catalog', professionalId: 'professional-1', settings, occurredAt: now.toISOString() },
  { operation: 'availability', professionalId: 'professional-1', available: true, occurredAt: now.toISOString() },
]);
console.log('Professional self-service application contract passed.');
