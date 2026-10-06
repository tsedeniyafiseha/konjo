import type { DomainEventHandler, NotificationCommandStore } from './ports.ts';
import { asDomainEvent } from './process-domain-events.ts';
import type {
  BookingCancelledEvent,
  BookingParticipantEvent,
  BookingReassignedEvent,
  BookingRequestedEvent,
  BookingRescheduledEvent,
  BookingRescheduleReviewedEvent,
  DomainEventEnvelope,
} from '../domain/events.ts';
import { domainEventTypes } from '../domain/events.ts';

export class BookingNotificationProjector implements DomainEventHandler {
  readonly eventTypes = [
    domainEventTypes.bookingRequested,
    domainEventTypes.bookingAccepted,
    domainEventTypes.bookingDeclined,
    domainEventTypes.professionalTravelStarted,
    domainEventTypes.professionalArrived,
    domainEventTypes.visitStarted,
    domainEventTypes.bookingCompleted,
    domainEventTypes.bookingCancelled,
    domainEventTypes.bookingReassigned,
    domainEventTypes.bookingRescheduled,
    domainEventTypes.bookingRescheduleAccepted,
    domainEventTypes.bookingRescheduleDeclined,
  ] as const;
  private readonly notifications: NotificationCommandStore;

  constructor(notifications: NotificationCommandStore) {
    this.notifications = notifications;
  }

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    if (envelope.eventType === domainEventTypes.bookingRequested) {
      await this.projectRequested(asDomainEvent<BookingRequestedEvent>(envelope));
      return;
    }
    if (envelope.eventType === domainEventTypes.bookingReassigned) {
      await this.projectReassigned(asDomainEvent<BookingReassignedEvent>(envelope));
      return;
    }
    if (envelope.eventType === domainEventTypes.bookingCancelled) {
      await this.projectCancelled(asDomainEvent<BookingCancelledEvent>(envelope));
      return;
    }
    if (envelope.eventType === domainEventTypes.bookingRescheduled) {
      await this.projectRescheduled(asDomainEvent<BookingRescheduledEvent>(envelope));
      return;
    }
    if (envelope.eventType === domainEventTypes.bookingRescheduleAccepted || envelope.eventType === domainEventTypes.bookingRescheduleDeclined) {
      await this.projectRescheduleReviewed(asDomainEvent<BookingRescheduleReviewedEvent>(envelope));
      return;
    }
    await this.projectParticipantEvent(asDomainEvent<BookingParticipantEvent>(envelope));
  }

  private async projectRequested(event: BookingRequestedEvent): Promise<void> {
    const { clientId, professionalId, assignmentVersion } = event.payload;
    this.assertParticipants(event, clientId, professionalId);
    if (!Number.isInteger(assignmentVersion) || assignmentVersion < 1) {
      throw new Error(`BookingRequested event ${event.eventId} has an invalid assignment version.`);
    }

    await this.notifications.enqueueNotification(
      clientId,
      `booking:${event.aggregateId}:client:requested`,
      'push',
      'booking_requested',
      { bookingId: event.aggregateId, professionalId },
      event.occurredAt,
    );
    await this.notifications.enqueueNotification(
      professionalId,
      `booking:${event.aggregateId}:professional:requested:${assignmentVersion}`,
      'push',
      'new_booking_request',
      { bookingId: event.aggregateId },
      event.occurredAt,
    );
    // Professionals are not always in the app: an SMS reaches them regardless
    // of push credentials or whether the app is installed on that phone.
    await this.notifications.enqueueNotification(
      professionalId,
      `booking:${event.aggregateId}:professional:requested:${assignmentVersion}:sms`,
      'sms',
      'new_booking_request',
      { bookingId: event.aggregateId },
      event.occurredAt,
    );
  }

  private async projectParticipantEvent(event: BookingParticipantEvent): Promise<void> {
    const { clientId, professionalId } = event.payload;
    this.assertParticipants(event, clientId, professionalId);
    const presentation = {
      BookingAccepted: { status: 'accepted', template: 'booking_accepted' },
      BookingDeclined: { status: 'cancelled', template: 'booking_cancelled' },
      ProfessionalTravelStarted: { status: 'on_the_way', template: 'booking_on_the_way' },
      ProfessionalArrived: { status: 'arrived', template: 'booking_arrived' },
      VisitStarted: { status: 'in_progress', template: 'booking_in_progress' },
      BookingCompleted: { status: 'completed', template: 'booking_completed' },
    } as const;
    const selected = presentation[event.eventType];
    // An acceptance carries the travel fee the professional named and the new
    // total, so the client's notification can say what they will pay.
    const amounts = event.eventType === 'BookingAccepted'
      && typeof event.payload.total === 'number' && typeof event.payload.travelFee === 'number'
      ? { total: event.payload.total, travelFee: event.payload.travelFee }
      : {};
    await this.notifications.enqueueNotification(
      clientId,
      `booking:${event.aggregateId}:client:${selected.status}`,
      'push',
      selected.template,
      { bookingId: event.aggregateId, professionalId, ...amounts },
      event.occurredAt,
    );
  }

  private async projectCancelled(event: BookingCancelledEvent): Promise<void> {
    const { clientId, professionalId, cancelledBy, cancellationPolicy } = event.payload;
    this.assertParticipants(event, clientId, professionalId);
    if (cancelledBy === 'client' && cancellationPolicy !== 'client_no_show') {
      await this.notifications.enqueueNotification(
        professionalId,
        `booking:${event.aggregateId}:professional:cancelled`,
        'push',
        'booking_cancelled',
        { bookingId: event.aggregateId, cancellationPolicy },
        event.occurredAt,
      );
      return;
    }
    const noShow = cancellationPolicy === 'client_no_show';
    await this.notifications.enqueueNotification(
      clientId,
      `booking:${event.aggregateId}:client:${noShow ? 'no-show' : 'cancelled'}`,
      'push',
      noShow ? 'booking_client_no_show' : 'booking_cancelled',
      { bookingId: event.aggregateId, professionalId },
      event.occurredAt,
    );
  }

  private async projectReassigned(event: BookingReassignedEvent): Promise<void> {
    const { clientId, previousProfessionalId, professionalId, assignmentVersion } = event.payload;
    this.assertParticipants(event, clientId, professionalId);
    if (!previousProfessionalId || !Number.isInteger(assignmentVersion) || assignmentVersion < 2) {
      throw new Error(`BookingReassigned event ${event.eventId} has an invalid payload.`);
    }
    await this.notifications.enqueueNotification(
      clientId,
      `booking:${event.aggregateId}:client:reassigned:${assignmentVersion}`,
      'push',
      'booking_reassigned',
      { bookingId: event.aggregateId, professionalId },
      event.occurredAt,
    );
    await this.notifications.enqueueNotification(
      previousProfessionalId,
      `booking:${event.aggregateId}:professional:reassigned-away:${assignmentVersion}`,
      'push',
      'booking_reassigned_away',
      { bookingId: event.aggregateId },
      event.occurredAt,
    );
    await this.notifications.enqueueNotification(
      professionalId,
      `booking:${event.aggregateId}:professional:requested:${assignmentVersion}`,
      'push',
      'new_booking_request',
      { bookingId: event.aggregateId },
      event.occurredAt,
    );
    // Professionals are not always in the app: an SMS reaches them regardless
    // of push credentials or whether the app is installed on that phone.
    await this.notifications.enqueueNotification(
      professionalId,
      `booking:${event.aggregateId}:professional:requested:${assignmentVersion}:sms`,
      'sms',
      'new_booking_request',
      { bookingId: event.aggregateId },
      event.occurredAt,
    );
  }

  private async projectRescheduled(event: BookingRescheduledEvent): Promise<void> {
    const { clientId, professionalId, dateIso, time } = event.payload;
    this.assertParticipants(event, clientId, professionalId);
    if (!dateIso || !time) throw new Error(`BookingRescheduled event ${event.eventId} has an invalid schedule.`);
    // An accepted booking needs the professional's answer, so the request is
    // also sent by SMS like a new booking; a requested one is simply moved.
    const template = event.payload.requiresApproval ? 'booking_reschedule_requested' : 'booking_rescheduled';
    await this.notifications.enqueueNotification(
      professionalId,
      `booking:${event.aggregateId}:professional:rescheduled:${event.aggregateVersion}`,
      'push',
      template,
      { bookingId: event.aggregateId, clientId, dateIso, time },
      event.occurredAt,
    );
    if (event.payload.requiresApproval) {
      await this.notifications.enqueueNotification(
        professionalId,
        `booking:${event.aggregateId}:professional:rescheduled:${event.aggregateVersion}:sms`,
        'sms',
        template,
        { bookingId: event.aggregateId, clientId, dateIso, time },
        event.occurredAt,
      );
    }
  }

  private async projectRescheduleReviewed(event: BookingRescheduleReviewedEvent): Promise<void> {
    const { clientId, professionalId, dateIso, time } = event.payload;
    this.assertParticipants(event, clientId, professionalId);
    const accepted = event.eventType === 'BookingRescheduleAccepted';
    await this.notifications.enqueueNotification(
      clientId,
      `booking:${event.aggregateId}:client:${accepted ? 'reschedule-accepted' : 'reschedule-declined'}:${event.aggregateVersion}`,
      'push',
      accepted ? 'booking_reschedule_accepted' : 'booking_reschedule_declined',
      { bookingId: event.aggregateId, professionalId, dateIso, time },
      event.occurredAt,
    );
  }

  private assertParticipants(event: DomainEventEnvelope, clientId: string, professionalId: string): void {
    if (!clientId || !professionalId) {
      throw new Error(`${event.eventType} event ${event.eventId} has invalid participants.`);
    }
  }
}
