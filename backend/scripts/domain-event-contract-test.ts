import assert from 'node:assert/strict';

import { BookingNotificationProjector } from '../src/application/booking-notification-projector.ts';
import { PaymentNotificationProjector } from '../src/application/payment-notification-projector.ts';
import { TrustSafetyNotificationProjector } from '../src/application/trust-safety-notification-projector.ts';
import { PayoutNotificationProjector } from '../src/application/payout-notification-projector.ts';
import { ProfessionalApprovalNotificationProjector } from '../src/application/professional-approval-notification-projector.ts';
import type {
  Clock,
  DomainEventHandler,
  DomainEventStore,
  IdGenerator,
  NotificationCommandStore,
} from '../src/application/ports.ts';
import { DomainEventProcessor } from '../src/application/process-domain-events.ts';
import type { BookingRequestedEvent, DomainEventEnvelope } from '../src/domain/events.ts';
import { domainEventTypes } from '../src/domain/events.ts';

const now = new Date('2026-09-17T18:00:00.000Z');
const event = (id: string, attempt: number): DomainEventEnvelope => ({
  eventId: id,
  eventType: domainEventTypes.bookingRequested,
  schemaVersion: 1,
  aggregateType: 'booking',
  aggregateId: id,
  aggregateVersion: 1,
  occurredAt: now.toISOString(),
  correlationId: `request-${id}`,
  causationId: null,
  payload: { clientId: 'client-1', professionalId: 'professional-1', assignmentVersion: 1 },
  attempt,
});
const events = [event('success', 1), event('retry', 1), event('dead-letter', 3)];
const processed: string[] = [];
const failures: Parameters<DomainEventStore['recordDomainEventFailure']>[0][] = [];
const store: DomainEventStore = {
  claimDomainEvents(input) {
    assert.deepEqual(input, {
      workerId: 'worker-1',
      now: now.toISOString(),
      lockedUntil: new Date(now.getTime() + 30_000).toISOString(),
      limit: 10,
    });
    return events;
  },
  markDomainEventProcessed(eventId, workerId, processedAt) {
    assert.equal(workerId, 'worker-1');
    assert.equal(processedAt, now.toISOString());
    processed.push(eventId);
    return true;
  },
  recordDomainEventFailure(input) {
    failures.push(input);
    return true;
  },
};
const handler: DomainEventHandler = {
  eventTypes: [domainEventTypes.bookingRequested],
  handle(domainEvent) {
    if (domainEvent.eventId !== 'success') throw new Error(`failed:${domainEvent.eventId}`);
  },
};
const ids: IdGenerator = { next: () => 'worker-1' };
const clock: Clock = { now: () => now };
const processor = new DomainEventProcessor(store, [handler], ids, clock, {
  batchSize: 10,
  leaseMs: 30_000,
  maxAttempts: 3,
  baseRetryMs: 1_000,
  maxRetryMs: 60_000,
});

assert.deepEqual(await processor.run(), {
  claimed: 3,
  processed: 1,
  retried: 1,
  deadLettered: 1,
});
assert.deepEqual(processed, ['success']);
assert.deepEqual(failures, [
  {
    eventId: 'retry',
    workerId: 'worker-1',
    failedAt: now.toISOString(),
    availableAt: new Date(now.getTime() + 1_000).toISOString(),
    errorMessage: 'failed:retry',
    terminal: false,
  },
  {
    eventId: 'dead-letter',
    workerId: 'worker-1',
    failedAt: now.toISOString(),
    availableAt: new Date(now.getTime() + 4_000).toISOString(),
    errorMessage: 'failed:dead-letter',
    terminal: true,
  },
]);

