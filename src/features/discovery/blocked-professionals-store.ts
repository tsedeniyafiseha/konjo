import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { BlockedProfessionalsStorage } from '@/application/discovery/discovery-controller';

const STORAGE_KEY = 'konjo.blocked-professionals.v1';

function parse(value: string | null): readonly string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((item): item is string => typeof item === 'string' && item.length > 0))]
      : [];
  } catch {
    return [];
  }
}

export const secureBlockedProfessionalsStorage: BlockedProfessionalsStorage = {
  async read() {
    const value = Platform.OS === 'web'
      ? globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
      : await SecureStore.getItemAsync(STORAGE_KEY);
    return parse(value);
  },
  async write(professionalIds) {
    const value = JSON.stringify([...new Set(professionalIds)]);
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(STORAGE_KEY, value);
      return;
    }
    await SecureStore.setItemAsync(STORAGE_KEY, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
};
