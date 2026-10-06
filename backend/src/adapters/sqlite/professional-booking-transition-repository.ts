import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { ApiBookingStatus, ApiPaymentStatus } from '../../../../shared/api-contracts.ts';
import type {
  ProfessionalBookingAction,
  TransitionProfessionalBookingResult,
  TransitionProfessionalBookingStoreInput,
} from '../../application/contracts.ts';
import type { ProfessionalBookingTransitionStore } from '../../application/ports.ts';
import { domainEventTypes } from '../../domain/events.ts';
import type { BookingRow } from './booking-records.ts';
import type { SqliteBookingPaymentSettlement } from './booking-payment-settlement.ts';
import type { SqliteDomainEventOutbox } from './domain-event-outbox.ts';
import { isValidTravelFee, readTravelFeeCap } from './platform-settings.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';
import { awardRewardCoupon } from './client-rewards.ts';

type StandardProfessionalBookingAction = Exclude<ProfessionalBookingAction, 'no-show' | 'arrive' | 'approve-reschedule' | 'decline-reschedule'>;

const transitions: Record<StandardProfessionalBookingAction, { from: ApiBookingStatus; to: ApiBookingStatus }> = {
  accept: { from: 'requested', to: 'accepted' },
  decline: { from: 'requested', to: 'cancelled' },
  travel: { from: 'accepted', to: 'on_the_way' },
  'check-in': { from: 'on_the_way', to: 'in_progress' },
  complete: { from: 'in_progress', to: 'completed' },
};

export class SqliteProfessionalBookingTransitionRepository implements ProfessionalBookingTransitionStore {
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

