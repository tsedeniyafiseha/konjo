import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { loadNotifications } from './expo-notifications-module';
import { notificationService } from './notification-service';

/**
 * Acquires an Expo push token on a physical device and registers it with the
 * backend so booking updates can wake the phone. Returns null wherever push is
 * not possible (web, simulators, Expo Go on Android, missing EAS project id).
 */
let handlerInstalled = false;

export function installNotificationHandler(): void {
  if (handlerInstalled || Platform.OS === 'web') return;
  const Notifications = loadNotifications();
  if (!Notifications) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

function projectId(): string | null {
  const fromConfig = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEas = Constants.easConfig?.projectId;
  return typeof fromConfig === 'string' ? fromConfig : typeof fromEas === 'string' ? fromEas : null;
}

const REGISTRATION_KEY = 'konjo.push-registration.v1';
let registrationVersion = 0;
let pendingRegistration: Promise<string | null> | null = null;

export async function unregisterPushNotifications(userId: string, accessToken: string): Promise<void> {
  if (Platform.OS === 'web') return;
  registrationVersion += 1;
  await pendingRegistration;
  const stored = await SecureStore.getItemAsync(REGISTRATION_KEY);
  if (!stored) return;
  const registration = JSON.parse(stored) as { userId: string; id: string };
  if (registration.userId !== userId) return;
  await notificationService.unregisterDevice(registration.id, accessToken);
  await SecureStore.deleteItemAsync(REGISTRATION_KEY);
}

export function registerForPushNotifications(userId: string, accessToken: string): Promise<string | null> {
  const version = ++registrationVersion;
  pendingRegistration = registerDevice(userId, accessToken, version);
  return pendingRegistration;
}

async function registerDevice(userId: string, accessToken: string, version: number): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  const Notifications = loadNotifications();
  if (!Notifications) return null;
  const easProjectId = projectId();
  if (!easProjectId) {
    if (__DEV__) console.warn('Push notifications need an EAS project id (app.json → extra.eas.projectId).');
    return null;
  }
  try {
    installNotificationHandler();
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('bookings', {
        name: 'Booking updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3F6B3A',
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
    if (!permission.granted || version !== registrationVersion) return null;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId: easProjectId })).data;
    if (version !== registrationVersion) return null;
    const registration = await notificationService.registerDevice(token, Platform.OS === 'ios' ? 'ios' : 'android', accessToken);
    if (version !== registrationVersion) {
      await notificationService.unregisterDevice(registration.id, accessToken);
      return null;
    }
    await SecureStore.setItemAsync(REGISTRATION_KEY, JSON.stringify({ userId, id: registration.id }));
    return token;
  } catch (error) {
    if (__DEV__) console.warn('Push registration failed.', error);
    return null;
  }
}
