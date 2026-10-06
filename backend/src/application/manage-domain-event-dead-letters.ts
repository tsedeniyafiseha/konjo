import type { ApiDomainEventDeadLetter } from '../../../shared/api-contracts.ts';
import type { Clock, DomainEventRecoveryStore } from './ports.ts';

export class DomainEventDeadLetterManager {
  private readonly store: DomainEventRecoveryStore;
  private readonly clock: Clock;

  constructor(store: DomainEventRecoveryStore, clock: Clock) {
    this.store = store;
    this.clock = clock;
  }

  async list(limit = 50): Promise<ReadonlyArray<ApiDomainEventDeadLetter>> {
    return await this.store.listFailedDomainEvents(limit);
  }

  async replay(eventId: string, adminId: string): Promise<'replayed' | 'not_found' | 'not_failed'> {
    return await this.store.replayFailedDomainEvent(eventId, adminId, this.clock.now().toISOString());
  }
}
