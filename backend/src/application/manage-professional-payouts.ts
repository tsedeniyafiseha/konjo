import type { ProfessionalPayoutCommandResult } from './contracts.ts';
import type {
  Clock,
  IdGenerator,
  ProfessionalPayoutCommandStore,
} from './ports.ts';

export class ManageProfessionalPayouts {
  private readonly payouts: ProfessionalPayoutCommandStore;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;

  constructor(payouts: ProfessionalPayoutCommandStore, ids: IdGenerator, clock: Clock) {
    this.payouts = payouts;
    this.ids = ids;
    this.clock = clock;
  }

  async queue(professionalId: string): Promise<ProfessionalPayoutCommandResult> {
    return await this.payouts.queuePayout({
      payoutId: this.ids.next(),
      professionalId,
      occurredAt: this.clock.now().toISOString(),
    });
  }

  async settle(professionalId: string, payoutId: string): Promise<ProfessionalPayoutCommandResult> {
    return await this.payouts.settlePayout({
      payoutId,
      professionalId,
      occurredAt: this.clock.now().toISOString(),
    });
  }
}
