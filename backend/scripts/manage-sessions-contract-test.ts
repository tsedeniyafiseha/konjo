import assert from 'node:assert/strict';

import type { ApiUser } from '../../shared/api-contracts.ts';
import { SessionManager } from '../src/application/manage-sessions.ts';
import type { Clock, SessionStore, SessionTokenSecurity } from '../src/application/ports.ts';

const now = new Date('2026-09-18T17:00:00.000Z');
const clock: Clock = { now: () => now };
const security: SessionTokenSecurity = {
  createToken: () => 'raw-session-token',
  hashToken: (token) => `hashed:${token}`,
};
const user: ApiUser = {
  id: 'client-1',
  role: 'client',
  email: 'client@konjo.test',
  fullName: 'Konjo Client',
  phoneNumber: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};
const calls: unknown[] = [];
const store: SessionStore = {
  createSession(input) {
    calls.push({ operation: 'create', ...input });
  },
  findUserForSession(tokenHash, requestedAt) {
    calls.push({ operation: 'find', tokenHash, requestedAt });
    return user;
  },
  deleteSession(tokenHash) {
    calls.push({ operation: 'delete', tokenHash });
  },
};
const manager = new SessionManager(store, security, clock, 60_000);

assert.deepEqual(manager.issue(user), {
  user,
  session: { token: 'raw-session-token', expiresAt: now.getTime() + 60_000 },
});
assert.equal(manager.resolve('raw-session-token'), user);
manager.revoke('raw-session-token');
assert.deepEqual(calls, [
  {
    operation: 'create',
    userId: 'client-1',
    role: 'client',
    tokenHash: 'hashed:raw-session-token',
    expiresAt: now.getTime() + 60_000,
    createdAt: now.toISOString(),
  },
  { operation: 'find', tokenHash: 'hashed:raw-session-token', requestedAt: now.getTime() },
  { operation: 'delete', tokenHash: 'hashed:raw-session-token' },
]);

console.log('Session management application contract passed.');
