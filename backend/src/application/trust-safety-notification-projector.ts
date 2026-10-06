import type { DomainEventHandler, NotificationCommandStore } from './ports.ts';
import { asDomainEvent } from './process-domain-events.ts';
import type {
  DomainEventEnvelope,
  ProfessionalRatingThresholdCrossedEvent,
  ReviewSubmittedEvent,
  SafetyIncidentOpenedEvent,
} from '../domain/events.ts';
import { domainEventTypes } from '../domain/events.ts';

export class TrustSafetyNotificationProjector implements DomainEventHandler {
  readonly eventTypes = [
    domainEventTypes.reviewSubmitted,
    domainEventTypes.professionalRatingThresholdCrossed,
    domainEventTypes.safetyIncidentOpened,
  ] as const;
  private readonly notifications: NotificationCommandStore;

  constructor(notifications: NotificationCommandStore) {
    this.notifications = notifications;
  }

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    if (envelope.eventType === domainEventTypes.reviewSubmitted) {
      const event = asDomainEvent<ReviewSubmittedEvent>(envelope);
      const { professionalId, bookingId, reviewId, averageRating } = event.payload;
      if (!professionalId || !bookingId || reviewId !== event.aggregateId) {
        throw new Error(`ReviewSubmitted event ${event.eventId} has an invalid payload.`);
      }
      await this.notifications.enqueueNotification(
        professionalId,
        `review:${reviewId}:professional:submitted`,
        'push',
        'review_submitted',
        { bookingId, reviewId, averageRating },
        event.occurredAt,
      );
      return;
    }

    if (envelope.eventType === domainEventTypes.professionalRatingThresholdCrossed) {
      const event = asDomainEvent<ProfessionalRatingThresholdCrossedEvent>(envelope);
      const { professionalId, bookingId, qualityFlagId, averageRating } = event.payload;
      if (!professionalId || !bookingId || qualityFlagId !== event.aggregateId) {
        throw new Error(`ProfessionalRatingThresholdCrossed event ${event.eventId} has an invalid payload.`);
      }
      await this.notifications.enqueueNotification(
        professionalId,
        `professional:${professionalId}:quality-threshold:${qualityFlagId}`,
        'push',
        'professional_quality_review_required',
        { bookingId, qualityFlagId, averageRating },
        event.occurredAt,
      );
      return;
    }

    const event = asDomainEvent<SafetyIncidentOpenedEvent>(envelope);
    const { bookingId, incidentId, counterpartId, reportedByRole, coordinatesAvailable } = event.payload;
    if (!bookingId || incidentId !== event.aggregateId || !counterpartId) {
      throw new Error(`SafetyIncidentOpened event ${event.eventId} has an invalid payload.`);
    }
    await this.notifications.enqueueNotification(
      counterpartId,
      `safety:${incidentId}:counterpart`,
      'push',
      'safety_incident_opened',
      { bookingId, incidentId, reportedByRole, coordinatesAvailable },
      event.occurredAt,
    );
  }
}
