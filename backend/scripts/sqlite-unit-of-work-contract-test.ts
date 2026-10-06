import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { SqliteUnitOfWork } from '../src/adapters/sqlite/unit-of-work.ts';

const database = new DatabaseSync(':memory:');
try {
  database.exec('CREATE TABLE records (id TEXT PRIMARY KEY)');
  const unitOfWork = new SqliteUnitOfWork(database);
  const insert = database.prepare('INSERT INTO records (id) VALUES (?)');
  const count = () => (
    database.prepare('SELECT COUNT(*) AS count FROM records').get() as { count: number }
  ).count;

  assert.equal(unitOfWork.run(() => {
    insert.run('committed');
    return 'result';
  }), 'result');
  assert.equal(count(), 1);

  assert.throws(() => unitOfWork.run(() => {
    insert.run('failed');
    throw new Error('operation failed');
  }), /operation failed/);
  assert.equal(count(), 1);

  assert.equal(unitOfWork.run(() => {
    insert.run('aborted');
    return unitOfWork.abort('conflict' as const);
  }), 'conflict');
  assert.equal(count(), 1);

  assert.throws(() => unitOfWork.run(() => unitOfWork.run(() => undefined)), /Nested SQLite transactions/);
  assert.equal(unitOfWork.run(() => 'recovered'), 'recovered');
  assert.throws(() => unitOfWork.abort('invalid'), /outside an active SQLite transaction/);
} finally {
  database.close();
}

console.log('SQLite unit-of-work contracts passed.');
