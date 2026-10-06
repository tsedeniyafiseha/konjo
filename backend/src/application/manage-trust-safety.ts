import type {
  OpenSafetyIncidentCommandInput,
  OpenSafetyIncidentResult,
  ResolveBookingDisputeStoreInput,
  ResolveQualityFlagStoreInput,
  ResolveSafetyIncidentStoreInput,
  TrustSafetyResolutionResult,
} from './contracts.ts';
import type { Clock, IdGenerator, TrustSafetyCommandStore } from './ports.ts';

export class ManageTrustSafety {
  private readonly store: TrustSafetyCommandStore;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;

  constructor(store: TrustSafetyCommandStore, ids: IdGenerator, clock: Clock) {
    this.store = store;
    this.ids = ids;
    this.clock = clock;
  }

  async openSafetyIncident(input: OpenSafetyIncidentCommandInput): Promise<OpenSafetyIncidentResult> {
    return await this.store.openSafetyIncident({
      ...input,
      incidentId: this.ids.next(),
      occurredAt: this.clock.now().toISOString(),
    });
  }

  async openBookingDispute(clientId: string, bookingId: string, reason: string): Promise<TrustSafetyResolutionResult['dispute'] | null> {
    return await this.store.openBookingDispute({
      disputeId: this.ids.next(),
      clientId,
      bookingId,
      reason,
      occurredAt: this.clock.now().toISOString(),
    });
  }

  async resolveSafetyIncident(
    adminId: string,
    incidentId: string,
    resolution: string,
  ): Promise<TrustSafetyResolutionResult['safetyIncident'] | null> {
    const input: ResolveSafetyIncidentStoreInput = {
      auditId: this.ids.next(),
      adminId,
      incidentId,
      resolution,
      occurredAt: this.clock.now().toISOString(),
    };
    return await this.store.resolveSafetyIncident(input);
  }

  async resolveQualityFlag(
    adminId: string,
    flagId: string,
    resolution: string,
    action: ResolveQualityFlagStoreInput['action'],
  ): Promise<TrustSafetyResolutionResult['qualityFlag'] | null> {
    return await this.store.resolveQualityFlag({
      auditId: this.ids.next(),
      adminId,
      flagId,
      resolution,
      action,
      occurredAt: this.clock.now().toISOString(),
    });
  }

  async resolveBookingDispute(
    adminId: string,
    disputeId: string,
    status: ResolveBookingDisputeStoreInput['status'],
    resolution: string,
  ): Promise<TrustSafetyResolutionResult['dispute'] | null> {
    return await this.store.resolveBookingDispute({
      auditId: this.ids.next(),
      adminId,
      disputeId,
      status,
      resolution,
      occurredAt: this.clock.now().toISOString(),
    });
  }
}
