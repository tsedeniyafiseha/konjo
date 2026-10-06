import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { BookingDraftStorage } from '@/application/booking/booking-draft-controller';
import type { BookingDraft, BookingPaymentMethodId } from '@/application/booking/booking-contracts';

const STORAGE_PREFIX = 'konjo.booking.draft.v1';
const DRAFT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredBookingDraft {
  draft: BookingDraft;
  updatedAt: number;
}

const keyFor = (userId: string) => `${STORAGE_PREFIX}.${userId.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
const paymentMethods: readonly BookingPaymentMethodId[] = ['telebirr', 'cbe', 'card', 'cash'];

function isBookingDraft(value: unknown): value is BookingDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<BookingDraft>;
  return (
    typeof draft.requestId === 'string' && draft.requestId.length >= 12 &&
    typeof draft.professionalId === 'string' && draft.professionalId.length > 0 &&
    typeof draft.serviceIndex === 'number' && Number.isInteger(draft.serviceIndex) && draft.serviceIndex >= 0 &&
    (draft.dateIso === null || typeof draft.dateIso === 'string') &&
    (draft.time === null || typeof draft.time === 'string') &&
    (draft.addressId === null || typeof draft.addressId === 'string') &&
    paymentMethods.includes(draft.paymentMethod as BookingPaymentMethodId)
  );
}

async function readSerialized(key: string): Promise<string | null> {
  if (Platform.OS !== 'web') return SecureStore.getItemAsync(key);
  return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
}

async function writeSerialized(key: string, value: string): Promise<void> {
  if (Platform.OS !== 'web') {
    await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    return;
  }
  if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
}

export async function readBookingDraft(userId: string): Promise<BookingDraft | null> {
  const key = keyFor(userId);
  const serialized = await readSerialized(key);
  if (!serialized) return null;
  try {
    const stored = JSON.parse(serialized) as Partial<StoredBookingDraft>;
    if (
      !isBookingDraft(stored.draft) ||
      typeof stored.updatedAt !== 'number' ||
      Date.now() - stored.updatedAt > DRAFT_LIFETIME_MS
    ) {
      await deleteBookingDraft(userId);
      return null;
    }
    return stored.draft;
  } catch (error) {
    if (__DEV__) console.error('Unable to restore the booking draft.', error);
    await deleteBookingDraft(userId);
    return null;
  }
}

export async function writeBookingDraft(userId: string, draft: BookingDraft): Promise<void> {
  await writeSerialized(keyFor(userId), JSON.stringify({ draft, updatedAt: Date.now() } satisfies StoredBookingDraft));
}

export async function deleteBookingDraft(userId: string): Promise<void> {
  const key = keyFor(userId);
  if (Platform.OS !== 'web') {
    await SecureStore.deleteItemAsync(key);
    return;
  }
  if (typeof window !== 'undefined') window.localStorage.removeItem(key);
}

export const secureBookingDraftStorage: BookingDraftStorage = {
  read: readBookingDraft,
  write: writeBookingDraft,
  delete: deleteBookingDraft,
};
