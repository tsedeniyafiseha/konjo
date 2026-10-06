import type { ApiProfessionalCatalogSettings } from '../../../shared/api-contracts.ts';
import type { UpdateProfessionalCatalogResult } from './contracts.ts';
import type { Clock, ProfessionalSelfServiceCommandStore } from './ports.ts';

export class ManageProfessionalSelfService {
  private readonly store: ProfessionalSelfServiceCommandStore;
  private readonly clock: Clock;
  constructor(store: ProfessionalSelfServiceCommandStore, clock: Clock) { this.store = store; this.clock = clock; }
  async updateCatalog(
    professionalId: string,
    settings: ApiProfessionalCatalogSettings,
  ): Promise<UpdateProfessionalCatalogResult> {
    return await this.store.updateCatalog({ professionalId, settings, occurredAt: this.clock.now().toISOString() });
  }
  async setAvailability(professionalId: string, available: boolean): Promise<boolean> {
    return await this.store.setAvailability({ professionalId, available, occurredAt: this.clock.now().toISOString() });
  }
}
