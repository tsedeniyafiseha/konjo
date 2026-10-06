import type { DomainEventHandler, NotificationCommandStore } from './ports.ts';
import { asDomainEvent } from './process-domain-events.ts';
import type { DomainEventEnvelope, PayoutStateEvent } from '../domain/events.ts';
import { domainEventTypes } from '../domain/events.ts';

export class PayoutNotificationProjector implements DomainEventHandler {
  readonly eventTypes = [domainEventTypes.payoutQueued, domainEventTypes.payoutPaid] as const;
  private readonly notifications: NotificationCommandStore;

  constructor(notifications: NotificationCommandStore) {
    this.notifications = notifications;
  }

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    const event = asDomainEvent<PayoutStateEvent>(envelope);
    const { payoutId, professionalId, amount, bookingCount } = event.payload;
    if (payoutId !== event.aggregateId || !professionalId || amount < 0 || bookingCount < 1) {
      throw new Error(`${event.eventType} event ${event.eventId} has an invalid payload.`);
    }
    const status = event.eventType === domainEventTypes.payoutQueued ? 'queued' : 'paid';
    await this.notifications.enqueueNotification(
      professionalId,
      `payout:${payoutId}:${status}`,
      'push',
      `payout_${status}`,
      { payoutId, amount, bookingCount },
      event.occurredAt,
    );
  }
}
