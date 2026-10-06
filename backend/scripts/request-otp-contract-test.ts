import assert from 'node:assert/strict';

import type { Clock, IdGenerator, OtpChallengeStore, OtpSecurity, OtpSender } from '../src/application/ports.ts';
import { OtpRequestRateLimitedError, RequestOtpHandler } from '../src/application/request-otp.ts';

const now = new Date('2026-09-17T18:00:00.000Z');
const stored: Parameters<OtpChallengeStore['createOtpChallenge']>[0][] = [];
const deleted: string[] = [];
const sent: Array<{ phoneNumber: string; code: string }> = [];
let recentRequests = 0;
const store: OtpChallengeStore = {
  countRecentOtpChallenges(_phoneNumber, since) {
    assert.equal(since, now.getTime() - 600_000);
    return recentRequests;
  },
  createOtpChallenge(input) { stored.push(input); },
  deleteOtpChallenge(id) { deleted.push(id); },
};
const sender: OtpSender = {
  async send(phoneNumber, code) { sent.push({ phoneNumber, code }); },
};
const ids: IdGenerator = { next: () => 'challenge-1' };
const security: OtpSecurity = {
  createCode: () => '2471',
  hash: (id, code) => `hash:${id}:${code}`,
  verify: (id, code, storedHash) => storedHash === `hash:${id}:${code}`,
};
const clock: Clock = { now: () => now };
const policy = {
  lifetimeMs: 300_000,
  requestWindowMs: 600_000,
  requestsPerWindow: 3,
  attempts: 5,
  exposeDevelopmentCode: true,
};

const handler = new RequestOtpHandler(store, sender, ids, security, clock, policy);
assert.deepEqual(await handler.execute({ phoneNumber: '+251911111111', role: 'client' }), {
  id: 'challenge-1',
  phoneNumber: '+251911111111',
  expiresAt: now.getTime() + 300_000,
  developmentCode: '2471',
});
assert.deepEqual(stored, [{
  id: 'challenge-1',
  phoneNumber: '+251911111111',
  role: 'client',
  codeHash: 'hash:challenge-1:2471',
  expiresAt: now.getTime() + 300_000,
  attempts: 5,
  createdAt: now.getTime(),
}]);
assert.deepEqual(sent, [{ phoneNumber: '+251911111111', code: '2471' }]);

recentRequests = 3;
await assert.rejects(
  () => handler.execute({ phoneNumber: '+251911111111', role: 'professional' }),
  OtpRequestRateLimitedError,
);
assert.equal(stored.length, 1);

recentRequests = 0;
const failingHandler = new RequestOtpHandler(
  store,
  { async send() { throw new Error('delivery failed'); } },
  { next: () => 'challenge-2' },
  security,
  clock,
  policy,
);
await assert.rejects(
  () => failingHandler.execute({ phoneNumber: '+251922222222', role: 'client' }),
  /delivery failed/,
);
assert.deepEqual(deleted, ['challenge-2']);

console.log('OTP request application command contracts passed.');
