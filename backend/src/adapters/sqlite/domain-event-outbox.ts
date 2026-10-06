import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { DomainEventStore } from '../../application/ports.ts';
import type { DomainEventEnvelope, DomainEventType } from '../../domain/events.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqliteDomainEventOutbox implements DomainEventStore {
  private readonly database: DatabaseSync;
  private readonly unitOfWork: SqliteUnitOfWork;

  constructor(database: DatabaseSync, unitOfWork = new SqliteUnitOfWork(database)) {
    this.database = database;
    this.unitOfWork = unitOfWork;
  }

  enqueue(event: Omit<DomainEventEnvelope, 'eventId' | 'attempt'>): string {
    const eventId = randomUUID();
    this.database.prepare(`
      INSERT INTO domain_event_outbox (
        event_id, event_type, schema_version, aggregate_type, aggregate_id,
        aggregate_version, occurred_at, correlation_id, causation_id, payload_json,
        status, attempts, available_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)
    `).run(
      eventId,
      event.eventType,
      event.schemaVersion,
      event.aggregateType,
      event.aggregateId,
      event.aggregateVersion,
      event.occurredAt,
      event.correlationId,
      event.causationId,
      JSON.stringify(event.payload),
      event.occurredAt,
      event.occurredAt,
    );
    return eventId;
  }

  claimDomainEvents(input: {
    workerId: string;
    now: string;
    lockedUntil: string;
    limit: number;
  }): ReadonlyArray<DomainEventEnvelope> {
    return this.unitOfWork.run(() => {
      const rows = this.database.prepare(`
        SELECT * FROM domain_event_outbox
        WHERE (status = 'pending' AND available_at <= ?)
           OR (status = 'processing' AND locked_until <= ?)
        ORDER BY occurred_at, aggregate_type, aggregate_id, aggregate_version, event_id
        LIMIT ?
      `).all(input.now, input.now, input.limit) as unknown as Array<{
        event_id: string;
        event_type: DomainEventType;
        schema_version: number;
        aggregate_type: string;
        aggregate_id: string;
        aggregate_version: number;
        occurred_at: string;
        correlation_id: string;
        causation_id: string | null;
        payload_json: string;
        attempts: number;
      }>;
      const claim = this.database.prepare(`
        UPDATE domain_event_outbox
        SET status = 'processing', attempts = attempts + 1, locked_by = ?, locked_until = ?, last_error = NULL
        WHERE event_id = ?
      `);
      for (const row of rows) claim.run(input.workerId, input.lockedUntil, row.event_id);
      return rows.map((row) => ({
        eventId: row.event_id,
        eventType: row.event_type,
        schemaVersion: row.schema_version,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        aggregateVersion: row.aggregate_version,
        occurredAt: row.occurred_at,
        correlationId: row.correlation_id,
        causationId: row.causation_id,
        payload: JSON.parse(row.payload_json) as Record<string, unknown>,
        attempt: row.attempts + 1,
      }));
    });
  }

  markDomainEventProcessed(eventId: string, workerId: string, processedAt: string): boolean {
    const result = this.database.prepare(`
      UPDATE domain_event_outbox
      SET status = 'processed', processed_at = ?, locked_by = NULL, locked_until = NULL, last_error = NULL
      WHERE event_id = ? AND status = 'processing' AND locked_by = ?
    `).run(processedAt, eventId, workerId);
    return result.changes > 0;
  }

  recordDomainEventFailure(input: {
    eventId: string;
    workerId: string;
    failedAt: string;
    availableAt: string;
    errorMessage: string;
    terminal: boolean;
  }): boolean {
    const result = this.database.prepare(`
      UPDATE domain_event_outbox
      SET status = ?, available_at = ?, locked_by = NULL, locked_until = NULL,
          last_error = ?, processed_at = ?
      WHERE event_id = ? AND status = 'processing' AND locked_by = ?
    `).run(
      input.terminal ? 'failed' : 'pending',
      input.availableAt,
      input.errorMessage,
      input.terminal ? input.failedAt : null,
      input.eventId,
      input.workerId,
    );
    return result.changes > 0;
  }
}
