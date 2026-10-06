import type { DomainEventHandler, NotificationCommandStore } from './ports.ts';
import { asDomainEvent } from './process-domain-events.ts';
import type { DomainEventEnvelope, PaymentStateEvent } from '../domain/events.ts';
import { domainEventTypes } from '../domain/events.ts';

export class PaymentNotificationProjector implements DomainEventHandler {
  readonly eventTypes = [
    domainEventTypes.paymentAuthorizationRequested,
    domainEventTypes.paymentAuthorized,
    domainEventTypes.paymentCaptured,
    domainEventTypes.paymentFailed,
    domainEventTypes.paymentRefunded,
  ] as const;
  private readonly notifications: NotificationCommandStore;

  constructor(notifications: NotificationCommandStore) {
    this.notifications = notifications;
  }

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    const event = asDomainEvent<PaymentStateEvent>(envelope);
    const { clientId, bookingId, paymentIntentId, reason, refundedAmount } = event.payload;
    if (!clientId || !bookingId || paymentIntentId !== event.aggregateId) {
      throw new Error(`${event.eventType} event ${event.eventId} has an invalid payload.`);
    }
    const status = event.eventType === domainEventTypes.paymentAuthorizationRequested
      ? event.payload.status ?? 'pending'
      : {
          PaymentAuthorized: 'authorized',
          PaymentCaptured: 'captured',
          PaymentFailed: 'failed',
          PaymentRefunded: 'refunded',
        }[event.eventType];
    const keySuffix = reason === 'admin_refund' ? 'admin-refunded' : status;
    await this.notifications.enqueueNotification(
      clientId,
      `payment:${paymentIntentId}:${keySuffix}`,
      'push',
      `payment_${status}`,
      {
        bookingId,
        paymentIntentId,
        reason,
        stage: event.payload.stage ?? 'full',
        ...(typeof refundedAmount === 'number' ? { refundedAmount } : {}),
      },
      event.occurredAt,
    );
    if (event.eventType === domainEventTypes.paymentCaptured && event.payload.professionalId) {
      await this.notifications.enqueueNotification(
        event.payload.professionalId, `payment:${paymentIntentId}:professional:captured`,
        'push', event.payload.stage === 'deposit' ? 'booking_deposit_paid' : 'booking_paid',
        { bookingId, paymentIntentId, stage: event.payload.stage }, event.occurredAt,
      );
    }
  }
}
