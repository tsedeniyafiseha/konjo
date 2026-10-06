import type { DatabaseSync } from 'node:sqlite';

import type { ApiPayoutBatch } from '../../../../shared/api-contracts.ts';
import type {
  ProfessionalPayoutCommandResult,
  QueueAdminPayoutStoreInput,
  QueueProfessionalPayoutStoreInput,
  SettleAdminPayoutStoreInput,
  SettleProfessionalPayoutStoreInput,
} from '../../application/contracts.ts';
import type { AdminPayoutCommandStore, ProfessionalPayoutCommandStore } from '../../application/ports.ts';
import { domainEventTypes } from '../../domain/events.ts';
import type { SqliteDomainEventOutbox } from './domain-event-outbox.ts';
import { type PayoutRow, toApiPayoutBatch } from './payout-records.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

const toApiPayout = toApiPayoutBatch;

export class SqliteProfessionalPayoutCommandRepository implements ProfessionalPayoutCommandStore, AdminPayoutCommandStore {
  private readonly database: DatabaseSync;
  private readonly domainEvents: SqliteDomainEventOutbox;
  private readonly unitOfWork: SqliteUnitOfWork;

  constructor(
    database: DatabaseSync,
    domainEvents: SqliteDomainEventOutbox,
    unitOfWork = new SqliteUnitOfWork(database),
  ) {
    this.database = database;
    this.domainEvents = domainEvents;
    this.unitOfWork = unitOfWork;
  }

  queuePayout(input: QueueProfessionalPayoutStoreInput): ProfessionalPayoutCommandResult {
    return this.unitOfWork.run(() => this.queueInTransaction(input));
  }

  private queueInTransaction(input: QueueProfessionalPayoutStoreInput): ProfessionalPayoutCommandResult {
    const earnings = this.database.prepare(`
      SELECT id, net_amount FROM professional_earnings
      WHERE professional_id = ? AND payout_id IS NULL ORDER BY created_at
    `).all(input.professionalId) as unknown as Array<{ id: string; net_amount: number }>;
    if (!earnings.length) return null;
    // Snapshot where this batch goes so later edits never rewrite history.
    const registered = this.database.prepare(
      'SELECT payout_method_json FROM professional_applications WHERE user_id = ?',
    ).get(input.professionalId) as unknown as { payout_method_json: string | null } | undefined;
    const payoutMethodJson = registered?.payout_method_json ?? '{}';
    const payout: ApiPayoutBatch = {
      id: input.payoutId,
      professionalId: input.professionalId,
      status: 'queued',
      amount: earnings.reduce((sum, earning) => sum + earning.net_amount, 0),
      bookingCount: earnings.length,
      createdAt: input.occurredAt,
      paidAt: null,
      payoutMethod: toApiPayout({
        id: '', professional_id: '', status: 'queued', amount: 0, booking_count: 0, version: 1,
        created_at: '', paid_at: null, payout_method_json: payoutMethodJson,
      }).payoutMethod,
      paidReference: null,
      paidNote: null,
    };
    this.database.prepare(`
      INSERT INTO payout_batches (
        id, professional_id, status, amount, booking_count, created_at, paid_at, payout_method_json
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
    `).run(
      payout.id,
      payout.professionalId,
      payout.status,
      payout.amount,
      payout.bookingCount,
      payout.createdAt,
      payoutMethodJson,
    );
    const claim = this.database.prepare(
      'UPDATE professional_earnings SET payout_id = ? WHERE id = ? AND payout_id IS NULL',
    );
    for (const earning of earnings) {
      if (claim.run(payout.id, earning.id).changes !== 1) {
        throw new Error('A professional earning changed while the payout was being queued.');
      }
    }
    this.domainEvents.enqueue({
      eventType: domainEventTypes.payoutQueued,
      schemaVersion: 1,
      aggregateType: 'payout',
      aggregateId: payout.id,
      aggregateVersion: 1,
      occurredAt: payout.createdAt,
      correlationId: payout.id,
      causationId: null,
      payload: {
        payoutId: payout.id,
        professionalId: payout.professionalId,
        amount: payout.amount,
        bookingCount: payout.bookingCount,
      },
    });
    return payout;
  }

