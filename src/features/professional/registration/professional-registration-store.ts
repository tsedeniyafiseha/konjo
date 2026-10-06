import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type {
  ProfessionalRegistrationStorage,
  StoredProfessionalRegistration,
} from '@/application/professional-registration/professional-registration-controller';

const STORAGE_KEY = 'konjo.professional.registration.v2';
const webRegistrations = new Map<string, StoredProfessionalRegistration>();

function storageKey(userId: string): string {
  return `${STORAGE_KEY}.${userId.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

function isStoredRegistration(value: unknown): value is StoredProfessionalRegistration {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredProfessionalRegistration>;
  return Boolean(candidate.draft && typeof candidate.draft === 'object') &&
    (candidate.application === null || Boolean(candidate.application && typeof candidate.application === 'object'));
}

export async function readProfessionalRegistration(userId: string): Promise<StoredProfessionalRegistration | null> {
  const key = storageKey(userId);
  let serialized: string | null;
  if (Platform.OS === 'web') {
    try {
      serialized = typeof globalThis.localStorage === 'undefined'
        ? webRegistrations.has(userId) ? JSON.stringify(webRegistrations.get(userId)) : null
        : globalThis.localStorage.getItem(key);
    } catch {
      serialized = webRegistrations.has(userId) ? JSON.stringify(webRegistrations.get(userId)) : null;
    }
  } else {
    serialized = await SecureStore.getItemAsync(key);
  }
  if (!serialized) return null;

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isStoredRegistration(parsed)) return null;
    return parsed;
  } catch (error) {
    if (__DEV__) console.error('Unable to restore the professional registration.', error);
    return null;
  }
}

export async function writeProfessionalRegistration(userId: string, value: StoredProfessionalRegistration): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof globalThis.localStorage === 'undefined') webRegistrations.set(userId, value);
      else globalThis.localStorage.setItem(storageKey(userId), JSON.stringify(value));
    } catch {
      webRegistrations.set(userId, value);
    }
    return;
  }
  await SecureStore.setItemAsync(storageKey(userId), JSON.stringify(value), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearProfessionalRegistration(userId: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(storageKey(userId));
    } finally {
      webRegistrations.delete(userId);
    }
    return;
  }
  await SecureStore.deleteItemAsync(storageKey(userId));
}

export const secureProfessionalRegistrationStorage: ProfessionalRegistrationStorage = {
  read: readProfessionalRegistration,
  write: writeProfessionalRegistration,
  delete: clearProfessionalRegistration,
};
