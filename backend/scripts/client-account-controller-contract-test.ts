import assert from 'node:assert/strict';

import type {
  ApiClientAccount,
  ApiClientAddress,
} from '../../shared/api-contracts.ts';
import type { AuthSession } from '../../src/application/auth/session-controller.ts';
import {
  ClientAccountController,
  type ClientAccountCache,
  type ClientAccountGateway,
  type ClientAccountRuntime,
} from '../../src/application/client-account/client-account-controller.ts';
import type { ClientAccount } from '../../src/application/client-account/client-account-contracts.ts';

const developmentSession: AuthSession = {
  userId: 'client-development',
  expiresAt: 2_000_000_000_000,
  source: 'development',
  role: 'client',
  authMethod: 'email_password',
  email: 'client@example.com',
  displayName: 'Client Example',
};

const apiSession: AuthSession = {
  ...developmentSession,
  userId: 'client-api',
  source: 'api',
  accessToken: 'client-token',
};

const remoteAddress: ApiClientAddress = {
  id: 'remote-address',
  label: 'Home',
  zone: 'Bole',
  detail: 'Apartment 10',
  fee: 0,
  isDefault: true,
  createdAt: '2026-09-18T12:00:00.000Z',
};

const remoteAccount: ApiClientAccount = {
  profile: {
    fullName: 'Remote Client',
    email: 'remote@example.com',
    phoneNumber: '+251911000000',
    preferredLanguage: 'am',
  },
  addresses: [remoteAddress],
  defaultAddressId: remoteAddress.id,
  completedAt: '2026-09-18T12:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function memoryCache(initial: Readonly<Record<string, ClientAccount>> = {}) {
  const accounts = new Map(Object.entries(initial));
  const cache: ClientAccountCache = {
    async read(userId) { return accounts.get(userId) ?? null; },
    async write(userId, account) { accounts.set(userId, account); },
    async delete(userId) { accounts.delete(userId); },
  };
  return { accounts, cache };
}

function gateway(overrides: Partial<ClientAccountGateway> = {}): ClientAccountGateway {
  return {
    async load() { return null; },
    async completeOnboarding() { return remoteAccount; },
    async createAddress() { return remoteAddress; },
    async updateAddress() { return remoteAddress; },
    async deleteAddress() {},
    async setDefaultAddress() {},
    async updateProfile() {},
    async deleteAccount() {},
    ...overrides,
  };
}

function runtime(): ClientAccountRuntime {
  let addressSequence = 0;
  return {
    now: () => 1_758_196_800_000,
    createAddressId: () => `local-address-${++addressSequence}`,
    travelFeeFor: (zone) => zone === 'Bole' ? 0 : 150,
  };
}

{
  const cachedAccount: ClientAccount = {
    profile: {
      fullName: 'Cached Client',
      email: 'cached@example.com',
      phoneNumber: null,
      preferredLanguage: 'en',
    },
    addresses: [],
    defaultAddressId: null,
    completedAt: 1,
  };
  const { cache } = memoryCache({ [developmentSession.userId]: cachedAccount });
  const controller = new ClientAccountController(cache, gateway(), runtime(), 'am');
  await controller.setSession(developmentSession);
  assert.deepEqual(controller.getSnapshot(), {
    account: cachedAccount,
    draft: {
      fullName: developmentSession.displayName,
      email: developmentSession.email,
      phoneNumber: '',
      preferredLanguage: 'am',
    },
    language: 'en',
    loadStatus: 'ready',
  });
}

{
  const { accounts, cache } = memoryCache();
  const controller = new ClientAccountController(
    cache,
    gateway({ async load(token) { assert.equal(token, 'client-token'); return remoteAccount; } }),
    runtime(),
    'en',
  );
  await controller.setSession(apiSession);
  assert.equal(controller.getSnapshot().account?.profile.fullName, 'Remote Client');
  assert.equal(controller.getSnapshot().language, 'am');
  assert.equal(accounts.get(apiSession.userId)?.defaultAddressId, 'remote-address');
}

{
  const remoteLoad = deferred<ApiClientAccount | null>();
  const { cache } = memoryCache();
  const controller = new ClientAccountController(
    cache,
    gateway({ async load() { return remoteLoad.promise; } }),
    runtime(),
    'en',
  );
  const firstLoad = controller.setSession(apiSession);
  await controller.setSession(developmentSession);
  remoteLoad.resolve(remoteAccount);
  await firstLoad;
  assert.equal(controller.getSnapshot().account, null);
  assert.equal(controller.getSnapshot().draft.fullName, 'Client Example');
  assert.equal(controller.getSnapshot().loadStatus, 'ready');
}

{
  const { accounts, cache } = memoryCache();
  const controller = new ClientAccountController(cache, gateway(), runtime(), 'am');
  await controller.setSession(developmentSession);
  controller.updateDraft({
    fullName: '  Local Client  ',
    email: '  LOCAL@EXAMPLE.COM ',
    phoneNumber: ' +251922000000 ',
  });
  await controller.completeOnboarding({ label: 'Home', zone: 'Bole', detail: 'Near the park' });
  assert.deepEqual(controller.getSnapshot().account, {
    profile: {
      fullName: 'Local Client',
      email: 'local@example.com',
      phoneNumber: '+251922000000',
      preferredLanguage: 'am',
    },
    addresses: [{
      id: 'local-address-1',
      label: 'Home',
      zone: 'Bole',
      detail: 'Near the park',
      fee: 0,
    }],
    defaultAddressId: 'local-address-1',
    completedAt: 1_758_196_800_000,
  });

  const secondAddressId = await controller.addAddress({
    label: 'Work', zone: 'CMC', detail: 'Office 4',
  });
  assert.equal(secondAddressId, 'local-address-2');
  await controller.setDefaultAddress(secondAddressId);
  await controller.removeAddress(secondAddressId);
  assert.equal(controller.getSnapshot().account?.defaultAddressId, 'local-address-1');
  assert.equal(accounts.get(developmentSession.userId)?.addresses.length, 1);
}

{
  const profileUpdates: ClientAccount['profile'][] = [];
  const { accounts, cache } = memoryCache();
  const controller = new ClientAccountController(
    cache,
    gateway({
      async load() { return remoteAccount; },
      async updateProfile(_token, profile) { profileUpdates.push(profile); },
    }),
    runtime(),
    'en',
  );
  await controller.setSession(apiSession);
  await controller.updateProfile({ preferredLanguage: 'en' });
  assert.equal(profileUpdates[0].preferredLanguage, 'en');
  assert.equal(controller.getSnapshot().language, 'en');
  assert.equal(accounts.get(apiSession.userId)?.profile.preferredLanguage, 'en');
  await controller.deleteAccount();
  assert.equal(controller.getSnapshot().account, null);
  assert.equal(accounts.has(apiSession.userId), false);
}

console.log('Client account controller contracts passed.');
