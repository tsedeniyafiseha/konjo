import assert from 'node:assert/strict';

import type { ApiUser } from '../../shared/api-contracts.ts';
import { AccountAuthenticator } from '../src/application/authenticate-accounts.ts';
import type {
  AccountAuthenticationStore,
  AccountCredentials,
  Clock,
  IdGenerator,
  PasswordSecurity,
} from '../src/application/ports.ts';

const now = new Date('2026-09-18T20:00:00.000Z');
const clock: Clock = { now: () => now };
const generatedIds = ['client-1', 'admin-1'];
const ids: IdGenerator = {
  next: () => {
    const id = generatedIds.shift();
    assert.ok(id);
    return id;
  },
};
const passwordCalls: unknown[] = [];
const passwords: PasswordSecurity = {
  async hash(password) {
    passwordCalls.push({ operation: 'hash', password });
    return `hash:${password}`;
  },
  async verify(password, storedHash) {
    passwordCalls.push({ operation: 'verify', password, storedHash });
    return storedHash === `hash:${password}`;
  },
};
const client: ApiUser = {
  id: 'client-1', role: 'client', email: 'client@konjo.test', fullName: 'Client One',
  phoneNumber: null, createdAt: now.toISOString(),
};
const admin: ApiUser = {
  id: 'admin-1', role: 'admin', email: 'admin@konjo.test', fullName: 'Konjo administrator',
  phoneNumber: null, createdAt: now.toISOString(),
};
const clients = new Map<string, AccountCredentials>();
const admins = new Map<string, AccountCredentials>();
const storeCalls: unknown[] = [];
const store: AccountAuthenticationStore = {
  createClient(input) {
    storeCalls.push({ operation: 'create-client', ...input });
    clients.set(input.email, { user: client, passwordHash: input.passwordHash });
    return client;
  },
  findClientCredentials(email) {
    storeCalls.push({ operation: 'find-client', email });
    return clients.get(email) ?? null;
  },
  findAdminCredentials(email) {
    storeCalls.push({ operation: 'find-admin', email });
    return admins.get(email) ?? null;
  },
  createAdministrator(input) {
    storeCalls.push({ operation: 'create-admin', ...input });
    admins.set(input.email, { user: admin, passwordHash: input.passwordHash });
    return admin;
  },
};
const authenticator = new AccountAuthenticator(store, passwords, ids, clock, {
  enabled: true,
  email: 'admin@konjo.test',
  password: 'admin-password',
});

assert.equal(await authenticator.registerClient('client@konjo.test', 'Client One', 'client-password'), client);
assert.equal(await authenticator.loginClient('client@konjo.test', 'client-password'), client);
assert.equal(await authenticator.loginClient('missing@konjo.test', 'wrong-password'), null);
assert.equal(await authenticator.loginAdmin('admin@konjo.test', 'admin-password'), admin);
assert.equal(await authenticator.loginAdmin('missing-admin@konjo.test', 'wrong-password'), null);
assert.ok(passwordCalls.some((call) => (
  call as { operation?: string; password?: string }
).operation === 'hash' && (
  call as { operation?: string; password?: string }
).password === 'wrong-password'));
assert.ok(storeCalls.some((call) => (call as { operation?: string }).operation === 'create-admin'));

console.log('Account authentication application contract passed.');
