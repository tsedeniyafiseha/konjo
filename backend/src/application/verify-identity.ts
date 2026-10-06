import type { ApiClientIdentityStatus } from '../../../shared/api-contracts.ts';
import type {
  ClientIdentityVerificationStore,
  Clock,
  IdentityVerifier,
} from './ports.ts';

export class VerifyIdentity {
  private readonly clientStore: ClientIdentityVerificationStore;
  private readonly verifier: IdentityVerifier;
  private readonly clock: Clock;

  constructor(
    clientStore: ClientIdentityVerificationStore,
    verifier: IdentityVerifier,
    clock: Clock,
  ) {
    this.clientStore = clientStore;
    this.verifier = verifier;
    this.clock = clock;
  }

  async client(userId: string, identifier: string): Promise<ApiClientIdentityStatus> {
    const verification = await this.verifier.verify(identifier);
    return this.clientStore.recordClientVerification(
      userId,
      verification.lastFour,
      this.clock.now().toISOString(),
    );
  }
}