const notifications: Array<{ userId: string; key: string; template: string }> = [];
const notificationStore: NotificationCommandStore = {
  enqueueNotification(userId, key, _channel, template) {
    notifications.push({ userId, key, template });
    return true;
  },
};
const bookingEvent: BookingRequestedEvent = {
  ...event('booking-1', 1),
  eventType: domainEventTypes.bookingRequested,
  aggregateId: 'booking-1',
  payload: { clientId: 'client-1', professionalId: 'professional-1', assignmentVersion: 1 },
};
const projector = new BookingNotificationProjector(notificationStore);
await projector.handle(bookingEvent);
assert.deepEqual(notifications, [
  { userId: 'client-1', key: 'booking:booking-1:client:requested', template: 'booking_requested' },
  { userId: 'professional-1', key: 'booking:booking-1:professional:requested:1', template: 'new_booking_request' },
  { userId: 'professional-1', key: 'booking:booking-1:professional:requested:1:sms', template: 'new_booking_request' },
]);

notifications.length = 0;
await projector.handle({
  ...bookingEvent,
  eventId: 'accepted-1',
  eventType: domainEventTypes.bookingAccepted,
  aggregateVersion: 2,
  payload: { clientId: 'client-1', professionalId: 'professional-1' },
});
await projector.handle({
  ...bookingEvent,
  eventId: 'cancelled-1',
  eventType: domainEventTypes.bookingCancelled,
  aggregateVersion: 3,
  payload: {
    clientId: 'client-1',
    professionalId: 'professional-1',
    cancelledBy: 'client',
    cancellationPolicy: 'full_refund',
  },
});
await projector.handle({
  ...bookingEvent,
  eventId: 'reassigned-1',
  eventType: domainEventTypes.bookingReassigned,
  aggregateVersion: 4,
  payload: {
    clientId: 'client-1',
    previousProfessionalId: 'professional-1',
    professionalId: 'professional-2',
    assignmentVersion: 2,
  },
});
await projector.handle({
  ...bookingEvent,
  eventId: 'rescheduled-1',
  eventType: domainEventTypes.bookingRescheduled,
  aggregateVersion: 5,
  payload: {
    clientId: 'client-1',
    professionalId: 'professional-2',
    dateIso: '2026-09-20',
    time: '2:30 PM',
  },
});
assert.deepEqual(notifications, [
  { userId: 'client-1', key: 'booking:booking-1:client:accepted', template: 'booking_accepted' },
  { userId: 'professional-1', key: 'booking:booking-1:professional:cancelled', template: 'booking_cancelled' },
  { userId: 'client-1', key: 'booking:booking-1:client:reassigned:2', template: 'booking_reassigned' },
  { userId: 'professional-1', key: 'booking:booking-1:professional:reassigned-away:2', template: 'booking_reassigned_away' },
  { userId: 'professional-2', key: 'booking:booking-1:professional:requested:2', template: 'new_booking_request' },
  { userId: 'professional-2', key: 'booking:booking-1:professional:requested:2:sms', template: 'new_booking_request' },
  { userId: 'professional-2', key: 'booking:booking-1:professional:rescheduled:5', template: 'booking_rescheduled' },
]);

notifications.length = 0;
const paymentProjector = new PaymentNotificationProjector(notificationStore);
await paymentProjector.handle({
  ...event('payment-1', 1),
  eventId: 'payment-requested-1',
  eventType: domainEventTypes.paymentAuthorizationRequested,
  aggregateType: 'payment',
  aggregateId: 'payment-1',
  payload: {
    clientId: 'client-1',
    bookingId: 'booking-1',
    paymentIntentId: 'payment-1',
    provider: 'telebirr',
    status: 'pending',
    reason: 'client_initiated',
  },
});
await paymentProjector.handle({
  ...event('payment-1', 1),
  eventId: 'payment-captured-1',
  eventType: domainEventTypes.paymentCaptured,
  aggregateType: 'payment',
  aggregateId: 'payment-1',
  aggregateVersion: 2,
  payload: {
    clientId: 'client-1',
    bookingId: 'booking-1',
    paymentIntentId: 'payment-1',
    provider: 'telebirr',
    reason: 'provider_webhook',
  },
});
await paymentProjector.handle({
  ...event('payment-1', 1),
  eventId: 'payment-refunded-1',
  eventType: domainEventTypes.paymentRefunded,
  aggregateType: 'payment',
  aggregateId: 'payment-1',
  aggregateVersion: 3,
  payload: {
    clientId: 'client-1',
    bookingId: 'booking-1',
    paymentIntentId: 'payment-1',
    provider: 'telebirr',
    reason: 'admin_refund',
    refundedAmount: 1800,
  },
});
assert.deepEqual(notifications, [
  { userId: 'client-1', key: 'payment:payment-1:pending', template: 'payment_pending' },
  { userId: 'client-1', key: 'payment:payment-1:captured', template: 'payment_captured' },
  { userId: 'client-1', key: 'payment:payment-1:admin-refunded', template: 'payment_refunded' },
]);

