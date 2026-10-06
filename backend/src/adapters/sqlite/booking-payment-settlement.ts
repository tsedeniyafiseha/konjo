import { randomUUID } from 'node:crypto';
import { money } from '../../../../shared/booking-payments.ts';
import type { DatabaseSync } from 'node:sqlite';

import type { ApiBooking } from '../../../../shared/api-contracts.ts';
import { domainEventTypes } from '../../domain/events.ts';
import type { BookingRow, PaymentIntentRow } from './booking-records.ts';
import type { SqliteDomainEventOutbox } from './domain-event-outbox.ts';

type LedgerAccount =
  | 'provider_clearing'
  | 'escrow_liability'
  | 'professional_payable'
  | 'platform_commission';

export class SqliteBookingPaymentSettlement {
  private readonly database: DatabaseSync;
  private readonly domainEvents: SqliteDomainEventOutbox;

  constructor(database: DatabaseSync, domainEvents: SqliteDomainEventOutbox) {
    this.database = database;
    this.domainEvents = domainEvents;
  }

  recordLedgerGroup(
    entryGroup: string,
    payment: PaymentIntentRow,
    entries: ReadonlyArray<{ account: LedgerAccount; amount: number }>,
    createdAt: string,
  ): void {
    if (entries.reduce((sum, entry) => sum + Math.round(entry.amount * 100), 0) !== 0) {
      throw new Error(`Unbalanced ledger group: ${entryGroup}`);
    }
    const insert = this.database.prepare(`
      INSERT OR IGNORE INTO ledger_entries (
        id, booking_id, payment_intent_id, entry_group, account, amount, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const entry of entries) {
      insert.run(randomUUID(), payment.booking_id, payment.id, entryGroup, entry.account, entry.amount, createdAt);
    }
  }

  // Konjo's take is the fee on the base price plus the fee on any extras the
  // professional named at checkout; the professional receives the rest (mirrors Postgres).
  // A client reward is funded by Konjo, so it comes out of the commission.
  commissionForBooking(booking: BookingRow): number {
    return Math.round(booking.service_price * booking.commission_rate_bps / 10_000)
      + Math.round((booking.extra_amount ?? 0) * booking.commission_rate_bps / 10_000)
      - (booking.discount_amount ?? 0);
  }

  settleCancelledBookingPayment(
    booking: BookingRow,
    policy: NonNullable<ApiBooking['cancellationPolicy']>,
    occurredAt: string,
  ): void {
    const payment = this.database.prepare("SELECT * FROM payment_intents WHERE booking_id = ? AND status <> 'failed' ORDER BY created_at DESC LIMIT 1")
      .get(booking.id) as unknown as PaymentIntentRow | undefined;
    if (!payment || payment.status === 'refunded') return;
    if (payment.status === 'cash_collected') throw new Error('Collected cash cannot be refunded automatically.');
    const professionalAmount = policy === 'full_refund' ? 0 : Math.min(booking.travel_fee, payment.amount);
    const commissionAmount = policy === 'client_no_show' ? Math.min(this.commissionForBooking(booking), money(payment.amount - professionalAmount)) : 0;
    const retainedAmount = money(commissionAmount + professionalAmount);
    const refundAmount = money(Math.max(0, payment.amount - retainedAmount));
    if (payment.status === 'captured') {
      this.recordLedgerGroup(`cancellation:${policy}:${payment.id}`, payment, [
        { account: 'provider_clearing', amount: -refundAmount },
        { account: 'escrow_liability', amount: payment.amount },
        { account: 'professional_payable', amount: -professionalAmount },
        { account: 'platform_commission', amount: -commissionAmount },
      ], occurredAt);
      if (retainedAmount > 0) {
        this.database.prepare(`
          INSERT OR IGNORE INTO professional_earnings (
            id, professional_id, booking_id, gross_amount, commission_amount, net_amount, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          booking.professional_id,
          booking.id,
          retainedAmount,
          commissionAmount,
          professionalAmount,
          occurredAt,
        );
      }
    } else if (payment.status === 'cash_due' && retainedAmount > 0) {
      const adjusted = this.database.prepare(`
        UPDATE payment_intents SET amount = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).run(retainedAmount, occurredAt, payment.id, payment.version);
      if (adjusted.changes === 0) throw new Error('The payment changed during cancellation settlement.');
      return;
    }
    const refundedAmount = payment.status === 'captured' ? refundAmount : 0;
    const updated = this.database.prepare(`
      UPDATE payment_intents
      SET status = 'refunded', refunded_amount = ?, version = version + 1, updated_at = ?
      WHERE id = ? AND version = ?
    `).run(refundedAmount, occurredAt, payment.id, payment.version);
    if (updated.changes === 0) throw new Error('The payment changed during cancellation settlement.');
    this.domainEvents.enqueue({
      eventType: domainEventTypes.paymentRefunded,
      schemaVersion: 1,
      aggregateType: 'payment',
      aggregateId: payment.id,
      aggregateVersion: payment.version + 1,
      occurredAt,
      correlationId: booking.client_request_id ?? booking.id,
      causationId: `booking:${booking.id}:cancelled`,
      payload: {
        clientId: payment.client_id,
        bookingId: booking.id,
        paymentIntentId: payment.id,
        provider: payment.provider,
        reason: 'booking_cancellation',
        refundedAmount,
      },
    });
  }

  releaseBookingPayment(booking: BookingRow, occurredAt: string): boolean {
    const payment = this.database.prepare('SELECT * FROM payment_intents WHERE booking_id = ?')
      .get(booking.id) as unknown as PaymentIntentRow | undefined;
    if (!payment) return false;
    if (payment.status === 'cash_due') {
      const collected = this.database.prepare(`
        UPDATE payment_intents SET status = 'cash_collected', version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).run(occurredAt, payment.id, payment.version);
      if (collected.changes === 0) return false;
      this.domainEvents.enqueue({
        eventType: domainEventTypes.paymentCaptured,
        schemaVersion: 1,
        aggregateType: 'payment',
        aggregateId: payment.id,
        aggregateVersion: payment.version + 1,
        occurredAt,
        correlationId: booking.client_request_id ?? booking.id,
        causationId: `booking:${booking.id}:completed`,
        payload: {
          clientId: payment.client_id,
          bookingId: booking.id,
          paymentIntentId: payment.id,
          provider: payment.provider,
          reason: 'cash_collection',
        },
      });
      payment.status = 'cash_collected';
      payment.version += 1;
      this.recordLedgerGroup(`capture:${payment.id}`, payment, [
        { account: 'provider_clearing', amount: payment.amount },
        { account: 'escrow_liability', amount: -payment.amount },
      ], occurredAt);
    }
    if (payment.status !== 'captured' && payment.status !== 'cash_collected') return false;
    const commissionAmount = this.commissionForBooking(booking);
    this.recordLedgerGroup(`release:${payment.id}`, payment, [
      { account: 'escrow_liability', amount: payment.amount },
      { account: 'professional_payable', amount: -(payment.amount - commissionAmount) },
      { account: 'platform_commission', amount: -commissionAmount },
    ], occurredAt);
    return true;
  }

  /** Called inside the capture transaction; checkout alone never creates earnings. */
  settleFullyPaidSplitBooking(booking: BookingRow, occurredAt: string): void {
    if (booking.payment_plan !== 'split' || booking.status !== 'completed') return;
    const payments = this.database.prepare("SELECT * FROM payment_intents WHERE booking_id = ? AND status = 'captured' ORDER BY stage")
      .all(booking.id) as unknown as PaymentIntentRow[];
    if (money(payments.reduce((sum, payment) => sum + payment.amount - payment.refunded_amount, 0)) !== booking.total) return;
    const commission = this.commissionForBooking(booking);
    let allocated = 0;
    payments.forEach((payment, index) => {
      const part = index === payments.length - 1 ? money(commission - allocated) : money(commission * payment.amount / booking.total);
      allocated = money(allocated + part);
      this.recordLedgerGroup(`release:${payment.id}`, payment, [
        { account: 'escrow_liability', amount: payment.amount },
        { account: 'professional_payable', amount: -money(payment.amount - part) },
        { account: 'platform_commission', amount: -part },
      ], occurredAt);
    });
    this.database.prepare(`INSERT OR IGNORE INTO professional_earnings
      (id, professional_id, booking_id, gross_amount, commission_amount, net_amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(randomUUID(), booking.professional_id, booking.id,
      booking.total, commission, money(booking.total - commission), occurredAt);
  }
}
