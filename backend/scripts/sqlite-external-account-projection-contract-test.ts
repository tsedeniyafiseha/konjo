import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { SqliteExternalAccountProjection } from '../src/adapters/sqlite/external-account-projection.ts';
import { configureSqlite, migrateSqliteSchema } from '../src/adapters/sqlite/schema.ts';
import type { ApiUser } from '../../shared/api-contracts.ts';

const database = new DatabaseSync(':memory:');
configureSqlite(database);
migrateSqliteSchema(database);
const projection = new SqliteExternalAccountProjection(database);

function user(overrides: Partial<ApiUser>): ApiUser {
  return {
    id: 'user-1', role: 'professional', email: null, fullName: 'Konjo member',
    phoneNumber: '+251911000000', createdAt: '2026-09-29T08:00:00.000Z', ...overrides,
  };
}

// A professional deleted in Supabase leaves a stale local mirror behind. When
// the same phone number registers again with a new id, the mirror must yield.
projection.synchronize(user({ id: 'old-professional' }));
const reborn = projection.synchronize(user({ id: 'new-professional' }));
assert.equal(reborn.id, 'new-professional');
const rows = (database.prepare('SELECT id, phone_number FROM users WHERE role = ? ORDER BY id').all('professional') as { id: string; phone_number: string | null }[])
  .map((row) => ({ id: row.id, phone_number: row.phone_number }));
assert.deepEqual(rows, [
  { id: 'new-professional', phone_number: '+251911000000' },
  { id: 'old-professional', phone_number: null },
]);

// The same number may belong to a client and a professional at once.
projection.synchronize(user({ id: 'client-1', role: 'client', email: 'client@example.com' }));
const client = database.prepare('SELECT phone_number FROM users WHERE id = ?').get('client-1') as { phone_number: string | null };
assert.equal(client.phone_number, '+251911000000');
const professional = database.prepare('SELECT phone_number FROM users WHERE id = ?').get('new-professional') as { phone_number: string | null };
assert.equal(professional.phone_number, '+251911000000');

// Re-synchronising the same account is idempotent.
projection.synchronize(user({ id: 'new-professional' }));
assert.equal((database.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count, 3);

console.log('SQLite external account projection contracts passed.');