  transitionBooking(input: TransitionProfessionalBookingStoreInput): TransitionProfessionalBookingResult {
    return this.unitOfWork.run(() => {
      const booking = this.database.prepare(
        'SELECT * FROM bookings WHERE id = ? AND professional_id = ?',
      ).get(input.bookingId, input.professionalId) as unknown as BookingRow | undefined;
      if (!booking) return 'not_found';

      if (input.action === 'no-show') return this.recordNoShow(input, booking);
      if (input.action === 'approve-reschedule' || input.action === 'decline-reschedule') {
        return this.reviewReschedule(input, booking);
      }

      if (input.action === 'arrive') {
        if (booking.arrived_at) return 'updated';
        if (booking.status !== 'on_the_way') return 'invalid_transition';
        this.database.prepare('UPDATE bookings SET arrived_at = ?, version = version + 1 WHERE id = ?')
          .run(input.occurredAt, booking.id);
        this.domainEvents.enqueue({
          eventType: domainEventTypes.professionalArrived, schemaVersion: 1, aggregateType: 'booking',
          aggregateId: booking.id, aggregateVersion: booking.version + 1, occurredAt: input.occurredAt,
          correlationId: booking.client_request_id ?? booking.id, causationId: null,
          payload: { clientId: booking.client_id, professionalId: input.professionalId },
        });
        return 'updated';
      }

      const transition = transitions[input.action];
      if (booking.status === transition.to) return 'updated';
      if (booking.status !== transition.from) return 'invalid_transition';
      if (input.action === 'check-in' && booking.payment_plan === 'split' && !booking.arrived_at) return 'invalid_transition';
      if (input.action === 'travel' && !this.paymentIsSecured(input.bookingId)) {
        return 'payment_required';
      }
      if (input.action === 'travel' && this.database.prepare("SELECT 1 FROM bookings WHERE professional_id = ? AND id <> ? AND status IN ('on_the_way', 'in_progress')")
        .get(input.professionalId, booking.id)) return 'invalid_transition';
      // The travel fee is checked against the cap that is current right now, so an
      // administrator change applies to the very next acceptance.
      const acceptedTravelFee = input.action === 'accept' && input.travelFee !== undefined
        ? input.travelFee
        : null;
      if (acceptedTravelFee !== null && !isValidTravelFee(acceptedTravelFee, readTravelFeeCap(this.database))) {
        return 'invalid_travel_fee';
      }

      let updated;
      if (input.action === 'decline') {
        if (this.database.prepare('SELECT 1 FROM payment_intents WHERE booking_id = ?').get(input.bookingId)) {
          throw new Error('An unpaid booking request cannot contain a payment intent.');
        }
        updated = this.database.prepare(`
          UPDATE bookings
          SET status = 'cancelled', cancelled_by = 'professional', cancellation_policy = NULL,
              version = version + 1
          WHERE id = ? AND version = ?
        `).run(input.bookingId, booking.version);
      } else if (input.action === 'check-in') {
        updated = this.database.prepare(`
          UPDATE bookings SET status = 'in_progress', started_at = ?, version = version + 1
          WHERE id = ? AND version = ?
        `).run(input.occurredAt, input.bookingId, booking.version);
      } else if (input.action === 'complete') {
        if (input.extraAmount !== undefined && !this.applyExtras(booking, input)) return 'invalid_transition';
        updated = this.database.prepare(`
          UPDATE bookings SET status = 'completed', completed_at = ?, version = version + 1
          WHERE id = ? AND version = ?
        `).run(input.occurredAt, input.bookingId, booking.version);
      } else {
        updated = this.database.prepare(`
          UPDATE bookings SET status = ?, version = version + 1 WHERE id = ? AND version = ?
        `).run(transition.to, input.bookingId, booking.version);
      }
      if (updated.changes === 0) return this.unitOfWork.abort('invalid_transition' as const);
      // Every Nth completed booking earns the client a reward coupon (mirrors Postgres).
      if (input.action === 'complete') awardRewardCoupon(this.database, booking.id, input.occurredAt);
      if (input.action === 'accept' || input.action === 'travel') {
        const column = input.action === 'accept' ? 'accepted_at' : 'travel_started_at';
        this.database.prepare(`UPDATE bookings SET ${column} = ? WHERE id = ?`).run(input.occurredAt, booking.id);
      }
      // When accepting, store the professional's travel fee and recalculate the total the client pays.
      if (acceptedTravelFee !== null) {
        const newTotal = booking.service_price + (booking.service_fee ?? Math.round(booking.service_price * 0.18)) + acceptedTravelFee;
        this.database.prepare(`
          UPDATE bookings SET travel_fee = ?, total = ? WHERE id = ?
        `).run(acceptedTravelFee, newTotal, booking.id);
        booking.travel_fee = acceptedTravelFee;
        booking.total = newTotal;
      }

      if (input.action === 'complete' && booking.payment_plan !== 'split') {
        if (!this.payments.releaseBookingPayment(booking, input.occurredAt)) {
          return this.unitOfWork.abort('payment_required' as const);
        }
        const commissionAmount = this.payments.commissionForBooking(booking);
        this.database.prepare(`
          INSERT OR IGNORE INTO professional_earnings (
            id, professional_id, booking_id, gross_amount, commission_amount, net_amount, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          input.professionalId,
          input.bookingId,
          booking.total,
          commissionAmount,
          booking.total - commissionAmount,
          input.occurredAt,
        );
      }

      const eventType = {
        accept: domainEventTypes.bookingAccepted,
        decline: domainEventTypes.bookingDeclined,
        travel: domainEventTypes.professionalTravelStarted,
        'check-in': domainEventTypes.visitStarted,
        complete: domainEventTypes.bookingCompleted,
      }[input.action];
      this.domainEvents.enqueue({
        eventType,
        schemaVersion: 1,
        aggregateType: 'booking',
        aggregateId: input.bookingId,
        aggregateVersion: booking.version + 1,
        occurredAt: input.occurredAt,
        correlationId: booking.client_request_id ?? input.bookingId,
        causationId: null,
        payload: {
          clientId: booking.client_id,
          professionalId: input.professionalId,
          ...(input.action === 'accept' ? { travelFee: booking.travel_fee, total: booking.total } : {}),
        },
      });
      return 'updated';
    });
  }

  // At checkout the professional names what the client owes for services beyond
  // the booking (mirrors set_booking_extras_as_professional in Postgres): the
  // extra and its service fee join the total, and any pending balance checkout
  // for the old amount is voided so the next attempt is for the new one.
  private applyExtras(booking: BookingRow, input: TransitionProfessionalBookingStoreInput): boolean {
    if (booking.payment_plan !== 'split') return false;
    const extraAmount = input.extraAmount ?? 0;
    const extraFee = Math.round(extraAmount * booking.commission_rate_bps / 10_000);
    const total = booking.service_price + (booking.service_fee ?? 0) + booking.travel_fee + extraAmount + extraFee;
    this.database.prepare('UPDATE bookings SET extra_amount = ?, extra_fee = ?, extra_note = ?, total = ? WHERE id = ?')
      .run(extraAmount, extraFee, input.extraNote ?? null, total, booking.id);
    this.database.prepare("UPDATE payment_intents SET status = 'failed', version = version + 1, updated_at = ? WHERE booking_id = ? AND stage = 'balance' AND status = 'pending'")
      .run(input.occurredAt, booking.id);
    booking.extra_amount = extraAmount;
    booking.extra_fee = extraFee;
    booking.total = total;
    return true;
  }

  // The client asked for a new time on an accepted booking: approve moves the
  // booking, decline keeps its time. The client is told either way.
  private reviewReschedule(
    input: TransitionProfessionalBookingStoreInput,
    booking: BookingRow,
  ): TransitionProfessionalBookingResult {
    if (booking.status !== 'accepted' || !booking.proposed_date_iso || !booking.proposed_time) return 'invalid_transition';
    const approve = input.action === 'approve-reschedule';
    if (approve) {
      this.database.prepare('UPDATE bookings SET date_iso = ?, time = ?, proposed_date_iso = NULL, proposed_time = NULL, version = version + 1 WHERE id = ?')
        .run(booking.proposed_date_iso, booking.proposed_time, booking.id);
    } else {
      this.database.prepare('UPDATE bookings SET proposed_date_iso = NULL, proposed_time = NULL, version = version + 1 WHERE id = ?')
        .run(booking.id);
    }
    this.domainEvents.enqueue({
      eventType: approve ? domainEventTypes.bookingRescheduleAccepted : domainEventTypes.bookingRescheduleDeclined,
      schemaVersion: 1, aggregateType: 'booking', aggregateId: booking.id, aggregateVersion: booking.version + 1,
      occurredAt: input.occurredAt, correlationId: booking.client_request_id ?? booking.id, causationId: null,
      payload: { clientId: booking.client_id, professionalId: input.professionalId, dateIso: booking.proposed_date_iso, time: booking.proposed_time },
    });
    return 'updated';
  }

  private recordNoShow(
    input: TransitionProfessionalBookingStoreInput,
    booking: BookingRow,
  ): TransitionProfessionalBookingResult {
    if (booking.status === 'cancelled' && booking.cancellation_policy === 'client_no_show') {
      return 'updated';
    }
    if (booking.status !== 'on_the_way') return 'invalid_transition';
    if (!this.paymentIsSecured(input.bookingId)) return 'payment_required';
    const updated = this.database.prepare(`
      UPDATE bookings
      SET status = 'cancelled', cancelled_by = 'client', cancellation_policy = 'client_no_show',
          version = version + 1
      WHERE id = ? AND version = ?
    `).run(input.bookingId, booking.version);
    if (updated.changes === 0) return this.unitOfWork.abort('invalid_transition' as const);
    this.payments.settleCancelledBookingPayment(booking, 'client_no_show', input.occurredAt);
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
        clientId: booking.client_id,
        professionalId: input.professionalId,
        cancelledBy: 'client',
        cancellationPolicy: 'client_no_show',
      },
    });
    return 'updated';
  }

  private paymentIsSecured(bookingId: string): boolean {
    const payment = this.database.prepare("SELECT status FROM payment_intents WHERE booking_id = ? AND stage IN ('deposit', 'full') AND status <> 'failed'")
      .get(bookingId) as unknown as { status: ApiPaymentStatus } | undefined;
    return payment?.status === 'captured' || payment?.status === 'cash_due';
  }

}
