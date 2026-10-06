import type { DatabaseSync } from 'node:sqlite';

import type { PasswordResetStore } from '../../application/ports.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqlitePasswordResetRepository implements PasswordResetStore {
  private readonly database: DatabaseSync;
  private readonly unitOfWork: SqliteUnitOfWork;

  constructor(database: DatabaseSync, unitOfWork = new SqliteUnitOfWork(database)) {
    this.database = database;
    this.unitOfWork = unitOfWork;
  }

  findResettableClient(email: string): { userId: string; email: string } | null {
    const row = this.database.prepare(`
      SELECT id, email FROM users
      WHERE email = ? AND role = 'client' AND password_hash != 'phone-otp'
    `).get(email) as unknown as { id: string; email: string } | undefined;
    return row ? { userId: row.id, email: row.email } : null;
  }

  createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: number;
    createdAt: number;
  }): void {
    this.unitOfWork.run(() => {
      this.database.prepare(`
        UPDATE password_reset_tokens SET consumed_at = ?
        WHERE user_id = ? AND consumed_at IS NULL
      `).run(input.createdAt, input.userId);
      this.database.prepare(`
        INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, consumed_at, created_at)
        VALUES (?, ?, ?, NULL, ?)
      `).run(input.tokenHash, input.userId, input.expiresAt, input.createdAt);
    });
  }

  deletePasswordResetToken(tokenHash: string): void {
    this.database.prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?').run(tokenHash);
  }

  resetPassword(tokenHash: string, passwordHash: string, now: number): boolean {
    return this.unitOfWork.run(() => {
      const token = this.database.prepare(`
        SELECT token_hash, user_id FROM password_reset_tokens
        WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > ?
      `).get(tokenHash, now) as unknown as { token_hash: string; user_id: string } | undefined;
      if (!token) {
        return this.unitOfWork.abort(false);
      }
      this.database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, token.user_id);
      this.database.prepare('UPDATE password_reset_tokens SET consumed_at = ? WHERE token_hash = ?')
        .run(now, tokenHash);
      this.database.prepare('DELETE FROM sessions WHERE user_id = ?').run(token.user_id);
      return true;
    });
  }
}