  settlePayout(input: SettleProfessionalPayoutStoreInput): ProfessionalPayoutCommandResult {
    return this.unitOfWork.run(() => this.settleInTransaction(input));
  }

  private settleInTransaction(input: SettleProfessionalPayoutStoreInput): ProfessionalPayoutCommandResult {
    const stored = this.database.prepare(`
      SELECT * FROM payout_batches WHERE id = ? AND professional_id = ?
    `).get(input.payoutId, input.professionalId) as unknown as PayoutRow | undefined;
    if (!stored) return null;
    if (stored.status === 'paid') return toApiPayout(stored);
    if (stored.status !== 'queued') return null;

    const updated = this.database.prepare(`
      UPDATE payout_batches SET status = 'paid', paid_at = ?, version = version + 1,
        paid_reference = ?, paid_note = ?, paid_by = ?
      WHERE id = ? AND professional_id = ? AND status = 'queued' AND version = ?
    `).run(
      input.occurredAt,
      input.paidReference?.trim() || null,
      input.paidNote?.trim() || null,
      input.paidBy ?? null,
      input.payoutId,
      input.professionalId,
      stored.version,
    );
    if (updated.changes !== 1) return this.unitOfWork.abort(null);
    this.domainEvents.enqueue({
      eventType: domainEventTypes.payoutPaid,
      schemaVersion: 1,
      aggregateType: 'payout',
      aggregateId: input.payoutId,
      aggregateVersion: stored.version + 1,
      occurredAt: input.occurredAt,
      correlationId: input.payoutId,
      causationId: `payout:${input.payoutId}:settled`,
      payload: {
        payoutId: input.payoutId,
        professionalId: input.professionalId,
        amount: stored.amount,
        bookingCount: stored.booking_count,
        ...(input.paidReference?.trim() ? { paidReference: input.paidReference.trim() } : {}),
      },
    });
    const paid = this.database.prepare('SELECT * FROM payout_batches WHERE id = ?')
      .get(input.payoutId) as unknown as PayoutRow;
    return toApiPayout(paid);
  }

  queueAdminPayout(input: QueueAdminPayoutStoreInput): ProfessionalPayoutCommandResult {
    return this.unitOfWork.run(() => {
      const payout = this.queueInTransaction({ payoutId: input.payoutId, professionalId: input.professionalId, occurredAt: input.occurredAt });
      if (!payout) return null;
      this.insertAudit(input, 'payout.queued', payout.id, {
        professionalId: input.professionalId, amount: payout.amount, bookingCount: payout.bookingCount,
      });
      return payout;
    });
  }

  settleAdminPayout(input: SettleAdminPayoutStoreInput): ProfessionalPayoutCommandResult {
    return this.unitOfWork.run(() => {
      const payout = this.settleInTransaction({
        payoutId: input.payoutId, professionalId: input.professionalId, occurredAt: input.occurredAt,
        paidReference: input.paidReference, paidNote: input.paidNote, paidBy: input.adminId,
      });
      if (!payout) return null;
      this.insertAudit(input, 'payout.paid', payout.id, {
        professionalId: input.professionalId, amount: payout.amount, paidReference: payout.paidReference,
      });
      return payout;
    });
  }

  private insertAudit(
    context: { auditId: string; adminId: string; occurredAt: string },
    action: string,
    payoutId: string,
    metadata: Record<string, unknown>,
  ): void {
    this.database.prepare(`
      INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, metadata_json, created_at)
      VALUES (?, ?, ?, 'payout', ?, ?, ?)
    `).run(context.auditId, context.adminId, action, payoutId, JSON.stringify(metadata), context.occurredAt);
  }
}
