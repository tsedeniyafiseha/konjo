import type { AccountAssetCleaner, DomainEventHandler } from './ports.ts';
import { asDomainEvent } from './process-domain-events.ts';
import {
  domainEventTypes,
  type AccountDeletedEvent,
  type DomainEventEnvelope,
} from '../domain/events.ts';

export class AccountAssetDeletionProjector implements DomainEventHandler {
  readonly eventTypes = [domainEventTypes.accountDeleted] as const;
  private readonly assets: AccountAssetCleaner;

  constructor(assets: AccountAssetCleaner) {
    this.assets = assets;
  }

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    const event = asDomainEvent<AccountDeletedEvent>(envelope);
    const { userId, role } = event.payload;
    if (
      event.aggregateType !== 'account' ||
      event.aggregateId !== userId ||
      !userId ||
      (role !== 'client' && role !== 'professional')
    ) {
      throw new Error(`AccountDeleted event ${event.eventId} has an invalid payload.`);
    }
    await this.assets.deletePrivateAssets(userId, role);
  }
}
