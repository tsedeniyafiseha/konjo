import type { DatabaseSync } from 'node:sqlite';

import type { ReadinessProbe } from '../../application/ports.ts';

export class SqliteReadinessProbe implements ReadinessProbe {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  check(): void {
    this.database.prepare('SELECT 1 AS ready').get();
  }
}
