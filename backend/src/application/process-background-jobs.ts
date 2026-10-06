import type { BackgroundJobRunResult } from './contracts.ts';
import type { BackgroundJobStore, Clock, DomainEventRunner, NotificationGateway } from './ports.ts';

export class BackgroundJobProcessor {
  private running = false;
  private readonly store: BackgroundJobStore;
  private readonly notificationGateway: NotificationGateway;
  private readonly clock: Clock;
  private readonly domainEvents: DomainEventRunner;

  constructor(
    store: BackgroundJobStore,
    notificationGateway: NotificationGateway,
    clock: Clock,
    domainEvents: DomainEventRunner,
  ) {
    this.store = store;
    this.notificationGateway = notificationGateway;
    this.clock = clock;
    this.domainEvents = domainEvents;
  }

  async run(at?: Date): Promise<BackgroundJobRunResult> {
    if (this.running) {
      return {
        skipped: true,
        reassigned: [],
        reminders: 0,
        delivered: 0,
        failed: 0,
        events: { claimed: 0, processed: 0, retried: 0, deadLettered: 0 },
      };
    }

    this.running = true;
    try {
      const now = at ?? this.clock.now();
      const reassigned = await this.store.reassignOverdueBookings(now);
      const reminders = await this.store.enqueueDueBookingReminders(now);
      const events = await this.domainEvents.run(now);
      const jobs = await this.store.listDueNotificationJobs(now.toISOString());
      let delivered = 0;
      let failed = 0;

      for (const job of jobs) {
        try {
          const providerReference = await this.notificationGateway.deliver(job);
          const pending = providerReference.startsWith('expo-ticket:');
          await this.store.recordNotificationDelivery(
            job,
            { delivered: !pending, ...(pending ? { pending: true } : {}), providerReference },
            now,
          );
          if (!pending) delivered += 1;
        } catch (error) {
          await this.store.recordNotificationDelivery(job, {
            delivered: false,
            errorMessage: error instanceof Error ? error.message : 'Notification delivery failed.',
          }, now);
          failed += 1;
        }
      }

      return { skipped: false, reassigned, reminders, delivered, failed, events };
    } finally {
      this.running = false;
    }
  }
}
