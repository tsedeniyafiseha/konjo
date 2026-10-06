import type { DatabaseSync } from 'node:sqlite';
import type { ClientPreferenceCommandStore } from '../../application/ports.ts';

export class SqliteClientPreferenceCommandRepository implements ClientPreferenceCommandStore {
  private readonly database: DatabaseSync;
  constructor(database: DatabaseSync) { this.database = database; }

  setFavorite(input: Parameters<ClientPreferenceCommandStore['setFavorite']>[0]) {
    const professional = this.database.prepare('SELECT id FROM professionals WHERE id = ? AND hidden = 0 AND suspended = 0').get(input.professionalId);
    if (!professional) return 'professional_not_found' as const;
    if (input.favorite) this.database.prepare('INSERT OR IGNORE INTO client_favorites (client_id, professional_id, created_at) VALUES (?, ?, ?)').run(input.userId, input.professionalId, input.occurredAt);
    else this.database.prepare('DELETE FROM client_favorites WHERE client_id = ? AND professional_id = ?').run(input.userId, input.professionalId);
    return 'updated' as const;
  }

  updateNotificationPreferences(input: Parameters<ClientPreferenceCommandStore['updateNotificationPreferences']>[0]) {
    const value = input.preferences;
    this.database.prepare(`INSERT INTO notification_preferences (client_id, booking_updates, promotions, sms_reminders, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(client_id) DO UPDATE SET booking_updates = excluded.booking_updates, promotions = excluded.promotions, sms_reminders = excluded.sms_reminders, updated_at = excluded.updated_at`)
      .run(input.userId, value.bookingUpdates ? 1 : 0, value.promotions ? 1 : 0, value.smsReminders ? 1 : 0, input.occurredAt);
    return value;
  }

  registerDevice(input: Parameters<ClientPreferenceCommandStore['registerDevice']>[0]) {
    const existing = this.database.prepare('SELECT id, created_at FROM device_registrations WHERE token = ?').get(input.token) as unknown as { id: string; created_at: string } | undefined;
    const id = existing?.id ?? input.registrationId;
    this.database.prepare(`INSERT INTO device_registrations (id, user_id, platform, token, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform, active = 1, updated_at = excluded.updated_at`)
      .run(id, input.userId, input.platform, input.token, existing?.created_at ?? input.occurredAt, input.occurredAt);
    return { id, platform: input.platform, tokenPreview: `…${input.token.slice(-6)}`, createdAt: existing?.created_at ?? input.occurredAt };
  }

  unregisterDevice(input: Parameters<ClientPreferenceCommandStore['unregisterDevice']>[0]) {
    return this.database.prepare('UPDATE device_registrations SET active = 0, updated_at = ? WHERE id = ? AND user_id = ?').run(input.occurredAt, input.registrationId, input.userId).changes > 0;
  }
}
