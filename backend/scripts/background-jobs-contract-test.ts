import assert from 'node:assert/strict';

import type { NotificationDeliveryJob } from '../src/application/contracts.ts';
import type { BackgroundJobStore, Clock, DomainEventRunner, NotificationGateway } from '../src/application/ports.ts';
import { BackgroundJobProcessor } from '../src/application/process-background-jobs.ts';

const now = new Date('2026-09-17T18:00:00.000Z');
const jobs: NotificationDeliveryJob[] = [
  {
    id: 'notification-success',
    channel: 'push',
    template: 'booking_requested',
    payload: { bookingId: 'booking-1' },
    destination: 'ExpoPushToken[success]',
    attempt: 1,
  },
  {
    id: 'notification-failure',
    channel: 'sms',
    template: 'booking_reminder',
    payload: { bookingId: 'booking-2' },
    destination: '+251911111111',
    attempt: 2,
  },
];
const recorded: Array<{
  job: NotificationDeliveryJob;
  delivered: boolean;
  errorMessage?: string;
  recordedAt: Date;
}> = [];
const clock: Clock = { now: () => now };
const store: BackgroundJobStore = {
  reassignOverdueBookings(at) {
    assert.equal(at, now);
    return [{ bookingId: 'booking-3', professionalId: 'professional-2' }];
  },
  enqueueDueBookingReminders(at) {
    assert.equal(at, now);
    return 2;
  },
  listDueNotificationJobs(at) {
    assert.equal(at, now.toISOString());
    return jobs;
  },
  recordNotificationDelivery(job, result, recordedAt) {
    recorded.push({
      job,
      delivered: result.delivered,
      ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
      recordedAt,
    });
  },
};
const gateway: NotificationGateway = {
  async deliver(job) {
    if (job.id === 'notification-failure') throw new Error('provider unavailable');
    return 'provider-reference';
  },
};
const domainEvents: DomainEventRunner = {
  async run(at) {
    assert.equal(at, now);
    return { claimed: 2, processed: 2, retried: 0, deadLettered: 0 };
  },
};

const processor = new BackgroundJobProcessor(store, gateway, clock, domainEvents);
assert.deepEqual(await processor.run(), {
  skipped: false,
  reassigned: [{ bookingId: 'booking-3', professionalId: 'professional-2' }],
  reminders: 2,
  delivered: 1,
  failed: 1,
  events: { claimed: 2, processed: 2, retried: 0, deadLettered: 0 },
});
assert.deepEqual(recorded.map(({ job, delivered, errorMessage, recordedAt }) => ({
  id: job.id,
  delivered,
  errorMessage,
  recordedAt,
})), [
  { id: 'notification-success', delivered: true, errorMessage: undefined, recordedAt: now },
  { id: 'notification-failure', delivered: false, errorMessage: 'provider unavailable', recordedAt: now },
]);

let releaseDelivery: (() => void) | undefined;
const blockedDelivery = new Promise<void>((resolve) => { releaseDelivery = resolve; });
const concurrencyStore: BackgroundJobStore = {
  reassignOverdueBookings: () => [],
  enqueueDueBookingReminders: () => 0,
  listDueNotificationJobs: () => [jobs[0]],
  recordNotificationDelivery: () => undefined,
};
const concurrencyGateway: NotificationGateway = {
  async deliver() {
    await blockedDelivery;
    return 'released';
  },
};
const concurrencyProcessor = new BackgroundJobProcessor(concurrencyStore, concurrencyGateway, clock, domainEvents);
const firstRun = concurrencyProcessor.run();
await Promise.resolve();
assert.deepEqual(await concurrencyProcessor.run(), {
  skipped: true,
  reassigned: [],
  reminders: 0,
  delivered: 0,
  failed: 0,
  events: { claimed: 0, processed: 0, retried: 0, deadLettered: 0 },
});
releaseDelivery?.();
assert.equal((await firstRun).delivered, 1);

console.log('Background job application service contracts passed.');
