import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type {
  ClientLanguageDetector,
  ClientLanguageStorage,
} from '@/application/language/client-language-controller';

const STORAGE_KEY = 'konjo.client.language.v1';

export const deviceClientLanguageDetector: ClientLanguageDetector = {
  detect() {
    return getLocales()[0]?.languageCode === 'am' ? 'am' : 'en';
  },
};

export const secureClientLanguageStorage: ClientLanguageStorage = {
  async read() {
    const value = Platform.OS === 'web'
      ? typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY)
      : await SecureStore.getItemAsync(STORAGE_KEY);
    return value === 'am' || value === 'en' ? value : null;
  },

  async write(language) {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, language);
      return;
    }
    await SecureStore.setItemAsync(STORAGE_KEY, language, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
};
