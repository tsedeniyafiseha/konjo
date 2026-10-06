import type { DomainEventRunResult } from './contracts.ts';
import type {
  Clock,
  DomainEventHandler,
  DomainEventRunner,
  DomainEventStore,
  IdGenerator,
} from './ports.ts';
import type { DomainEventEnvelope, DomainEventType } from '../domain/events.ts';

export interface DomainEventProcessorPolicy {
  batchSize: number;
  leaseMs: number;
  maxAttempts: number;
  baseRetryMs: number;
  maxRetryMs: number;
}

export class DomainEventProcessor implements DomainEventRunner {
  private readonly store: DomainEventStore;
  private readonly handlers = new Map<DomainEventType, DomainEventHandler[]>();
  private readonly ids: IdGenerator;
  private readonly clock: Clock;
  private readonly policy: DomainEventProcessorPolicy;

  constructor(
    store: DomainEventStore,
    handlers: ReadonlyArray<DomainEventHandler>,
    ids: IdGenerator,
    clock: Clock,
    policy: DomainEventProcessorPolicy,
  ) {
    this.store = store;
    this.ids = ids;
    this.clock = clock;
    this.policy = policy;
    for (const handler of handlers) {
      for (const eventType of handler.eventTypes) {
        this.handlers.set(eventType, [...(this.handlers.get(eventType) ?? []), handler]);
      }
    }
  }

  async run(at?: Date): Promise<DomainEventRunResult> {
    const claimedAt = at ?? this.clock.now();
    const workerId = this.ids.next();
    const events = await this.store.claimDomainEvents({
      workerId,
      now: claimedAt.toISOString(),
      lockedUntil: new Date(claimedAt.getTime() + this.policy.leaseMs).toISOString(),
      limit: this.policy.batchSize,
    });
    const result: DomainEventRunResult = {
      claimed: events.length,
      processed: 0,
      retried: 0,
      deadLettered: 0,
    };

    for (const event of events) {
      try {
        const handlers = this.handlers.get(event.eventType) ?? [];
        if (handlers.length === 0) throw new Error(`No domain event handler is registered for ${event.eventType}.`);
        for (const handler of handlers) await handler.handle(event);
        await this.store.markDomainEventProcessed(event.eventId, workerId, this.clock.now().toISOString());
        result.processed += 1;
      } catch (error) {
        const terminal = event.attempt >= this.policy.maxAttempts;
        const failedAt = this.clock.now();
        const retryDelay = Math.min(
          this.policy.maxRetryMs,
          this.policy.baseRetryMs * 2 ** Math.max(0, event.attempt - 1),
        );
        await this.store.recordDomainEventFailure({
          eventId: event.eventId,
          workerId,
          failedAt: failedAt.toISOString(),
          availableAt: new Date(failedAt.getTime() + retryDelay).toISOString(),
          errorMessage: error instanceof Error ? error.message : 'Domain event processing failed.',
          terminal,
        });
        if (terminal) result.deadLettered += 1;
        else result.retried += 1;
      }
    }

    return result;
  }
}

export function asDomainEvent<T extends DomainEventEnvelope>(event: DomainEventEnvelope): T {
  return event as T;
}
