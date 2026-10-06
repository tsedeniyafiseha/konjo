import assert from 'node:assert/strict';

import type { ApiUser } from '../../shared/api-contracts.ts';
import type {
  Clock,
  IdGenerator,
  OtpSecurity,
  OtpVerificationChallenge,
  OtpVerificationStore,
} from '../src/application/ports.ts';
import { VerifyOtpHandler } from '../src/application/verify-otp.ts';

const now = new Date('2026-09-18T18:00:00.000Z');
const clock: Clock = { now: () => now };
const ids: IdGenerator = { next: () => 'client-1' };
const security: OtpSecurity = {
  createCode: () => '2471',
  hash: (id, code) => `hash:${id}:${code}`,
  verify: (id, code, storedHash) => storedHash === `hash:${id}:${code}`,
};
const challenge: OtpVerificationChallenge = {
  id: 'challenge-1',
  phoneNumber: '+251911223344',
  role: 'client',
  codeHash: 'hash:challenge-1:2471',
  expiresAt: now.getTime() + 60_000,
  attemptsRemaining: 5,
  consumedAt: null,
};
const user: ApiUser = {
  id: 'client-1',
  role: 'client',
  email: null,
  fullName: 'Konjo client',
  phoneNumber: challenge.phoneNumber,
  createdAt: now.toISOString(),
};
const calls: unknown[] = [];
let storedChallenge: OtpVerificationChallenge | null = challenge;
const store: OtpVerificationStore = {
  findOtpChallenge(challengeId) {
    calls.push({ operation: 'find', challengeId });
    return storedChallenge;
  },
  recordOtpFailure(challengeId) {
    calls.push({ operation: 'failure', challengeId });
  },
  consumeOtpChallenge(challengeId, consumedAt) {
    calls.push({ operation: 'consume', challengeId, consumedAt });
    storedChallenge = storedChallenge ? { ...storedChallenge, consumedAt } : null;
    return true;
  },
  findOrCreatePhoneUser(input) {
    calls.push({ operation: 'user', ...input });
    return user;
  },
  attachVerifiedPhone(input) {
    calls.push({ operation: 'attach', ...input });
    return user;
  },
};

const handler = new VerifyOtpHandler(store, security, ids, clock);
assert.deepEqual(handler.execute({ challengeId: 'challenge-1', code: '0000', role: 'client' }), {
  result: 'invalid_code',
});
assert.deepEqual(handler.execute({ challengeId: 'challenge-1', code: '2471', role: 'client' }), {
  result: 'verified',
  user,
});
assert.deepEqual(handler.execute({ challengeId: 'challenge-1', code: '2471', role: 'client' }), {
  result: 'invalid_challenge',
});
assert.deepEqual(calls, [
  { operation: 'find', challengeId: 'challenge-1' },
  { operation: 'failure', challengeId: 'challenge-1' },
  { operation: 'find', challengeId: 'challenge-1' },
  { operation: 'consume', challengeId: 'challenge-1', consumedAt: now.getTime() },
  { operation: 'user', userId: 'client-1', phoneNumber: challenge.phoneNumber, role: 'client', createdAt: now.toISOString() },
  { operation: 'find', challengeId: 'challenge-1' },
]);

storedChallenge = { ...challenge, id: 'challenge-2', codeHash: 'hash:challenge-2:2471' };
assert.deepEqual(handler.execute({
  challengeId: 'challenge-2',
  code: '2471',
  role: 'client',
  authenticatedUserId: 'email-client-1',
}), { result: 'verified', user });
assert.deepEqual(calls.slice(-3), [
  { operation: 'find', challengeId: 'challenge-2' },
  { operation: 'consume', challengeId: 'challenge-2', consumedAt: now.getTime() },
  { operation: 'attach', userId: 'email-client-1', phoneNumber: challenge.phoneNumber, role: 'client' },
]);

console.log('OTP verification application contract passed.');
