import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { ApiAccountRole, ApiUser } from '../../../../shared/api-contracts.ts';
import type {
  OtpChallengeStore,
  OtpVerificationChallenge,
  OtpVerificationStore,
} from '../../application/ports.ts';

interface UserRow {
  id: string;
  role: 'client' | 'professional';
  email: string;
  full_name: string;
  phone_number: string | null;
  password_hash: string;
  created_at: string;
}

function toApiUser(row: UserRow): ApiUser {
  return {
    id: row.id,
    role: row.role,
    email: row.password_hash === 'phone-otp' ? null : row.email,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    createdAt: row.created_at,
  };
}

export class SqliteOtpRepository implements OtpChallengeStore, OtpVerificationStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  countRecentOtpChallenges(phoneNumber: string, since: number): number {
    const row = this.database.prepare(`
      SELECT COUNT(*) AS count FROM otp_challenges WHERE phone_number = ? AND created_at >= ?
    `).get(phoneNumber, since) as unknown as { count: number };
    return row.count;
  }

  createOtpChallenge(input: {
    id: string;
    phoneNumber: string;
    role: Exclude<ApiAccountRole, 'admin'>;
    codeHash: string;
    expiresAt: number;
    attempts: number;
    createdAt: number;
  }): void {
    this.database.prepare(`
      INSERT INTO otp_challenges (
        id, phone_number, role, code_hash, expires_at, attempts_remaining, consumed_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
    `).run(
      input.id,
      input.phoneNumber,
      input.role,
      input.codeHash,
      input.expiresAt,
      input.attempts,
      input.createdAt,
    );
  }

  deleteOtpChallenge(challengeId: string): void {
    this.database.prepare('DELETE FROM otp_challenges WHERE id = ?').run(challengeId);
  }

  findOtpChallenge(challengeId: string): OtpVerificationChallenge | null {
    const row = this.database.prepare('SELECT * FROM otp_challenges WHERE id = ?')
      .get(challengeId) as unknown as {
        id: string;
        phone_number: string;
        role: Exclude<ApiAccountRole, 'admin'>;
        code_hash: string;
        expires_at: number;
        attempts_remaining: number;
        consumed_at: number | null;
      } | undefined;
    return row ? {
      id: row.id,
      phoneNumber: row.phone_number,
      role: row.role,
      codeHash: row.code_hash,
      expiresAt: row.expires_at,
      attemptsRemaining: row.attempts_remaining,
      consumedAt: row.consumed_at,
    } : null;
  }

  recordOtpFailure(challengeId: string): void {
    this.database.prepare(`
      UPDATE otp_challenges
      SET attempts_remaining = MAX(0, attempts_remaining - 1)
      WHERE id = ? AND consumed_at IS NULL
    `).run(challengeId);
  }

  consumeOtpChallenge(challengeId: string, consumedAt: number): boolean {
    const result = this.database.prepare(`
      UPDATE otp_challenges SET consumed_at = ?
      WHERE id = ? AND consumed_at IS NULL AND expires_at > ? AND attempts_remaining > 0
    `).run(consumedAt, challengeId, consumedAt);
    return result.changes === 1;
  }

  findOrCreatePhoneUser(input: {
    shouldCreateUser?: boolean;
    userId: string;
    phoneNumber: string;
    role: Exclude<ApiAccountRole, 'admin'>;
    createdAt: string;
  }): ApiUser | null {
    const existing = this.database.prepare('SELECT * FROM users WHERE phone_number = ? AND role = ?')
      .get(input.phoneNumber, input.role) as unknown as UserRow | undefined;
    if (existing) return toApiUser(existing);
    if (input.shouldCreateUser === false) return null;

    const identityHash = createHash('sha256').update(`${input.role}:${input.phoneNumber}`).digest('hex');
    const internalEmail = `phone-${identityHash}@identity.konjo.invalid`;
    const fullName = input.role === 'client' ? 'Konjo client' : 'Konjo professional';
    this.database.prepare(`
      INSERT INTO users (id, role, email, full_name, phone_number, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?, 'phone-otp', ?)
    `).run(input.userId, input.role, internalEmail, fullName, input.phoneNumber, input.createdAt);
    return {
      id: input.userId,
      role: input.role,
      email: null,
      fullName,
      phoneNumber: input.phoneNumber,
      createdAt: input.createdAt,
    };
  }

  attachVerifiedPhone(input: {
    userId: string;
    phoneNumber: string;
    role: Exclude<ApiAccountRole, 'admin'>;
  }): ApiUser | null {
    const conflict = this.database.prepare(`
      SELECT id FROM users WHERE phone_number = ? AND role = ? AND id != ?
    `).get(input.phoneNumber, input.role, input.userId) as unknown as { id: string } | undefined;
    if (conflict) return null;

    const result = this.database.prepare(`
      UPDATE users SET phone_number = ? WHERE id = ? AND role = ?
    `).run(input.phoneNumber, input.userId, input.role);
    if (result.changes !== 1) return null;
    const row = this.database.prepare('SELECT * FROM users WHERE id = ?')
      .get(input.userId) as unknown as UserRow;
    return toApiUser(row);
  }
}
