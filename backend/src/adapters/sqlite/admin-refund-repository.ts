import type { DatabaseSync } from 'node:sqlite';
import { money } from '../../../../shared/booking-payments.ts';

import type { AdminRefundResult, AdminRefundStoreInput } from '../../application/contracts.ts';
import type { AdminRefundStore } from '../../application/ports.ts';
import { domainEventTypes } from '../../domain/events.ts';
import type { SqliteBookingPaymentSettlement } from './booking-payment-settlement.ts';
import {
  type BookingRow,
  type PaymentIntentRow,
  toApiPaymentIntent,
} from './booking-records.ts';
import type { SqliteDomainEventOutbox } from './domain-event-outbox.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqliteAdminRefundRepository implements AdminRefundStore {
  private readonly database: DatabaseSync;
  private readonly settlement: SqliteBookingPaymentSettlement;
  private readonly domainEvents: SqliteDomainEventOutbox;
  private readonly unitOfWork: SqliteUnitOfWork;

  constructor(
    database: DatabaseSync,
    settlement: SqliteBookingPaymentSettlement,
    domainEvents: SqliteDomainEventOutbox,
    unitOfWork = new SqliteUnitOfWork(database),
  ) {
    this.database = database;
    this.settlement = settlement;
    this.domainEvents = domainEvents;
    this.unitOfWork = unitOfWork;
  }

  refundBooking(input: AdminRefundStoreInput): AdminRefundResult {
    return this.unitOfWork.run(() => {
      const booking = this.database.prepare('SELECT * FROM bookings WHERE id = ?')
        .get(input.bookingId) as unknown as BookingRow | undefined;
      if (booking?.payment_plan === 'split') return this.refundSplitBooking(input, booking);
      const payment = this.database.prepare('SELECT * FROM payment_intents WHERE booking_id = ?')
        .get(input.bookingId) as unknown as PaymentIntentRow | undefined;
      if (!booking || !payment) return { result: 'not_found' };
      const hasPartialCancellation = booking.cancellation_policy === 'travel_fee_forfeit' ||
        booking.cancellation_policy === 'client_no_show';
      if (payment.status === 'refunded' && (!hasPartialCancellation || payment.refunded_amount >= payment.amount)) {
        this.insertAudit(input, payment.id, true);
        return { result: 'already_refunded', paymentIntent: toApiPaymentIntent(payment) };
      }
      if (payment.status === 'failed') return { result: 'not_refundable' };
      const earning = this.database.prepare(`
        SELECT payout_id FROM professional_earnings WHERE booking_id = ?
      `).get(input.bookingId) as unknown as { payout_id: string | null } | undefined;
      if (earning?.payout_id) return { result: 'payout_locked' };

      if (payment.status === 'refunded' && hasPartialCancellation) {
        const commissionAmount = booking.cancellation_policy === 'client_no_show'
          ? this.settlement.commissionForBooking(booking)
          : 0;
        const professionalAmount = booking.travel_fee;
        this.settlement.recordLedgerGroup(`admin-retained-refund:${payment.id}`, payment, [
          { account: 'provider_clearing', amount: -(payment.amount - payment.refunded_amount) },
          { account: 'professional_payable', amount: professionalAmount },
          { account: 'platform_commission', amount: commissionAmount },
        ], input.occurredAt);
        this.database.prepare('DELETE FROM professional_earnings WHERE booking_id = ?').run(input.bookingId);
      }
      const released = this.database.prepare(`
        SELECT 1 FROM ledger_entries WHERE payment_intent_id = ? AND entry_group = ? LIMIT 1
      `).get(payment.id, `release:${payment.id}`);
      if (released) {
        const commissionAmount = this.settlement.commissionForBooking(booking);
        this.settlement.recordLedgerGroup(`release-reversal:${payment.id}`, payment, [
          { account: 'escrow_liability', amount: -payment.amount },
          { account: 'professional_payable', amount: payment.amount - commissionAmount },
          { account: 'platform_commission', amount: commissionAmount },
        ], input.occurredAt);
        this.database.prepare('DELETE FROM professional_earnings WHERE booking_id = ?').run(input.bookingId);
      }
      if (payment.status === 'captured' || payment.status === 'cash_collected') {
        this.settlement.recordLedgerGroup(`refund:${payment.id}`, payment, [
          { account: 'provider_clearing', amount: -payment.amount },
          { account: 'escrow_liability', amount: payment.amount },
        ], input.occurredAt);
      }
      const updatedPayment = this.database.prepare(`
        UPDATE payment_intents
        SET status = 'refunded', refunded_amount = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).run(payment.amount, input.occurredAt, payment.id, payment.version);
      if (updatedPayment.changes !== 1) throw new Error('The payment changed during the administrator refund.');
      this.domainEvents.enqueue({
        eventType: domainEventTypes.paymentRefunded,
        schemaVersion: 1,
        aggregateType: 'payment',
        aggregateId: payment.id,
        aggregateVersion: payment.version + 1,
        occurredAt: input.occurredAt,
        correlationId: booking.client_request_id ?? input.bookingId,
        causationId: `admin-refund:${input.bookingId}`,
        payload: {
          clientId: booking.client_id,
          bookingId: input.bookingId,
          paymentIntentId: payment.id,
          provider: payment.provider,
          reason: 'admin_refund',
          refundedAmount: payment.amount,
        },
      });
      this.insertAudit(input, payment.id, false);
      const updated = this.database.prepare('SELECT * FROM payment_intents WHERE id = ?')
        .get(payment.id) as unknown as PaymentIntentRow;
      return { result: 'refunded', paymentIntent: toApiPaymentIntent(updated) };
    });
  }

  private insertAudit(input: AdminRefundStoreInput, paymentIntentId: string, duplicate: boolean): void {
    this.database.prepare(`
      INSERT INTO admin_audit_logs (
        id, admin_id, action, target_type, target_id, metadata_json, created_at
      ) VALUES (?, ?, 'payment.refunded', 'booking', ?, ?, ?)
    `).run(
      input.auditId,
      input.adminId,
      input.bookingId,
      JSON.stringify({ paymentIntentId, duplicate }),
      input.occurredAt,
    );
  }

  private refundSplitBooking(input: AdminRefundStoreInput, booking: BookingRow): AdminRefundResult {
    const payments = this.database.prepare("SELECT * FROM payment_intents WHERE booking_id = ? AND status <> 'failed' ORDER BY created_at, stage")
      .all(booking.id) as unknown as PaymentIntentRow[];
    if (!payments.length) return { result: 'not_found' };
    if (this.database.prepare('SELECT 1 FROM professional_earnings WHERE booking_id = ? AND payout_id IS NOT NULL').get(booking.id)) return { result: 'payout_locked' };
    let changed = false;
    for (const payment of payments) {
      const balances = this.database.prepare('SELECT account, SUM(amount) AS amount FROM ledger_entries WHERE payment_intent_id = ? GROUP BY account')
        .all(payment.id) as unknown as { account: 'provider_clearing' | 'escrow_liability' | 'professional_payable' | 'platform_commission'; amount: number }[];
      const remaining = money(balances.find((entry) => entry.account === 'provider_clearing')?.amount ?? 0);
      if (payment.status === 'refunded' && remaining === 0) continue;
      if (remaining > 0) this.settlement.recordLedgerGroup(`admin-refund-all:${payment.id}`, payment,
        balances.map((entry) => ({ account: entry.account, amount: -money(entry.amount) })), input.occurredAt);
      const refundedAmount = money(payment.refunded_amount + remaining);
      this.database.prepare("UPDATE payment_intents SET status = 'refunded', refunded_amount = ?, version = version + 1, updated_at = ? WHERE id = ?")
        .run(refundedAmount, input.occurredAt, payment.id);
      changed = true;
      this.domainEvents.enqueue({
        eventType: domainEventTypes.paymentRefunded, schemaVersion: 1, aggregateType: 'payment',
        aggregateId: payment.id, aggregateVersion: payment.version + 1, occurredAt: input.occurredAt,
        correlationId: booking.id, causationId: `admin-refund:${booking.id}`,
        payload: { clientId: booking.client_id, bookingId: booking.id, paymentIntentId: payment.id,
          provider: payment.provider, reason: 'admin_refund', refundedAmount },
      });
    }
    this.database.prepare('DELETE FROM professional_earnings WHERE booking_id = ?').run(booking.id);
    const last = payments.at(-1)!;
    this.insertAudit(input, last.id, !changed);
    const result = this.database.prepare('SELECT * FROM payment_intents WHERE id = ?').get(last.id) as unknown as PaymentIntentRow;
    return { result: changed ? 'refunded' : 'already_refunded', paymentIntent: toApiPaymentIntent(result) };
  }

}
