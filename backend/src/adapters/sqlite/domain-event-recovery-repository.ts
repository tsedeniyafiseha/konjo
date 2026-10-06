import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { ApiDomainEventDeadLetter } from '../../../../shared/api-contracts.ts';
import type { DomainEventRecoveryStore } from '../../application/ports.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

interface FailedDomainEventRow {
  event_id: string;
  event_type: string;
  schema_version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  occurred_at: string;
  correlation_id: string;
  causation_id: string | null;
  attempts: number;
  last_error: string;
  processed_at: string;
}

function toDeadLetter(row: FailedDomainEventRow): ApiDomainEventDeadLetter {
  return {
    eventId: row.event_id,
    eventType: row.event_type,
    schemaVersion: row.schema_version,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    occurredAt: row.occurred_at,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    attempts: row.attempts,
    lastError: row.last_error,
    failedAt: row.processed_at,
  };
}

export class SqliteDomainEventRecoveryRepository implements DomainEventRecoveryStore {
  private readonly database: DatabaseSync;
  private readonly unitOfWork: SqliteUnitOfWork;

  constructor(database: DatabaseSync, unitOfWork = new SqliteUnitOfWork(database)) {
    this.database = database;
    this.unitOfWork = unitOfWork;
  }

  listFailedDomainEvents(limit: number): ReadonlyArray<ApiDomainEventDeadLetter> {
    const rows = this.database.prepare(`
      SELECT event_id, event_type, schema_version, aggregate_type, aggregate_id,
        aggregate_version, occurred_at, correlation_id, causation_id, attempts,
        last_error, processed_at
      FROM domain_event_outbox
      WHERE status = 'failed'
      ORDER BY processed_at DESC, occurred_at DESC, event_id
      LIMIT ?
    `).all(limit) as unknown as FailedDomainEventRow[];
    return rows.map(toDeadLetter);
  }

  replayFailedDomainEvent(
    eventId: string,
    adminId: string,
    requestedAt: string,
  ): 'replayed' | 'not_found' | 'not_failed' {
    return this.unitOfWork.run(() => {
      const event = this.database.prepare(`
        SELECT event_id, event_type, aggregate_type, aggregate_id, attempts, last_error, status
        FROM domain_event_outbox WHERE event_id = ?
      `).get(eventId) as unknown as {
        event_id: string;
        event_type: string;
        aggregate_type: string;
        aggregate_id: string;
        attempts: number;
        last_error: string | null;
        status: 'pending' | 'processing' | 'processed' | 'failed';
      } | undefined;
      if (!event) {
        return 'not_found';
      }
      if (event.status !== 'failed') {
        return 'not_failed';
      }

      const replayed = this.database.prepare(`
        UPDATE domain_event_outbox
        SET status = 'pending', attempts = 0, available_at = ?, locked_by = NULL,
          locked_until = NULL, last_error = NULL, processed_at = NULL
        WHERE event_id = ? AND status = 'failed'
      `).run(requestedAt, eventId);
      if (replayed.changes !== 1) throw new Error('The dead-letter event changed during replay.');
      this.database.prepare(`
        INSERT INTO admin_audit_logs (
          id, admin_id, action, target_type, target_id, metadata_json, created_at
        ) VALUES (?, ?, 'domain_event.replayed', 'domain_event', ?, ?, ?)
      `).run(
        randomUUID(),
        adminId,
        eventId,
        JSON.stringify({
          eventType: event.event_type,
          aggregateType: event.aggregate_type,
          aggregateId: event.aggregate_id,
          previousAttempts: event.attempts,
          previousError: event.last_error,
        }),
        requestedAt,
      );
      return 'replayed';
    });
  }
}
