import type { ProfessionalApplicationInput, SubmitProfessionalApplicationResult } from './contracts.ts';
import type { Clock, IdGenerator, ProfessionalApplicationCommandStore } from './ports.ts';

export class SubmitProfessionalApplicationHandler {
  private readonly store: ProfessionalApplicationCommandStore;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;
  constructor(store: ProfessionalApplicationCommandStore, ids: IdGenerator, clock: Clock) { this.store = store; this.ids = ids; this.clock = clock; }

  async execute(userId: string, application: ProfessionalApplicationInput): Promise<SubmitProfessionalApplicationResult> {
    const now = this.clock.now();
    const idPart = this.ids.next().replaceAll('-', '').slice(0, 8).toUpperCase();
    return this.store.submitApplication({
      userId,
      applicationId: `KJ-PRO-${idPart}`,
      application,
      submittedAt: now.getTime(),
      occurredAt: now.toISOString(),
    });
  }
}
