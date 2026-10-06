import type { DatabaseSync } from 'node:sqlite';

import type { ApiUser } from '../../../../shared/api-contracts.ts';
import type {
  AccountAuthenticationStore,
  AccountCredentials,
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

interface AdministratorRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  created_at: string;
}

function clientCredentials(row: UserRow): AccountCredentials {
  return {
    user: {
      id: row.id,
      role: row.role,
      email: row.password_hash === 'phone-otp' ? null : row.email,
      fullName: row.full_name,
      phoneNumber: row.phone_number,
      createdAt: row.created_at,
    },
    passwordHash: row.password_hash,
  };
}

function adminCredentials(row: AdministratorRow): AccountCredentials {
  return {
    user: {
      id: row.id,
      role: 'admin',
      email: row.email,
      fullName: row.full_name,
      phoneNumber: null,
      createdAt: row.created_at,
    },
    passwordHash: row.password_hash,
  };
}

export class SqliteAccountAuthenticationRepository implements AccountAuthenticationStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  createClient(input: {
    userId: string;
    email: string;
    fullName: string;
    passwordHash: string;
    createdAt: string;
  }): ApiUser {
    this.database.prepare(`
      INSERT INTO users (id, role, email, full_name, phone_number, password_hash, created_at)
      VALUES (?, 'client', ?, ?, NULL, ?, ?)
    `).run(input.userId, input.email, input.fullName, input.passwordHash, input.createdAt);
    return {
      id: input.userId,
      role: 'client',
      email: input.email,
      fullName: input.fullName,
      phoneNumber: null,
      createdAt: input.createdAt,
    };
  }

  findClientCredentials(email: string): AccountCredentials | null {
    const row = this.database.prepare("SELECT * FROM users WHERE email = ? AND role = 'client'")
      .get(email) as unknown as UserRow | undefined;
    return row ? clientCredentials(row) : null;
  }

  findAdminCredentials(email: string): AccountCredentials | null {
    const row = this.database.prepare('SELECT * FROM administrators WHERE email = ?')
      .get(email) as unknown as AdministratorRow | undefined;
    return row ? adminCredentials(row) : null;
  }

  createAdministrator(input: {
    administratorId: string;
    email: string;
    fullName: string;
    passwordHash: string;
    createdAt: string;
  }): ApiUser {
    const existing = this.findAdminCredentials(input.email);
    if (existing) return existing.user;
    this.database.prepare(`
      INSERT INTO administrators (id, email, full_name, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      input.administratorId,
      input.email,
      input.fullName,
      input.passwordHash,
      input.createdAt,
    );
    return {
      id: input.administratorId,
      role: 'admin',
      email: input.email,
      fullName: input.fullName,
      phoneNumber: null,
      createdAt: input.createdAt,
    };
  }
}
