import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { NotificationDeliveryJob } from '../../application/contracts.ts';
import type { NotificationCommandStore } from '../../application/ports.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqliteNotificationOutbox implements NotificationCommandStore {
  private readonly database: DatabaseSync;
  private readonly unitOfWork: SqliteUnitOfWork;

  constructor(database: DatabaseSync, unitOfWork = new SqliteUnitOfWork(database)) {
    this.database = database;
    this.unitOfWork = unitOfWork;
  }

  enqueueNotification(
    userId: string,
    idempotencyKey: string,
    channel: 'push' | 'sms',
    template: string,
    payload: Record<string, unknown>,
    now = new Date().toISOString(),
  ): boolean {
    const user = this.database.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) return false;
    const result = this.database.prepare(`
      INSERT OR IGNORE INTO notification_outbox (
        id, idempotency_key, user_id, channel, template, payload_json,
        status, attempts, next_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
    `).run(randomUUID(), idempotencyKey, userId, channel, template, JSON.stringify(payload), now, now, now);
    return result.changes > 0;
  }

  listDueNotificationJobs(now: string, limit = 25): ReadonlyArray<NotificationDeliveryJob> {
    const rows = this.database.prepare(`
      SELECT outbox.*,
        CASE
          WHEN outbox.channel = 'push' THEN (
            SELECT token FROM device_registrations devices
            WHERE devices.user_id = outbox.user_id AND devices.active = 1
            ORDER BY devices.updated_at DESC LIMIT 1
          )
          ELSE users.phone_number
        END AS destination,
        users.preferred_language AS language
      FROM notification_outbox outbox
      JOIN users ON users.id = outbox.user_id
      WHERE outbox.status = 'pending' AND outbox.next_attempt_at <= ?
      ORDER BY outbox.created_at LIMIT ?
    `).all(now, limit) as unknown as Array<{
      push_ticket: string | null;
      push_ticket_started_at: string | null;
      push_destination: string | null;
      id: string;
      channel: 'push' | 'sms';
      template: string;
      payload_json: string;
      attempts: number;
      destination: string | null;
      language: string | null;
    }>;
    return rows.map((row) => ({
      pushTicket: row.push_ticket,
      pushTicketStartedAt: row.push_ticket_started_at,
      id: row.id,
      channel: row.channel,
      template: row.template,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      destination: row.push_destination ?? row.destination ?? '',
      attempt: row.attempts + 1,
      ...(row.language ? { language: row.language } : {}),
    }));
  }

  recordNotificationDelivery(job: NotificationDeliveryJob, result: {
    pending?: boolean;
    delivered: boolean;
    providerReference?: string;
    errorMessage?: string;
  }, recordedAt: string): void {
    const now = recordedAt;
    this.unitOfWork.run(() => {
      if (result.pending && result.providerReference) {
        this.database.prepare(`UPDATE notification_outbox SET push_ticket = ?, push_ticket_started_at = coalesce(push_ticket_started_at, ?),
          push_destination = ?, next_attempt_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'`).run(
          result.providerReference.slice('expo-ticket:'.length), now, job.destination,
          new Date(Date.parse(now) + 60_000).toISOString(), now, job.id);
        return;
      }
      if (result.errorMessage === 'DeviceNotRegistered') {
        this.database.prepare('UPDATE device_registrations SET active = 0 WHERE token = ?').run(job.destination);
      }
      this.database.prepare(`
        INSERT OR IGNORE INTO notification_deliveries (
          id, outbox_id, attempt, status, provider_reference, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(),
        job.id,
        job.attempt,
        result.delivered ? 'delivered' : 'failed',
        result.providerReference ?? null,
        result.errorMessage ?? null,
        now,
      );
      const terminal = result.delivered || job.attempt >= 3;
      const nextAttemptAt = new Date(
        Date.parse(now) + Math.min(60_000, 2 ** job.attempt * 1000),
      ).toISOString();
      this.database.prepare(`
        UPDATE notification_outbox
        SET status = ?, attempts = ?, next_attempt_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        result.delivered ? 'delivered' : terminal ? 'failed' : 'pending',
        job.attempt,
        nextAttemptAt,
        now,
        job.id,
      );
    });
  }
}