notifications.length = 0;
const trustSafetyProjector = new TrustSafetyNotificationProjector(notificationStore);
await trustSafetyProjector.handle({
  ...event('review-1', 1),
  eventId: 'review-submitted-1',
  eventType: domainEventTypes.reviewSubmitted,
  aggregateType: 'review',
  aggregateId: 'review-1',
  payload: {
    clientId: 'client-1',
    professionalId: 'professional-1',
    bookingId: 'booking-1',
    reviewId: 'review-1',
    averageRating: 2.8,
  },
});
await trustSafetyProjector.handle({
  ...event('quality-flag-1', 1),
  eventId: 'quality-threshold-1',
  eventType: domainEventTypes.professionalRatingThresholdCrossed,
  aggregateType: 'professional_quality_flag',
  aggregateId: 'quality-flag-1',
  payload: {
    professionalId: 'professional-1',
    bookingId: 'booking-1',
    qualityFlagId: 'quality-flag-1',
    averageRating: 2.8,
  },
});
await trustSafetyProjector.handle({
  ...event('incident-1', 1),
  eventId: 'safety-opened-1',
  eventType: domainEventTypes.safetyIncidentOpened,
  aggregateType: 'safety_incident',
  aggregateId: 'incident-1',
  payload: {
    bookingId: 'booking-1',
    incidentId: 'incident-1',
    reportedById: 'client-1',
    reportedByRole: 'client',
    counterpartId: 'professional-1',
    coordinatesAvailable: true,
  },
});
assert.deepEqual(notifications, [
  { userId: 'professional-1', key: 'review:review-1:professional:submitted', template: 'review_submitted' },
  { userId: 'professional-1', key: 'professional:professional-1:quality-threshold:quality-flag-1', template: 'professional_quality_review_required' },
  { userId: 'professional-1', key: 'safety:incident-1:counterpart', template: 'safety_incident_opened' },
]);

notifications.length = 0;
const approvalProjector = new ProfessionalApprovalNotificationProjector(notificationStore);
await approvalProjector.handle({
  ...event('professional-1', 1),
  eventId: 'professional-approved-1',
  eventType: domainEventTypes.professionalApproved,
  aggregateType: 'professional',
  aggregateId: 'professional-1',
  aggregateVersion: 2,
  correlationId: 'KJ-PRO-1',
  payload: {
    professionalId: 'professional-1',
    applicationId: 'KJ-PRO-1',
  },
});
assert.deepEqual(notifications, [{
  userId: 'professional-1',
  key: 'professional:professional-1:application:KJ-PRO-1:approved',
  template: 'professional_application_approved',
}]);

notifications.length = 0;
const payoutProjector = new PayoutNotificationProjector(notificationStore);
for (const [eventType, aggregateVersion] of [
  [domainEventTypes.payoutQueued, 1],
  [domainEventTypes.payoutPaid, 2],
] as const) {
  await payoutProjector.handle({
    ...event('payout-1', 1),
    eventId: `${eventType}-1`,
    eventType,
    aggregateType: 'payout',
    aggregateId: 'payout-1',
    aggregateVersion,
    payload: {
      payoutId: 'payout-1',
      professionalId: 'professional-1',
      amount: 1476,
      bookingCount: 1,
    },
  });
}
assert.deepEqual(notifications, [
  { userId: 'professional-1', key: 'payout:payout-1:queued', template: 'payout_queued' },
  { userId: 'professional-1', key: 'payout:payout-1:paid', template: 'payout_paid' },
]);

console.log('Domain event processing and projection contracts passed.');
