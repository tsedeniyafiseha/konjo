import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { ClientAccountCache } from '@/application/client-account/client-account-controller';
import type { ClientAccount } from '@/application/client-account/client-account-contracts';

const STORAGE_PREFIX = 'konjo.client.account.v1';
const webAccounts = new Map<string, ClientAccount>();

const keyFor = (userId: string) => `${STORAGE_PREFIX}.${userId.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

function isClientAccount(value: unknown): value is ClientAccount {
  if (!value || typeof value !== 'object') return false;
  const account = value as Partial<ClientAccount>;
  return Boolean(account.profile && typeof account.profile === 'object') && Array.isArray(account.addresses) && typeof account.completedAt === 'number';
}

export async function readClientAccount(userId: string): Promise<ClientAccount | null> {
  const serialized = Platform.OS === 'web'
    ? webAccounts.has(userId) ? JSON.stringify(webAccounts.get(userId)) : null
    : await SecureStore.getItemAsync(keyFor(userId));
  if (!serialized) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    return isClientAccount(parsed) ? parsed : null;
  } catch (error) {
    if (__DEV__) console.error('Unable to restore the client account.', error);
    return null;
  }
}

export async function writeClientAccount(userId: string, account: ClientAccount): Promise<void> {
  if (Platform.OS === 'web') {
    webAccounts.set(userId, account);
    return;
  }
  await SecureStore.setItemAsync(keyFor(userId), JSON.stringify(account), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function deleteClientAccount(userId: string): Promise<void> {
  if (Platform.OS === 'web') {
    webAccounts.delete(userId);
    return;
  }
  await SecureStore.deleteItemAsync(keyFor(userId));
}

export const secureClientAccountCache: ClientAccountCache = {
  read: readClientAccount,
  write: writeClientAccount,
  delete: deleteClientAccount,
};
