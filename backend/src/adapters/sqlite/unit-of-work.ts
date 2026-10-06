import type { DatabaseSync } from 'node:sqlite';

class SqliteTransactionAbort {
  readonly value: unknown;

  constructor(value: unknown) {
    this.value = value;
  }
}

export class SqliteUnitOfWork {
  private readonly database: DatabaseSync;
  private active = false;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  run<T>(work: () => T): T {
    if (this.active) {
      throw new Error('Nested SQLite transactions are not supported.');
    }
    this.active = true;
    try {
      this.database.exec('BEGIN IMMEDIATE');
      try {
        const result = work();
        this.database.exec('COMMIT');
        return result;
      } catch (error) {
        this.database.exec('ROLLBACK');
        if (error instanceof SqliteTransactionAbort) return error.value as T;
        throw error;
      }
    } finally {
      this.active = false;
    }
  }

  abort<T>(value: T): never {
    if (!this.active) {
      throw new Error('Cannot abort outside an active SQLite transaction.');
    }
    throw new SqliteTransactionAbort(value);
  }
}
