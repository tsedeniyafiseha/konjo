import assert from 'node:assert/strict';

import type {
  OpenBookingDisputeStoreInput,
  OpenSafetyIncidentStoreInput,
  ResolveBookingDisputeStoreInput,
  ResolveQualityFlagStoreInput,
  ResolveSafetyIncidentStoreInput,
} from '../src/application/contracts.ts';
import type { Clock, IdGenerator, TrustSafetyCommandStore } from '../src/application/ports.ts';
import { ManageTrustSafety } from '../src/application/manage-trust-safety.ts';

const occurredAt = '2026-09-18T06:00:00.000Z';
const safetyCalls: OpenSafetyIncidentStoreInput[] = [];
const disputeCalls: OpenBookingDisputeStoreInput[] = [];
const safetyResolutionCalls: ResolveSafetyIncidentStoreInput[] = [];
const qualityResolutionCalls: ResolveQualityFlagStoreInput[] = [];
const disputeResolutionCalls: ResolveBookingDisputeStoreInput[] = [];
const store: TrustSafetyCommandStore = {
  openSafetyIncident(input) {
    safetyCalls.push(input);
    return { result: 'not_active' };
  },
  openBookingDispute(input) {
    disputeCalls.push(input);
    return null;
  },
  resolveSafetyIncident(input) {
    safetyResolutionCalls.push(input);
    return null;
  },
  resolveQualityFlag(input) {
    qualityResolutionCalls.push(input);
    return null;
  },
  resolveBookingDispute(input) {
    disputeResolutionCalls.push(input);
    return null;
  },
};
let id = 0;
const ids: IdGenerator = { next: () => `generated-${++id}` };
const clock: Clock = { now: () => new Date(occurredAt) };
const manager = new ManageTrustSafety(store, ids, clock);

assert.deepEqual(await manager.openSafetyIncident({
  userId: 'client-1',
  role: 'client',
  bookingId: 'booking-1',
  latitude: 9.01,
  longitude: 38.76,
  accuracyMeters: 12,
}), { result: 'not_active' });
assert.equal(await manager.openBookingDispute('client-1', 'booking-1', 'Service did not match the booking.'), null);
assert.equal(await manager.resolveSafetyIncident('admin-1', 'incident-1', 'Participants contacted.'), null);
assert.equal(await manager.resolveQualityFlag('admin-1', 'flag-1', 'Coaching completed.', 'restore'), null);
assert.equal(await manager.resolveBookingDispute('admin-1', 'dispute-1', 'resolved', 'Client refunded.'), null);

assert.equal(safetyCalls[0].incidentId, 'generated-1');
assert.equal(disputeCalls[0].disputeId, 'generated-2');
assert.equal(safetyResolutionCalls[0].auditId, 'generated-3');
assert.equal(qualityResolutionCalls[0].auditId, 'generated-4');
assert.equal(disputeResolutionCalls[0].auditId, 'generated-5');
for (const input of [
  safetyCalls[0],
  disputeCalls[0],
  safetyResolutionCalls[0],
  qualityResolutionCalls[0],
  disputeResolutionCalls[0],
]) assert.equal(input.occurredAt, occurredAt);

console.log('Trust-and-safety application command contracts passed.');
