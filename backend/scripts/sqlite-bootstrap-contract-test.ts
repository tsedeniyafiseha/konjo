import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { configureSqlite, migrateSqliteSchema } from '../src/adapters/sqlite/schema.ts';
import { seedSqliteReferenceData } from '../src/adapters/sqlite/seed-data.ts';
import { SqliteDomainEventOutbox } from '../src/adapters/sqlite/domain-event-outbox.ts';
import { SqliteTrustSafetyCommandRepository } from '../src/adapters/sqlite/trust-safety-command-repository.ts';
import { SqliteUnitOfWork } from '../src/adapters/sqlite/unit-of-work.ts';
import { SqliteAdminReadRepository } from '../src/adapters/sqlite/admin-read-repository.ts';

const database = new DatabaseSync(':memory:');
const seededAt = '2026-09-18T12:00:00.000Z';

function count(table: string): number {
  return (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
}

try {
  configureSqlite(database);
  assert.equal((database.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys, 1);

  migrateSqliteSchema(database);
  migrateSqliteSchema(database);
  seedSqliteReferenceData(database, seededAt);
  seedSqliteReferenceData(database, '2026-09-18T13:00:00.000Z');
  migrateSqliteSchema(database);

  assert.equal(count('service_zones'), 8);
  assert.equal(count('service_categories'), 6);
  assert.equal(count('professionals'), 4);
  assert.equal(count('professional_catalog_zones'), 11);
  assert.equal(count('professional_catalog_working_days'), 28);
  assert.equal(count('professional_availability'), 4);

  const setting = database.prepare(`
    SELECT value_integer, updated_at FROM platform_settings WHERE key = 'commission_rate_bps'
  `).get() as { value_integer: number; updated_at: string };
  assert.deepEqual({ ...setting }, { value_integer: 1800, updated_at: seededAt });

  const availability = database.prepare(`
    SELECT available, updated_at FROM professional_availability WHERE professional_id = 'hanan'
  `).get() as { available: number; updated_at: string };
  assert.deepEqual({ ...availability }, { available: 1, updated_at: seededAt });

  database.prepare(`
    INSERT INTO users (id, role, email, full_name, phone_number, password_hash, created_at)
    VALUES ('client-moderation', 'client', 'moderation@example.com', 'Moderation Client', NULL, 'hash', ?)
  `).run(seededAt);
  database.prepare(`
    INSERT INTO administrators (id, email, full_name, password_hash, created_at)
    VALUES ('admin-moderation', 'admin@example.com', 'Moderation Admin', 'hash', ?)
  `).run(seededAt);
  const unitOfWork = new SqliteUnitOfWork(database);
  const moderation = new SqliteTrustSafetyCommandRepository(
    database,
    new SqliteDomainEventOutbox(database, unitOfWork),
    unitOfWork,
  );
  const created = moderation.createContentReport({
    reportId: 'report-1',
    reportedById: 'client-moderation',
    targetType: 'professional',
    targetId: 'hanan',
    reason: 'safety_concern',
    details: 'The messages felt unsafe.',
    occurredAt: seededAt,
  });
  assert.equal(created.result, 'created');
  assert.equal(moderation.createContentReport({
    reportId: 'report-duplicate',
    reportedById: 'client-moderation',
    targetType: 'professional',
    targetId: 'hanan',
    reason: 'other',
    details: '',
    occurredAt: seededAt,
  }).result, 'existing');
  assert.equal(moderation.setProfessionalBlocked({
    clientId: 'client-moderation', professionalId: 'hanan', blocked: true, occurredAt: seededAt,
  }), true);
  assert.deepEqual(moderation.listBlockedProfessionals('client-moderation'), ['hanan']);
  const resolved = moderation.resolveContentReport({
    auditId: 'audit-report-1', adminId: 'admin-moderation', reportId: 'report-1',
    status: 'resolved', action: 'suspend_professional', resolution: 'Account suspended for review.', occurredAt: seededAt,
  });
  assert.equal(resolved?.status, 'resolved');
  assert.equal((database.prepare("SELECT suspended FROM professionals WHERE id = 'hanan'").get() as { suspended: number }).suspended, 1);
  assert.equal(new SqliteAdminReadRepository(database).listContentReports().length, 1);
} finally {
  database.close();
}

console.log('SQLite bootstrap contracts passed.');

const legacyDatabase = new DatabaseSync(':memory:');
try {
  configureSqlite(legacyDatabase);
  legacyDatabase.exec(`
    CREATE TABLE bookings (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE professionals (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      base_zone TEXT NOT NULL,
      services_json TEXT NOT NULL
    );
    CREATE TABLE payout_batches (
      id TEXT PRIMARY KEY,
      professional_id TEXT NOT NULL,
      status TEXT NOT NULL,
      amount INTEGER NOT NULL,
      booking_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      paid_at TEXT
    );
  `);
  migrateSqliteSchema(legacyDatabase);
  // Payout batches created before manual settlement details existed gain the new columns.
  const legacyPayoutColumns = legacyDatabase
    .prepare('PRAGMA table_info(payout_batches)')
    .all() as unknown as Array<{ name: string }>;
  for (const column of ['version', 'payout_method_json', 'paid_reference', 'paid_note', 'paid_by']) {
    assert.equal(legacyPayoutColumns.some((item) => item.name === column), true, `legacy payout_batches table gains ${column}`);
  }
  // A database created before later professional columns existed must still
  // accept the reference seed, which writes every current column.
  const legacyProfessionalColumns = legacyDatabase
    .prepare('PRAGMA table_info(professionals)')
    .all() as unknown as Array<{ name: string }>;
  for (const column of ['gender', 'education_level', 'language_skills_json', 'female_only_eligible']) {
    assert.equal(legacyProfessionalColumns.some((item) => item.name === column), true, `legacy professionals table gains ${column}`);
  }
  seedSqliteReferenceData(legacyDatabase, seededAt);
  assert.equal(
    (legacyDatabase.prepare("SELECT COUNT(*) AS count FROM professionals WHERE gender = 'female'").get() as { count: number }).count,
    4,
  );
  const legacyBookingColumns = legacyDatabase
    .prepare('PRAGMA table_info(bookings)')
    .all() as unknown as Array<{ name: string }>;
  assert.equal(legacyBookingColumns.some((column) => column.name === 'accept_by'), true);
  assert.equal(
    Boolean(legacyDatabase.prepare(`
      SELECT 1 FROM sqlite_schema
      WHERE type = 'index' AND name = 'bookings_accept_by_idx'
    `).get()),
    true,
  );
} finally {
  legacyDatabase.close();
}

console.log('Legacy SQLite schema upgrade contract passed.');
