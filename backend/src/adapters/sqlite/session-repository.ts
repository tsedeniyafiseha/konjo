import type { DatabaseSync } from 'node:sqlite';

import type { ApiAccountRole, ApiUser } from '../../../../shared/api-contracts.ts';
import type { SessionStore } from '../../application/ports.ts';

interface UserRow {
  id: string;
  role: 'client' | 'professional';
  email: string;
  full_name: string;
  phone_number: string | null;
  password_hash: string;
  created_at: string;
}

interface AdministratorRow {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
}

export class SqliteSessionRepository implements SessionStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  createSession(input: {
    userId: string;
    role: ApiAccountRole;
    tokenHash: string;
    expiresAt: number;
    createdAt: string;
  }): void {
    if (input.role === 'admin') {
      this.database.prepare(`
        INSERT INTO admin_sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)
      `).run(input.tokenHash, input.userId, input.expiresAt, input.createdAt);
      return;
    }
    this.database.prepare(`
      INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)
    `).run(input.tokenHash, input.userId, input.expiresAt, input.createdAt);
  }

  findUserForSession(tokenHash: string, now: number): ApiUser | null {
    this.database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    this.database.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(now);
    const row = this.database.prepare(`
      SELECT users.* FROM users
      JOIN sessions ON sessions.user_id = users.id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(tokenHash, now) as unknown as UserRow | undefined;
    if (row) {
      return {
        id: row.id,
        role: row.role,
        email: row.password_hash === 'phone-otp' ? null : row.email,
        fullName: row.full_name,
        phoneNumber: row.phone_number,
        createdAt: row.created_at,
      };
    }
    const admin = this.database.prepare(`
      SELECT administrators.* FROM administrators
      JOIN admin_sessions ON admin_sessions.admin_id = administrators.id
      WHERE admin_sessions.token_hash = ? AND admin_sessions.expires_at > ?
    `).get(tokenHash, now) as unknown as AdministratorRow | undefined;
    return admin ? {
      id: admin.id,
      role: 'admin',
      email: admin.email,
      fullName: admin.full_name,
      phoneNumber: null,
      createdAt: admin.created_at,
    } : null;
  }

  deleteSession(tokenHash: string): void {
    this.database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    this.database.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
  }
}
