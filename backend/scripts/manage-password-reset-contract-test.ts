import assert from 'node:assert/strict';

import { PasswordResetManager } from '../src/application/manage-password-reset.ts';
import {
  EmailDeliveryError,
  type Clock,
  type PasswordResetSender,
  type PasswordResetStore,
  type PasswordSecurity,
  type SessionTokenSecurity,
} from '../src/application/ports.ts';

const now = new Date('2026-09-18T19:00:00.000Z');
const clock: Clock = { now: () => now };
const passwords: PasswordSecurity = {
  hash: async (password) => `password-hash:${password}`,
  verify: async () => true,
};
let nextToken = 'reset-token-1';
const tokens: SessionTokenSecurity = {
  createToken: () => nextToken,
  hashToken: (token) => `token-hash:${token}`,
};
const calls: unknown[] = [];
let deliveryShouldFail = false;
const sender: PasswordResetSender = {
  async send(email, token) {
    calls.push({ operation: 'send', email, token });
    if (deliveryShouldFail) throw new EmailDeliveryError('delivery failed');
  },
};
const store: PasswordResetStore = {
  findResettableClient(email) {
    calls.push({ operation: 'find', email });
    return email === 'client@konjo.test' ? { userId: 'client-1', email } : null;
  },
  createPasswordResetToken(input) {
    calls.push({ operation: 'create', ...input });
  },
  deletePasswordResetToken(tokenHash) {
    calls.push({ operation: 'delete', tokenHash });
  },
  resetPassword(tokenHash, passwordHash, requestedAt) {
    calls.push({ operation: 'reset', tokenHash, passwordHash, requestedAt });
    return true;
  },
};
const manager = new PasswordResetManager(store, sender, passwords, tokens, clock, {
  lifetimeMs: 30 * 60_000,
  exposeDevelopmentToken: true,
});

assert.deepEqual(await manager.request('missing@konjo.test'), {
  response: { accepted: true },
  deliveryError: null,
});
assert.deepEqual(await manager.request('client@konjo.test'), {
  response: { accepted: true, developmentToken: 'reset-token-1' },
  deliveryError: null,
});
nextToken = 'reset-token-2';
deliveryShouldFail = true;
const failedDelivery = await manager.request('client@konjo.test');
assert.deepEqual(failedDelivery.response, { accepted: true });
assert.ok(failedDelivery.deliveryError instanceof EmailDeliveryError);
assert.equal(await manager.confirm('reset-token-1', 'new-password'), true);
assert.deepEqual(calls, [
  { operation: 'find', email: 'missing@konjo.test' },
  { operation: 'find', email: 'client@konjo.test' },
  { operation: 'create', userId: 'client-1', tokenHash: 'token-hash:reset-token-1', expiresAt: now.getTime() + 30 * 60_000, createdAt: now.getTime() },
  { operation: 'send', email: 'client@konjo.test', token: 'reset-token-1' },
  { operation: 'find', email: 'client@konjo.test' },
  { operation: 'create', userId: 'client-1', tokenHash: 'token-hash:reset-token-2', expiresAt: now.getTime() + 30 * 60_000, createdAt: now.getTime() },
  { operation: 'send', email: 'client@konjo.test', token: 'reset-token-2' },
  { operation: 'delete', tokenHash: 'token-hash:reset-token-2' },
  { operation: 'reset', tokenHash: 'token-hash:reset-token-1', passwordHash: 'password-hash:new-password', requestedAt: now.getTime() },
]);

console.log('Password reset application contract passed.');
