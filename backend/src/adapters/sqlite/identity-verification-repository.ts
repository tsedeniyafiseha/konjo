import type { DatabaseSync } from 'node:sqlite';

import type { ApiClientIdentityStatus } from '../../../../shared/api-contracts.ts';
import type { IdentityVerificationStore } from '../../application/ports.ts';

export class SqliteIdentityVerificationRepository implements IdentityVerificationStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  recordClientVerification(
    userId: string,
    lastFour: string,
    verifiedAt: string,
  ): ApiClientIdentityStatus {
    this.database.prepare(`
      INSERT INTO client_identity_verifications (user_id, fayda_last_four, verified_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        fayda_last_four = excluded.fayda_last_four,
        verified_at = excluded.verified_at
    `).run(userId, lastFour, verifiedAt);
    return { verified: true, faydaLastFour: lastFour, verifiedAt };
  }
}
