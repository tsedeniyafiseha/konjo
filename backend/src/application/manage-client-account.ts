import type { ApiAccountRole, ApiClientPreferredLanguage, ApiUser } from '../../../shared/api-contracts.ts';
import type { CompleteClientOnboardingResult } from './contracts.ts';
import type { ClientAccountCommandStore, Clock, IdGenerator } from './ports.ts';

export class ManageClientAccount {
  private readonly store: ClientAccountCommandStore;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;

  constructor(store: ClientAccountCommandStore, ids: IdGenerator, clock: Clock) {
    this.store = store;
    this.ids = ids;
    this.clock = clock;
  }

  updateProfile(
    userId: string,
    input: {
      fullName: string;
      phoneNumber: string | null;
      preferredLanguage?: ApiClientPreferredLanguage;
    },
  ): Promise<ApiUser | null> {
    return Promise.resolve(this.store.updateProfile({
      userId,
      ...input,
      occurredAt: this.clock.now().toISOString(),
    }));
  }

  completeOnboarding(userId: string, input: {
    fullName: string;
    phoneNumber: string | null;
    preferredLanguage: ApiClientPreferredLanguage;
    address?: { label: string; zone: string; detail: string };
  }): Promise<CompleteClientOnboardingResult> {
    return Promise.resolve(this.store.completeOnboarding({
      userId,
      fullName: input.fullName,
      phoneNumber: input.phoneNumber,
      preferredLanguage: input.preferredLanguage,
      occurredAt: this.clock.now().toISOString(),
      ...(input.address ? { address: { id: this.ids.next(), ...input.address } } : {}),
    }));
  }

  deleteAccount(userId: string, role: Exclude<ApiAccountRole, 'admin'>): Promise<boolean> {
    return Promise.resolve(this.store.deleteAccount({
      userId,
      role,
      occurredAt: this.clock.now().toISOString(),
    }));
  }
}
