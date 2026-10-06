import { Linking, Platform } from 'react-native';

import { apiBaseUrl } from '@/services/api-client';

/** Where people can reach Konjo. Configured per deployment; the email always has a value. */
export const supportEmail = (process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '').trim() || 'Info@Konjo.com';
export const supportPhone = (process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? '').trim() || null;

/** Public legal pages served by the web app or, failing that, by the API's website routes. */
export function legalUrl(page: 'privacy' | 'terms' | 'delete-account'): string {
  const webUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? '').trim().replace(/\/$/, '');
  const base = /^https?:\/\//.test(webUrl) ? webUrl : apiBaseUrl ?? 'https://konjo.com';
  return `${base}/${page}`;
}

export function openSupportEmail(subject: string, body = ''): Promise<void> {
  const url = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
  return Linking.openURL(url).then(() => undefined);
}

export function openSupportPhone(): Promise<void> | null {
  if (!supportPhone) return null;
  return Linking.openURL(`${Platform.OS === 'android' ? 'tel' : 'telprompt'}:${supportPhone}`).then(() => undefined);
}

export function openLegalPage(page: 'privacy' | 'terms' | 'delete-account'): Promise<void> {
  return Linking.openURL(legalUrl(page)).then(() => undefined);
}
