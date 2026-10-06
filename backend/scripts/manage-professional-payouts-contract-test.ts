import assert from 'node:assert/strict';

import type {
  QueueProfessionalPayoutStoreInput,
  SettleProfessionalPayoutStoreInput,
} from '../src/application/contracts.ts';
import type {
  Clock,
  IdGenerator,
  ProfessionalPayoutCommandStore,
} from '../src/application/ports.ts';
import { ManageProfessionalPayouts } from '../src/application/manage-professional-payouts.ts';

const occurredAt = '2026-09-18T05:00:00.000Z';
const queueCalls: QueueProfessionalPayoutStoreInput[] = [];
const settleCalls: SettleProfessionalPayoutStoreInput[] = [];
const store: ProfessionalPayoutCommandStore = {
  queuePayout(input) {
    queueCalls.push(input);
    return null;
  },
  settlePayout(input) {
    settleCalls.push(input);
    return null;
  },
};
const ids: IdGenerator = { next: () => 'payout-1' };
const clock: Clock = { now: () => new Date(occurredAt) };
const manager = new ManageProfessionalPayouts(store, ids, clock);

assert.equal(await manager.queue('professional-1'), null);
assert.equal(await manager.settle('professional-1', 'payout-1'), null);
assert.deepEqual(queueCalls, [{
  payoutId: 'payout-1',
  professionalId: 'professional-1',
  occurredAt,
}]);
assert.deepEqual(settleCalls, [{
  payoutId: 'payout-1',
  professionalId: 'professional-1',
  occurredAt,
}]);

console.log('Professional payout application command contracts passed.');
