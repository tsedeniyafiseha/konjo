import type { DatabaseSync } from 'node:sqlite';

import type { ApiUser } from '../../../../shared/api-contracts.ts';
import type {
  CompleteClientOnboardingResult,
  CompleteClientOnboardingStoreInput,
  DeleteAccountStoreInput,
  UpdateClientProfileStoreInput,
} from '../../application/contracts.ts';
import type { ClientAccountCommandStore } from '../../application/ports.ts';
import { domainEventTypes } from '../../domain/events.ts';
import { readClientData } from './client-records.ts';
import type { SqliteDomainEventOutbox } from './domain-event-outbox.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

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

export class SqliteClientAccountCommandRepository implements ClientAccountCommandStore {
  private readonly database: DatabaseSync;
  private readonly unitOfWork: SqliteUnitOfWork;
  private readonly domainEvents: SqliteDomainEventOutbox;

  constructor(
    database: DatabaseSync,
    domainEvents: SqliteDomainEventOutbox,
    unitOfWork = new SqliteUnitOfWork(database),
  ) {
    this.database = database;
    this.domainEvents = domainEvents;
    this.unitOfWork = unitOfWork;
  }

  updateProfile(input: UpdateClientProfileStoreInput): ApiUser | null {
    const result = this.database.prepare(`
      UPDATE users
      SET full_name = ?, phone_number = ?, preferred_language = COALESCE(?, preferred_language)
      WHERE id = ? AND role = 'client'
    `).run(input.fullName, input.phoneNumber, input.preferredLanguage ?? null, input.userId);
    if (result.changes !== 1) return null;
    const row = this.database.prepare('SELECT * FROM users WHERE id = ?')
      .get(input.userId) as unknown as UserRow;
    return toApiUser(row);
  }

  completeOnboarding(input: CompleteClientOnboardingStoreInput): CompleteClientOnboardingResult {
    const serviceZone = input.address
      ? this.database.prepare('SELECT label, travel_fee FROM service_zones WHERE lower(label) = lower(?) AND active = 1')
        .get(input.address.zone) as unknown as { label: string; travel_fee: number } | undefined
      : undefined;
    if (input.address && !serviceZone) return { result: 'service_zone_unavailable' };

    return this.unitOfWork.run(() => {
      const updated = this.database.prepare(`
        UPDATE users
        SET full_name = ?, phone_number = ?, preferred_language = ?, onboarding_completed_at = ?
        WHERE id = ? AND role = 'client'
      `).run(
        input.fullName,
        input.phoneNumber,
        input.preferredLanguage,
        input.occurredAt,
        input.userId,
      );
      if (updated.changes !== 1) {
        return this.unitOfWork.abort({ result: 'client_not_found' as const });
      }
      if (input.address && serviceZone) {
        const existing = this.database.prepare(`
          SELECT COUNT(*) AS count FROM client_addresses WHERE client_id = ?
        `).get(input.userId) as unknown as { count: number };
        if (existing.count === 0) {
          this.database.prepare(`
            INSERT INTO client_addresses (
              id, client_id, label, zone, detail, fee, is_default, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
          `).run(
            input.address.id,
            input.userId,
            input.address.label,
            serviceZone.label,
            input.address.detail,
            serviceZone.travel_fee,
            input.occurredAt,
            input.occurredAt,
          );
        }
      }
      const account = readClientData(this.database, input.userId).account;
      if (!account) throw new Error('Completed client account could not be read.');
      return { result: 'completed', account };
    });
  }

  deleteAccount(input: DeleteAccountStoreInput): boolean {
    return this.unitOfWork.run(() => {
      if (input.role === 'professional') {
        this.database.prepare('DELETE FROM professionals WHERE id = ?').run(input.userId);
      }
      const result = this.database.prepare('DELETE FROM users WHERE id = ? AND role = ?')
        .run(input.userId, input.role);
      if (result.changes === 1) {
        this.domainEvents.enqueue({
          eventType: domainEventTypes.accountDeleted,
          schemaVersion: 1,
          aggregateType: 'account',
          aggregateId: input.userId,
          aggregateVersion: 1,
          occurredAt: input.occurredAt,
          correlationId: `account:${input.userId}:deletion`,
          causationId: null,
          payload: { userId: input.userId, role: input.role },
        });
      }
      return result.changes === 1;
    });
  }
}
