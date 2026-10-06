import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

/**
 * expo-notifications registers a push-token listener at module load, and in
 * Expo Go on Android that throws ("Android Push notifications … removed from
 * Expo Go with the release of SDK 53"). A plain `import` would therefore make
 * every screen that touches notifications fail to load. Load it lazily and
 * report null where push cannot work: web, and Expo Go on Android. The in-app
 * inbox keeps polling the API either way; only system push is skipped.
 */
export function loadNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web' || (Platform.OS === 'android' && isRunningInExpoGo())) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule;
  } catch (error) {
    if (__DEV__) console.warn('System notifications are unavailable in this build.', error);
    cached = null;
  }
  return cached;
}
