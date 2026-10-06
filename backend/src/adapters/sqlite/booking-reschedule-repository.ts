import type { DatabaseSync } from 'node:sqlite';

import type {
  RescheduleBookingResult,
  RescheduleBookingStoreInput,
} from '../../application/contracts.ts';
import type {
  BookingRescheduleStore,
  ProfessionalAvailabilityReader,
} from '../../application/ports.ts';
import { domainEventTypes } from '../../domain/events.ts';
import { type BookingRow, toApiBooking } from './booking-records.ts';
import type { SqliteDomainEventOutbox } from './domain-event-outbox.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqliteBookingRescheduleRepository implements BookingRescheduleStore {
  private readonly database: DatabaseSync;
  private readonly availability: ProfessionalAvailabilityReader;
  private readonly domainEvents: SqliteDomainEventOutbox;
  private readonly unitOfWork: SqliteUnitOfWork;

  constructor(
    database: DatabaseSync,
    availability: ProfessionalAvailabilityReader,
    domainEvents: SqliteDomainEventOutbox,
    unitOfWork = new SqliteUnitOfWork(database),
  ) {
    this.database = database;
    this.availability = availability;
    this.domainEvents = domainEvents;
    this.unitOfWork = unitOfWork;
  }

  rescheduleBooking(input: RescheduleBookingStoreInput): RescheduleBookingResult {
    return this.unitOfWork.run(() => {
      const booking = this.database.prepare(
        'SELECT * FROM bookings WHERE id = ? AND client_id = ?',
      ).get(input.bookingId, input.clientId) as unknown as BookingRow | undefined;
      if (!booking) {
        return { result: 'not_found' };
      }
      if (booking.status !== 'requested' && booking.status !== 'accepted') {
        return { result: 'not_allowed' };
      }
      const availability = this.availability.getProfessionalAvailability(
        booking.professional_id,
        input.dateIso,
        booking.service_id,
        booking.id,
      );
      if (!availability?.slots.includes(input.time)) {
        return { result: 'slot_unavailable' };
      }

      // An accepted booking only gets a proposal the professional must answer;
      // a requested one simply moves (mirrors Postgres).
      const requiresApproval = booking.status === 'accepted';
      const updated = requiresApproval
        ? this.database.prepare(`
          UPDATE bookings SET proposed_date_iso = ?, proposed_time = ?, version = version + 1
          WHERE id = ? AND client_id = ? AND version = ?
        `).run(input.dateIso, input.time, input.bookingId, input.clientId, booking.version)
        : this.database.prepare(`
          UPDATE bookings SET date_iso = ?, time = ?, proposed_date_iso = NULL, proposed_time = NULL, version = version + 1
          WHERE id = ? AND client_id = ? AND version = ?
        `).run(input.dateIso, input.time, input.bookingId, input.clientId, booking.version);
      if (updated.changes === 0) {
        return this.unitOfWork.abort({ result: 'not_allowed' as const });
      }
      this.domainEvents.enqueue({
        eventType: domainEventTypes.bookingRescheduled,
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
          dateIso: input.dateIso,
          time: input.time,
          requiresApproval,
        },
      });
      const row = this.database.prepare('SELECT * FROM bookings WHERE id = ?')
        .get(input.bookingId) as unknown as BookingRow;
      return { result: 'updated', booking: toApiBooking(row) };
    });
  }
}
