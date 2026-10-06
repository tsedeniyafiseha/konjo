import type { DomainEventHandler, NotificationCommandStore } from './ports.ts';
import { asDomainEvent } from './process-domain-events.ts';
import type {
  DomainEventEnvelope,
  ProfessionalApprovedEvent,
  ProfessionalRejectedEvent,
} from '../domain/events.ts';
import { domainEventTypes } from '../domain/events.ts';

function smsLanguage(value: unknown): 'en' | 'am' | 'om' {
  return value === 'am' || value === 'om' ? value : 'en';
}

/**
 * Acknowledges new applications. The administrator sees them in the review
 * queue directly; no SMS is sent so the provider quota is kept for decisions.
 */
export class ProfessionalApplicationSubmittedHandler implements DomainEventHandler {
  readonly eventTypes = [domainEventTypes.professionalApplicationSubmitted] as const;

  async handle(): Promise<void> {}
}

/** Sends the professional an SMS when their application is approved or rejected. */
export class ProfessionalApprovalNotificationProjector implements DomainEventHandler {
  readonly eventTypes = [
    domainEventTypes.professionalApproved,
    domainEventTypes.professionalRejected,
  ] as const;
  private readonly notifications: NotificationCommandStore;

  constructor(notifications: NotificationCommandStore) {
    this.notifications = notifications;
  }

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    const event = asDomainEvent<ProfessionalApprovedEvent | ProfessionalRejectedEvent>(envelope);
    const { professionalId, applicationId } = event.payload;
    if (!professionalId || professionalId !== event.aggregateId || !applicationId) {
      throw new Error(`${event.eventType} event ${event.eventId} has an invalid payload.`);
    }
    const approved = event.eventType === domainEventTypes.professionalApproved;
    const reason = !approved && 'reason' in event.payload && typeof event.payload.reason === 'string'
      ? event.payload.reason.trim().slice(0, 300)
      : '';

    await this.notifications.enqueueNotification(
      professionalId,
      `professional:${professionalId}:application:${applicationId}:${approved ? 'approved' : 'rejected'}`,
      'sms',
      approved ? 'professional_application_approved' : 'professional_application_rejected',
      {
        applicationId,
        language: smsLanguage(event.payload.language),
        ...(reason ? { reason } : {}),
      },
      event.occurredAt,
    );
  }
}
