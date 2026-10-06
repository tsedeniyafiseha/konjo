import type { DatabaseSync } from 'node:sqlite';

import type { ApiUser } from '../../../../shared/api-contracts.ts';
import type { ExternalAccountProjection } from '../../application/authenticate-access-token.ts';

export class SqliteExternalAccountProjection implements ExternalAccountProjection {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  synchronize(user: ApiUser): ApiUser {
    if (user.role === 'admin') {
      if (!user.email) throw new Error('A Supabase administrator must have an email address.');
      // Supabase is authoritative: release the email from any stale local
      // record (for example a development-bootstrapped administrator).
      this.database.prepare(`
        UPDATE administrators SET email = 'released+' || id || '@konjo.invalid'
        WHERE email = ? AND id <> ?
      `).run(user.email, user.id);
      this.database.prepare(`
        INSERT INTO administrators (id, email, full_name, password_hash, created_at)
        VALUES (?, ?, ?, 'supabase-auth', ?)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          full_name = excluded.full_name
      `).run(user.id, user.email, user.fullName, user.createdAt);
      return user;
    }

    const storageEmail = user.email ?? `${user.id}@supabase.local`;
    this.database.prepare(`
      UPDATE users SET email = 'released+' || id || '@konjo.invalid'
      WHERE email = ? AND id <> ?
    `).run(storageEmail, user.id);
    // Supabase is authoritative for phone numbers too: a number re-registered
    // after an account was deleted must not collide with the stale local
    // mirror of the old account (users_phone_role_idx), or every API request
    // from the new account fails before it reaches a route.
    if (user.phoneNumber) {
      this.database.prepare(`
        UPDATE users SET phone_number = NULL
        WHERE phone_number = ? AND role = ? AND id <> ?
      `).run(user.phoneNumber, user.role, user.id);
    }
    this.database.prepare(`
      INSERT INTO users (id, role, email, full_name, phone_number, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, 'supabase-auth', ?)
      ON CONFLICT(id) DO UPDATE SET
        role = excluded.role,
        email = excluded.email,
        full_name = excluded.full_name,
        phone_number = excluded.phone_number
    `).run(
      user.id,
      user.role,
      storageEmail,
      user.fullName,
      user.phoneNumber,
      user.createdAt,
    );
    return user;
  }
}
