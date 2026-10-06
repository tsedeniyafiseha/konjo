import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { Clock } from '../src/application/ports.ts';
import { DomainEventDeadLetterManager } from '../src/application/manage-domain-event-dead-letters.ts';
import { KonjoDatabase } from '../src/database.ts';

const directory = mkdtempSync(join(tmpdir(), 'konjo-domain-event-recovery-'));
const path = join(directory, 'konjo.db');
const failedAt = '2026-09-17T18:00:00.000Z';
const replayedAt = '2026-09-17T19:00:00.000Z';
const eventId = 'dead-letter-contract-event';
const database = new KonjoDatabase(path);
const rawDatabase = new DatabaseSync(path);

try {
  const admin = database.accountAuthenticationStore.createAdministrator({
    administratorId: 'recovery-admin',
    email: 'recovery-admin@konjo.local',
    fullName: 'Recovery admin',
    passwordHash: 'test-hash',
    createdAt: failedAt,
  });
  rawDatabase.prepare(`
    INSERT INTO domain_event_outbox (
      event_id, event_type, schema_version, aggregate_type, aggregate_id,
      aggregate_version, occurred_at, correlation_id, causation_id, payload_json,
      status, attempts, available_at, locked_by, locked_until, last_error,
      processed_at, created_at
    ) VALUES (?, 'BookingRequested', 1, 'booking', 'booking-1', 1, ?, 'request-1',
      NULL, '{}', 'failed', 5, ?, NULL, NULL, 'projector unavailable', ?, ?)
  `).run(eventId, failedAt, failedAt, failedAt, failedAt);

  const clock: Clock = { now: () => new Date(replayedAt) };
  const manager = new DomainEventDeadLetterManager(database.domainEventRecoveryStore, clock);
  assert.deepEqual(await manager.list(10), [{
    eventId,
    eventType: 'BookingRequested',
    schemaVersion: 1,
    aggregateType: 'booking',
    aggregateId: 'booking-1',
    aggregateVersion: 1,
    occurredAt: failedAt,
    correlationId: 'request-1',
    causationId: null,
    attempts: 5,
    lastError: 'projector unavailable',
    failedAt,
  }]);
  assert.equal(await manager.replay('missing-event', admin.id), 'not_found');
  assert.equal(await manager.replay(eventId, admin.id), 'replayed');
  assert.deepEqual(await manager.list(10), []);

  const replayed = rawDatabase.prepare(`
    SELECT status, attempts, available_at, locked_by, locked_until, last_error, processed_at
    FROM domain_event_outbox WHERE event_id = ?
  `).get(eventId) as unknown as Record<string, unknown>;
  assert.deepEqual({ ...replayed }, {
    status: 'pending',
    attempts: 0,
    available_at: replayedAt,
    locked_by: null,
    locked_until: null,
    last_error: null,
    processed_at: null,
  });
  assert.equal(await manager.replay(eventId, admin.id), 'not_failed');

  const audit = (await database.adminReadStore.listAuditLogs(1))[0];
  assert.equal(audit.adminId, admin.id);
  assert.equal(audit.action, 'domain_event.replayed');
  assert.equal(audit.targetType, 'domain_event');
  assert.equal(audit.targetId, eventId);
  assert.equal(audit.createdAt, replayedAt);
  assert.deepEqual(audit.metadata, {
    eventType: 'BookingRequested',
    aggregateType: 'booking',
    aggregateId: 'booking-1',
    previousAttempts: 5,
    previousError: 'projector unavailable',
  });
} finally {
  rawDatabase.close();
  rmSync(directory, { recursive: true, force: true });
}

console.log('Domain event dead-letter recovery contracts passed.');
