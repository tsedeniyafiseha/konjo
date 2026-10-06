import assert from 'node:assert/strict';

import { VerifyIdentity } from '../src/application/verify-identity.ts';
import type {
  Clock,
  IdentityVerificationStore,
  IdentityVerifier,
} from '../src/application/ports.ts';

const now = new Date('2026-09-18T16:00:00.000Z');
const clock: Clock = { now: () => now };
const verifiedFins: string[] = [];
const verifier: IdentityVerifier = {
  async verify(fin) {
    verifiedFins.push(fin);
    return { lastFour: fin.slice(-4) };
  },
};
const writes: unknown[] = [];
const store: IdentityVerificationStore = {
  recordClientVerification(userId, lastFour, verifiedAt) {
    writes.push({ subject: 'client', userId, lastFour, verifiedAt });
    return { verified: true, faydaLastFour: lastFour, verifiedAt };
  },
};

const handler = new VerifyIdentity(store, verifier, clock);
assert.deepEqual(
  await handler.client('client-1', '987654326789'),
  { verified: true, faydaLastFour: '6789', verifiedAt: now.toISOString() },
);
assert.deepEqual(verifiedFins, ['987654326789']);
assert.deepEqual(writes, [
  { subject: 'client', userId: 'client-1', lastFour: '6789', verifiedAt: now.toISOString() },
]);

console.log('Identity verification application contract passed.');
