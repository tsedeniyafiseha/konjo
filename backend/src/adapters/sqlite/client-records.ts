import type { DatabaseSync } from 'node:sqlite';

import type {
  ApiClientAddress,
  ApiClientData,
  ApiClientPreferredLanguage,
  ApiNotificationPreferences,
} from '../../../../shared/api-contracts.ts';

interface ClientUserRow {
  id: string;
  email: string;
  full_name: string;
  phone_number: string | null;
  password_hash: string;
  preferred_language: ApiClientPreferredLanguage;
  onboarding_completed_at: string | null;
}

export interface ClientAddressRow {
  id: string;
  client_id: string;
  label: string;
  zone: string;
  detail: string;
  fee: number;
  is_default: number;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
  updated_at: string;
}

interface NotificationPreferencesRow {
  booking_updates: number;
  promotions: number;
  chat_messages: number;
  sms_reminders: number;
}

export const defaultNotificationPreferences: ApiNotificationPreferences = {
  bookingUpdates: true,
  promotions: false,
  smsReminders: true,
};

export function toApiClientAddress(row: ClientAddressRow): ApiClientAddress {
  return {
    id: row.id,
    label: row.label,
    zone: row.zone,
    detail: row.detail,
    fee: row.fee,
    isDefault: row.is_default === 1,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    createdAt: row.created_at,
  };
}

export function readClientData(database: DatabaseSync, userId: string): ApiClientData {
  const user = database.prepare("SELECT * FROM users WHERE id = ? AND role = 'client'")
    .get(userId) as unknown as ClientUserRow | undefined;
  if (!user) return {
    account: null,
    favouriteIds: [],
    notificationPreferences: defaultNotificationPreferences,
  };

  const addresses = database.prepare(`
    SELECT * FROM client_addresses WHERE client_id = ? ORDER BY is_default DESC, created_at ASC
  `).all(userId) as unknown as ClientAddressRow[];
  const favouriteRows = database.prepare(`
    SELECT professional_id FROM client_favorites WHERE client_id = ? ORDER BY created_at ASC
  `).all(userId) as unknown as Array<{ professional_id: string }>;
  const preferences = database.prepare('SELECT * FROM notification_preferences WHERE client_id = ?')
    .get(userId) as unknown as NotificationPreferencesRow | undefined;
  const apiAddresses = addresses.map(toApiClientAddress);

  return {
    account: user.onboarding_completed_at ? {
      profile: {
        fullName: user.full_name,
        email: user.password_hash === 'phone-otp' ? null : user.email,
        phoneNumber: user.phone_number,
        preferredLanguage: user.preferred_language,
      },
      addresses: apiAddresses,
      defaultAddressId: apiAddresses.find((address) => address.isDefault)?.id ?? null,
      completedAt: user.onboarding_completed_at,
    } : null,
    favouriteIds: favouriteRows.map((row) => row.professional_id),
    notificationPreferences: preferences ? {
      bookingUpdates: preferences.booking_updates === 1,
      promotions: preferences.promotions === 1,
      smsReminders: preferences.sms_reminders === 1,
    } : defaultNotificationPreferences,
  };
}
