import type { DatabaseSync } from 'node:sqlite';

import type { ApiBooking } from '../../../../shared/api-contracts.ts';
import type {
  ArchiveBookingResult,
  ArchiveBookingStoreInput,
  CancelBookingResult,
  CancelBookingStoreInput,
} from '../../application/contracts.ts';
import type { BookingCancellationStore } from '../../application/ports.ts';
import { domainEventTypes } from '../../domain/events.ts';
import type { BookingRow } from './booking-records.ts';
import type { SqliteBookingPaymentSettlement } from './booking-payment-settlement.ts';
import type { SqliteDomainEventOutbox } from './domain-event-outbox.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqliteBookingCancellationRepository implements BookingCancellationStore {
  private readonly database: DatabaseSync;
  private readonly payments: SqliteBookingPaymentSettlement;
  private readonly domainEvents: SqliteDomainEventOutbox;
  private readonly unitOfWork: SqliteUnitOfWork;

  constructor(
    database: DatabaseSync,
    payments: SqliteBookingPaymentSettlement,
    domainEvents: SqliteDomainEventOutbox,
    unitOfWork = new SqliteUnitOfWork(database),
  ) {
    this.database = database;
    this.payments = payments;
    this.domainEvents = domainEvents;
    this.unitOfWork = unitOfWork;
  }

  archiveBooking(input: ArchiveBookingStoreInput): ArchiveBookingResult {
    const booking = this.database.prepare('SELECT status, client_archived_at FROM bookings WHERE id = ? AND client_id = ?')
      .get(input.bookingId, input.clientId) as unknown as { status: string; client_archived_at: string | null } | undefined;
    if (!booking) return 'not_found';
    if (booking.status !== 'completed' && booking.status !== 'cancelled') return 'not_allowed';
    if (!booking.client_archived_at) {
      this.database.prepare('UPDATE bookings SET client_archived_at = ? WHERE id = ? AND client_id = ?')
        .run(input.occurredAt, input.bookingId, input.clientId);
    }
    return 'archived';
  }

  cancelBooking(input: CancelBookingStoreInput): CancelBookingResult {
    return this.unitOfWork.run(() => {
      const booking = this.database.prepare(
        'SELECT * FROM bookings WHERE id = ? AND client_id = ?',
      ).get(input.bookingId, input.clientId) as unknown as BookingRow | undefined;
      if (!booking) {
        return 'not_found';
      }
      if (booking.status === 'cancelled') {
        return 'cancelled';
      }
      if (booking.status !== 'requested' && booking.status !== 'accepted' && booking.status !== 'on_the_way') {
        return 'not_allowed';
      }

      const cancellationPolicy: NonNullable<ApiBooking['cancellationPolicy']> = booking.status === 'on_the_way'
        ? 'travel_fee_forfeit'
        : 'full_refund';
      const updated = this.database.prepare(`
        UPDATE bookings
        SET status = 'cancelled', cancelled_by = 'client', cancellation_policy = ?, version = version + 1
        WHERE id = ? AND client_id = ? AND version = ?
      `).run(cancellationPolicy, input.bookingId, input.clientId, booking.version);
      if (updated.changes === 0) {
        return this.unitOfWork.abort('not_allowed' as const);
      }
      this.payments.settleCancelledBookingPayment(booking, cancellationPolicy, input.occurredAt);
      this.domainEvents.enqueue({
        eventType: domainEventTypes.bookingCancelled,
        schemaVersion: 1,
        aggregateType: 'booking',
        aggregateId: input.bookingId,
        aggregateVersion: booking.version + 1,
        occurredAt: input.occurredAt,
        correlationId: booking.client_request_id ?? input.bookingId,
        causationId: null,
        payload: {
          clientId: input.clientId,
          professionalId: booking.professional_id,
          cancelledBy: 'client',
          cancellationPolicy,
        },
      });
      return 'cancelled';
    });
  }
}
