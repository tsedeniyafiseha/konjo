import type { DatabaseSync } from 'node:sqlite';

import type {
  ProcessPaymentEventResult,
  ProcessPaymentEventStoreInput,
} from '../../application/contracts.ts';
import type { PaymentEventStore } from '../../application/ports.ts';
import { domainEventTypes } from '../../domain/events.ts';
import type { SqliteBookingPaymentSettlement } from './booking-payment-settlement.ts';
import { type BookingRow, type PaymentIntentRow, toApiPaymentIntent } from './booking-records.ts';
import type { SqliteDomainEventOutbox } from './domain-event-outbox.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqlitePaymentEventRepository implements PaymentEventStore {
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

  processPaymentEvent(input: ProcessPaymentEventStoreInput): ProcessPaymentEventResult {
    return this.unitOfWork.run(() => {
      const duplicate = this.database.prepare(
        'SELECT payment_intent_id, payload_hash FROM payment_events WHERE event_id = ?',
      ).get(input.eventId) as unknown as { payment_intent_id: string; payload_hash: string } | undefined;
      if (duplicate) {
        if (duplicate.payload_hash !== input.payloadHash) return { result: 'invalid_transition' };
        const payment = this.database.prepare('SELECT * FROM payment_intents WHERE id = ?')
          .get(duplicate.payment_intent_id) as unknown as PaymentIntentRow;
        return {
          result: 'duplicate',
          paymentIntent: toApiPaymentIntent(payment),
        };
      }

      const payment = this.database.prepare(
        'SELECT * FROM payment_intents WHERE provider_reference = ? AND provider = ?',
      ).get(input.providerReference, input.provider) as unknown as PaymentIntentRow | undefined;
      if (!payment) return { result: 'not_found' };
      if (input.verifiedAmount !== undefined && (input.verifiedAmount !== payment.amount || input.verifiedCurrency !== payment.currency)) {
        return { result: 'invalid_transition' };
      }
      const booking = this.database.prepare('SELECT * FROM bookings WHERE id = ?').get(payment.booking_id) as unknown as BookingRow;
      if (payment.status === 'refunded' || payment.status === 'cash_due' || payment.status === 'cash_collected') {
        return { result: 'invalid_transition' };
      }
      if (payment.status === 'failed' && input.status !== 'failed') {
        return { result: 'invalid_transition' };
      }
      if (payment.status === 'captured' && input.status !== 'captured') {
        return { result: 'invalid_transition' };
      }
      if (
        payment.status === 'authorized' &&
        input.status !== 'authorized' &&
        input.status !== 'captured' &&
        input.status !== 'failed'
      ) {
        return { result: 'invalid_transition' };
      }

      this.database.prepare(`
        INSERT INTO payment_events (event_id, payment_intent_id, event_type, payload_hash, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(input.eventId, payment.id, input.status, input.payloadHash, input.occurredAt);
      const updated = this.database.prepare(`
        UPDATE payment_intents SET status = ?, version = version + 1, updated_at = ?
        WHERE id = ? AND version = ?
      `).run(input.status, input.occurredAt, payment.id, payment.version);
      if (updated.changes === 0) {
        return this.unitOfWork.abort({ result: 'invalid_transition' as const });
      }
      if (input.status === 'captured' && payment.status !== 'captured') {
        this.settlement.recordLedgerGroup(`capture:${payment.id}`, payment, [
          { account: 'provider_clearing', amount: payment.amount },
          { account: 'escrow_liability', amount: -payment.amount },
        ], input.occurredAt);
        this.settlement.settleFullyPaidSplitBooking(booking, input.occurredAt);
      }
      const eventType = {
        authorized: domainEventTypes.paymentAuthorized,
        captured: domainEventTypes.paymentCaptured,
        failed: domainEventTypes.paymentFailed,
      }[input.status];
      this.domainEvents.enqueue({
        eventType,
        schemaVersion: 1,
        aggregateType: 'payment',
        aggregateId: payment.id,
        aggregateVersion: payment.version + 1,
        occurredAt: input.occurredAt,
        correlationId: payment.booking_id,
        causationId: input.eventId,
        payload: {
          clientId: payment.client_id,
          professionalId: booking.professional_id,
          stage: payment.stage ?? 'full',
          bookingId: payment.booking_id,
          paymentIntentId: payment.id,
          provider: payment.provider,
          reason: 'provider_webhook',
        },
      });
      const row = this.database.prepare('SELECT * FROM payment_intents WHERE id = ?')
        .get(payment.id) as unknown as PaymentIntentRow;
      return { result: 'updated', paymentIntent: toApiPaymentIntent(row) };
    });
  }
}
