import type {
  AdminProfessionalCommandResults,
  ProfessionalApplicationReviewAction,
} from './contracts.ts';
import type {
  AdminProfessionalApplicationCommandStore,
  AdminProfessionalCommandStore,
  Clock,
  IdGenerator,
} from './ports.ts';

export class ManageAdminProfessionals {
  private readonly store: AdminProfessionalCommandStore;
  private readonly applicationStore: AdminProfessionalApplicationCommandStore;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;

  constructor(
    store: AdminProfessionalCommandStore,
    ids: IdGenerator,
    clock: Clock,
    applicationStore: AdminProfessionalApplicationCommandStore = store,
  ) {
    this.store = store;
    this.applicationStore = applicationStore;
    this.ids = ids;
    this.clock = clock;
  }

  reviewApplication(
    adminId: string,
    professionalId: string,
    action: ProfessionalApplicationReviewAction,
    reason?: string,
  ): AdminProfessionalCommandResults['application'] | null | Promise<AdminProfessionalCommandResults['application'] | null> {
    const note = reason?.trim();
    return this.applicationStore.reviewApplication({
      ...this.context(adminId),
      professionalId,
      action,
      ...(note ? { reason: note } : {}),
    });
  }

  async approveForDevelopment(
    professionalId: string,
  ): Promise<AdminProfessionalCommandResults['application'] | null> {
    return await this.store.approveForDevelopment({
      professionalId,
      occurredAt: this.clock.now().toISOString(),
    });
  }

  async updateProfessional(
    adminId: string,
    professionalId: string,
    input: { featured: boolean; femaleOnlyEligible: boolean },
  ): Promise<AdminProfessionalCommandResults['professional'] | null> {
    return await this.store.updateProfessional({
      ...this.context(adminId),
      professionalId,
      ...input,
    });
  }

  async setProfessionalState(
    adminId: string,
    professionalId: string,
    action: 'suspend' | 'restore',
  ): Promise<AdminProfessionalCommandResults['professional'] | null> {
    return await this.store.setProfessionalState({
      ...this.context(adminId),
      professionalId,
      action,
    });
  }

  private context(adminId: string) {
    return {
      auditId: this.ids.next(),
      adminId,
      occurredAt: this.clock.now().toISOString(),
    };
  }
}
