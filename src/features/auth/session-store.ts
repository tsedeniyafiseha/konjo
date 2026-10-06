import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { AuthSession, SessionStorage } from '@/application/auth/session-controller';

const SESSION_KEY = 'konjo.auth.session.v1';
let webSession: AuthSession | null = null;

function readWebSession(): string | null {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    return window.sessionStorage.getItem(SESSION_KEY);
  }
  return webSession ? JSON.stringify(webSession) : null;
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<AuthSession>;
  return (
    (candidate.source === 'development' || candidate.source === 'api') &&
    (candidate.role === 'client' || candidate.role === 'professional' || candidate.role === 'admin') &&
    (candidate.authMethod === 'phone_otp' || candidate.authMethod === 'email_password' || candidate.authMethod === 'google') &&
    typeof candidate.userId === 'string' &&
    typeof candidate.expiresAt === 'number' &&
    (candidate.source !== 'api' || typeof candidate.accessToken === 'string')
  );
}

export async function readSession(): Promise<AuthSession | null> {
  const serialized = Platform.OS === 'web' ? readWebSession() : await SecureStore.getItemAsync(SESSION_KEY);
  if (!serialized) return null;

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isAuthSession(parsed) || parsed.expiresAt <= Date.now()) {
      await clearSession();
      return null;
    }

    return parsed;
  } catch (error) {
    if (__DEV__) console.error('Unable to restore the authentication session.', error);
    await clearSession();
    return null;
  }
}

export async function writeSession(session: AuthSession): Promise<void> {
  if (Platform.OS === 'web') {
    webSession = session;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    }
    return;
  }

  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSession(): Promise<void> {
  if (Platform.OS === 'web') {
    webSession = null;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(SESSION_KEY);
    }
    return;
  }

  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export const secureSessionStorage: SessionStorage = {
  read: readSession,
  write: writeSession,
  clear: clearSession,
};
