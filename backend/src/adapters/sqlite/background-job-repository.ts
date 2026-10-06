import type { DatabaseSync } from 'node:sqlite';

import type { NotificationDeliveryJob } from '../../application/contracts.ts';
import type { BackgroundJobStore } from '../../application/ports.ts';
import { bookingStartTime } from '../../domain/booking-time.ts';
import { domainEventTypes } from '../../domain/events.ts';
import { SqliteAvailabilityRepository } from './availability-repository.ts';
import type { BookingRow } from './booking-records.ts';
import { SqliteDomainEventOutbox } from './domain-event-outbox.ts';
import { SqliteMarketplaceReadRepository } from './marketplace-read-repository.ts';
import { SqliteNotificationOutbox } from './notification-outbox.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqliteBackgroundJobRepository implements BackgroundJobStore {
  private readonly database: DatabaseSync;
  private readonly availability: SqliteAvailabilityRepository;
  private readonly marketplace: SqliteMarketplaceReadRepository;
  private readonly domainEvents: SqliteDomainEventOutbox;
  private readonly notifications: SqliteNotificationOutbox;
  private readonly unitOfWork: SqliteUnitOfWork;

  constructor(
    database: DatabaseSync,
    availability: SqliteAvailabilityRepository,
    marketplace: SqliteMarketplaceReadRepository,
    domainEvents: SqliteDomainEventOutbox,
    notifications: SqliteNotificationOutbox,
    unitOfWork = new SqliteUnitOfWork(database),
  ) {
    this.database = database;
    this.availability = availability;
    this.marketplace = marketplace;
    this.domainEvents = domainEvents;
    this.notifications = notifications;
    this.unitOfWork = unitOfWork;
  }

  reassignOverdueBookings(now: Date): ReadonlyArray<{
    bookingId: string;
    professionalId: string;
  }> {
    const nowIso = now.toISOString();
    const overdue = this.database.prepare(`
      SELECT * FROM bookings
      WHERE status = 'requested' AND accept_by <= ?
      ORDER BY accept_by
    `).all(nowIso) as unknown as BookingRow[];
    const reassigned: Array<{ bookingId: string; professionalId: string }> = [];

    for (const booking of overdue) {
      const currentProfessional = this.database.prepare(`
        SELECT category FROM professionals WHERE id = ?
      `).get(booking.professional_id) as unknown as { category: string } | undefined;
      if (!currentProfessional) continue;
      const attempted = new Set((this.database.prepare(`
        SELECT professional_id FROM booking_assignments WHERE booking_id = ?
      `).all(booking.id) as unknown as Array<{ professional_id: string }>).map(
        (row) => row.professional_id,
      ));
      const candidates = this.marketplace.listProfessionals({
        category: currentProfessional.category,
        zone: booking.address_zone,
        available: true,
      }, nowIso.slice(0, 10));
      let match: { professionalId: string; serviceId: string } | null = null;

      for (const candidate of candidates) {
        if (attempted.has(candidate.id)) continue;
        if (booking.female_only === 1 && !candidate.femaleOnlyEligible) continue;
        const service = candidate.services.find((item) => (
          item.name.toLowerCase() === booking.service_name.toLowerCase() &&
          item.price === booking.service_price
        ));
        if (!service) continue;
        const availability = this.availability.getProfessionalAvailability(
          candidate.id,
          booking.date_iso,
          service.id,
        );
        if (availability?.slots.includes(booking.time)) {
          match = { professionalId: candidate.id, serviceId: service.id };
          break;
        }
      }

      if (!match) {
        this.database.prepare(`
          UPDATE bookings SET accept_by = ? WHERE id = ?
        `).run(new Date(now.getTime() + 5 * 60 * 1000).toISOString(), booking.id);
        continue;
      }

      const assignmentVersion = booking.assignment_version + 1;
      const nextAcceptBy = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
      const assignment = this.unitOfWork.run(() => {
        const updated = this.database.prepare(`
          UPDATE bookings
          SET professional_id = ?, service_id = ?, assignment_version = ?,
            accept_by = ?, version = version + 1
          WHERE id = ? AND status = 'requested' AND version = ?
        `).run(
          match.professionalId,
          match.serviceId,
          assignmentVersion,
          nextAcceptBy,
          booking.id,
          booking.version,
        );
        if (updated.changes === 0) {
          return this.unitOfWork.abort(null);
        }
        this.database.prepare(`
          INSERT INTO booking_assignments (
            booking_id, professional_id, assignment_version, assigned_at
          ) VALUES (?, ?, ?, ?)
        `).run(booking.id, match.professionalId, assignmentVersion, nowIso);
        this.domainEvents.enqueue({
          eventType: domainEventTypes.bookingReassigned,
          schemaVersion: 1,
          aggregateType: 'booking',
          aggregateId: booking.id,
          aggregateVersion: booking.version + 1,
          occurredAt: nowIso,
          correlationId: booking.client_request_id ?? booking.id,
          causationId: null,
          payload: {
            clientId: booking.client_id,
            previousProfessionalId: booking.professional_id,
            professionalId: match.professionalId,
            assignmentVersion,
          },
        });
        return { bookingId: booking.id, professionalId: match.professionalId };
      });
      if (assignment) reassigned.push(assignment);
    }
    return reassigned;
  }

  enqueueDueBookingReminders(now: Date): number {
    const windowEnd = now.getTime() + 24 * 60 * 60 * 1000;
    const nowIso = now.toISOString();
    const rows = this.database.prepare(`
      SELECT * FROM bookings
      WHERE status = 'accepted' AND date_iso >= ?
      ORDER BY date_iso, time
    `).all(nowIso.slice(0, 10)) as unknown as BookingRow[];
    let created = 0;
    for (const booking of rows) {
      const scheduledAt = bookingStartTime(booking.date_iso, booking.time);
      if (
        !Number.isFinite(scheduledAt) ||
        scheduledAt < now.getTime() ||
        scheduledAt > windowEnd
      ) continue;
      if (this.notifications.enqueueNotification(
        booking.client_id,
        `booking:${booking.id}:client:reminder:24h`,
        'push',
        'booking_reminder',
        { bookingId: booking.id, dateIso: booking.date_iso, time: booking.time },
        nowIso,
      )) created += 1;
      if (this.notifications.enqueueNotification(
        booking.professional_id,
        `booking:${booking.id}:professional:reminder:24h`,
        'push',
        'booking_reminder',
        { bookingId: booking.id, dateIso: booking.date_iso, time: booking.time },
        nowIso,
      )) created += 1;
    }
    return created;
  }

  listDueNotificationJobs(now: string, limit = 25): ReadonlyArray<NotificationDeliveryJob> {
    return this.notifications.listDueNotificationJobs(now, limit);
  }

  recordNotificationDelivery(job: NotificationDeliveryJob, result: {
    pending?: boolean;
    delivered: boolean;
    providerReference?: string;
    errorMessage?: string;
  }, recordedAt: Date): void {
    this.notifications.recordNotificationDelivery(job, result, recordedAt.toISOString());
  }
}
