import type { DatabaseSync } from 'node:sqlite';

import type {
  ApiClientRewards,
  ApiBooking,
  ApiClientData,
  ApiClientIdentityStatus,
  ApiNotificationRecord,
  ApiPaymentIntent,
} from '../../../../shared/api-contracts.ts';
import type {
  ClientPaymentLedgerAudit,
  ClientReadStore,
} from '../../application/ports.ts';
import { readClientData } from './client-records.ts';
import { clientRewards } from './client-rewards.ts';
import {
  type BookingRow,
  type PaymentIntentRow,
  toApiBooking,
  toApiPaymentIntent,
} from './booking-records.ts';

export class SqliteClientReadRepository implements ClientReadStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  getClientData(userId: string): ApiClientData {
    return readClientData(this.database, userId);
  }

  getIdentityStatus(userId: string): ApiClientIdentityStatus {
    const row = this.database.prepare(`
      SELECT fayda_last_four, verified_at
      FROM client_identity_verifications
      WHERE user_id = ?
    `).get(userId) as unknown as { fayda_last_four: string; verified_at: string } | undefined;
    return row
      ? { verified: true, faydaLastFour: row.fayda_last_four, verifiedAt: row.verified_at }
      : { verified: false, faydaLastFour: null, verifiedAt: null };
  }

  getRewards(userId: string): ApiClientRewards {
    return clientRewards(this.database, userId);
  }

  listBookings(userId: string): ReadonlyArray<ApiBooking> {
    const rows = this.database.prepare(`
      SELECT
        bookings.*,
        booking_reviews.id AS review_id,
        booking_reviews.technique_rating,
        booking_reviews.professionalism_rating,
        booking_reviews.tags_json AS review_tags_json,
        booking_reviews.review_text,
        booking_reviews.created_at AS review_created_at,
        payment_intents.id AS payment_intent_id,
        payment_intents.provider AS payment_provider,
        payment_intents.provider_reference AS payment_provider_reference,
        payment_intents.status AS payment_status,
        payment_intents.amount AS payment_amount,
        payment_intents.refunded_amount AS payment_refunded_amount,
        payment_intents.currency AS payment_currency,
        payment_intents.created_at AS payment_created_at,
        payment_intents.updated_at AS payment_updated_at
      FROM bookings
      LEFT JOIN booking_reviews ON booking_reviews.booking_id = bookings.id
      LEFT JOIN payment_intents ON payment_intents.id = (SELECT id FROM payment_intents WHERE booking_id = bookings.id ORDER BY created_at DESC LIMIT 1)
      WHERE bookings.client_id = ? AND bookings.client_archived_at IS NULL
      ORDER BY bookings.created_at DESC
    `).all(userId) as unknown as BookingRow[];
    return rows.map((row) => toApiBooking(row, this.database));
  }

  getPaymentIntent(userId: string, paymentIntentId: string): ApiPaymentIntent | null {
    const row = this.database.prepare(
      'SELECT * FROM payment_intents WHERE id = ? AND client_id = ?',
    ).get(paymentIntentId, userId) as unknown as PaymentIntentRow | undefined;
    return row ? toApiPaymentIntent(row) : null;
  }

  auditPaymentLedger(userId: string, paymentIntentId: string): ClientPaymentLedgerAudit | null {
    if (!this.getPaymentIntent(userId, paymentIntentId)) return null;
    const rows = this.database.prepare(`
      SELECT entry_group, SUM(amount) AS total, COUNT(*) AS entries
      FROM ledger_entries
      WHERE payment_intent_id = ?
      GROUP BY entry_group
      ORDER BY entry_group
    `).all(paymentIntentId) as unknown as Array<{
      entry_group: string;
      total: number;
      entries: number;
    }>;
    const groups = rows.map((row) => ({
      entryGroup: row.entry_group,
      total: row.total,
      entries: row.entries,
    }));
    return {
      balanced: groups.length > 0 && groups.every((group) => group.total === 0),
      groups,
    };
  }

  listNotifications(userId: string): ReadonlyArray<ApiNotificationRecord> {
    const rows = this.database.prepare(`
      SELECT id, channel, template, status, attempts, payload_json, read_at, created_at
      FROM notification_outbox
      WHERE user_id = ? AND channel = 'push'
      ORDER BY created_at DESC
      LIMIT 50
    `).all(userId) as unknown as Array<{
      id: string;
      channel: 'push' | 'sms';
      template: string;
      status: ApiNotificationRecord['status'];
      attempts: number;
      payload_json: string;
      read_at: string | null;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      template: row.template,
      status: row.status,
      attempts: row.attempts,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      readAt: row.read_at,
      createdAt: row.created_at,
    }));
  }
}
