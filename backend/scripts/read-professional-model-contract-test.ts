import assert from 'node:assert/strict';

import { ReadProfessionalModel } from '../src/application/read-professional-model.ts';
import type { Clock, ProfessionalReadStore } from '../src/application/ports.ts';

const now = new Date('2026-09-18T23:00:00.000Z');
const calls: Array<{
  operation: string;
  professionalId: string;
  earningsSince?: string;
  dateIso?: string;
  serviceId?: string;
  excludeBookingId?: string;
}> = [];
const store: ProfessionalReadStore = {
  getApplication(professionalId) {
    calls.push({ operation: 'application', professionalId });
    return null;
  },
  getDashboard(professionalId, earningsSince) {
    calls.push({ operation: 'dashboard', professionalId, earningsSince });
    return null;
  },
  getCatalogSettings(professionalId) {
    calls.push({ operation: 'catalog', professionalId });
    return null;
  },
  getProfessionalAvailability(professionalId, dateIso, serviceId, excludeBookingId) {
    calls.push({
      operation: 'availability',
      professionalId,
      dateIso,
      serviceId,
      excludeBookingId,
    });
    return null;
  },
  listPayouts(professionalId) {
    calls.push({ operation: 'payouts', professionalId });
    return [];
  },
};
const clock: Clock = { now: () => now };
const reads = new ReadProfessionalModel(store, clock);

assert.equal(reads.getApplication('professional-1'), null);
assert.equal(reads.getDashboard('professional-1'), null);
assert.equal(reads.getCatalogSettings('professional-1'), null);
assert.equal(
  reads.getAvailability('professional-1', '2026-09-20', 'service-1', 'booking-1'),
  null,
);
assert.deepEqual(reads.listPayouts('professional-1'), []);
assert.deepEqual(calls, [
  { operation: 'application', professionalId: 'professional-1' },
  {
    operation: 'dashboard',
    professionalId: 'professional-1',
    earningsSince: '2026-09-11T23:00:00.000Z',
  },
  { operation: 'catalog', professionalId: 'professional-1' },
  {
    operation: 'availability',
    professionalId: 'professional-1',
    dateIso: '2026-09-20',
    serviceId: 'service-1',
    excludeBookingId: 'booking-1',
  },
  { operation: 'payouts', professionalId: 'professional-1' },
]);

console.log('Professional read model application contract passed.');
