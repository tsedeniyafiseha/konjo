import type { AdminCommandContext, ProfessionalPayoutCommandResult } from './contracts.ts';
import type { AdminPayoutCommandStore, Clock, IdGenerator } from './ports.ts';

/**
 * Konjo collects client payments and owes professionals their net earnings.
 * An administrator prepares a payout batch from everything a professional is
 * owed, pays it outside the app to the payout method the professional
 * registered, then records the transfer reference here. Both steps are audited.
 */
export class ManageAdminPayouts {
  private readonly store: AdminPayoutCommandStore;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;

  constructor(store: AdminPayoutCommandStore, ids: IdGenerator, clock: Clock) {
    this.store = store;
    this.ids = ids;
    this.clock = clock;
  }

  async queue(adminId: string, professionalId: string): Promise<ProfessionalPayoutCommandResult> {
    return await this.store.queueAdminPayout({ ...this.context(adminId), professionalId, payoutId: this.ids.next() });
  }

  async settle(
    adminId: string,
    professionalId: string,
    payoutId: string,
    input: { paidReference: string | null; paidNote: string | null },
  ): Promise<ProfessionalPayoutCommandResult> {
    return await this.store.settleAdminPayout({ ...this.context(adminId), professionalId, payoutId, ...input });
  }

  private context(adminId: string): AdminCommandContext {
    return { auditId: this.ids.next(), adminId, occurredAt: this.clock.now().toISOString() };
  }
}
