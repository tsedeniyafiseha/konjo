import type { ApiAccountRole, ApiUser } from '../../../shared/api-contracts.ts';
import type { Clock, IdGenerator, OtpSecurity, OtpVerificationStore } from './ports.ts';

export type VerifyOtpResult =
  | { result: 'verified'; user: ApiUser }
  | { result: 'invalid_challenge' }
  | { result: 'invalid_code' }
  | { result: 'phone_in_use' }
  | { result: 'account_not_found' };

export class VerifyOtpHandler {
  private readonly store: OtpVerificationStore;
  private readonly security: OtpSecurity;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;

  constructor(
    store: OtpVerificationStore,
    security: OtpSecurity,
    ids: IdGenerator,
    clock: Clock,
  ) {
    this.store = store;
    this.security = security;
    this.ids = ids;
    this.clock = clock;
  }

  execute(input: {
    challengeId: string;
    code: string;
    role: Exclude<ApiAccountRole, 'admin'>;
    authenticatedUserId?: string;
    shouldCreateUser?: boolean;
  }): VerifyOtpResult {
    const now = this.clock.now();
    const challenge = this.store.findOtpChallenge(input.challengeId);
    if (
      !challenge ||
      challenge.role !== input.role ||
      challenge.consumedAt !== null ||
      challenge.expiresAt <= now.getTime() ||
      challenge.attemptsRemaining <= 0
    ) return { result: 'invalid_challenge' };

    if (!this.security.verify(challenge.id, input.code, challenge.codeHash)) {
      this.store.recordOtpFailure(challenge.id);
      return { result: 'invalid_code' };
    }
    if (!this.store.consumeOtpChallenge(challenge.id, now.getTime())) {
      return { result: 'invalid_challenge' };
    }
    const user = input.authenticatedUserId
      ? this.store.attachVerifiedPhone({
          userId: input.authenticatedUserId,
          phoneNumber: challenge.phoneNumber,
          role: input.role,
        })
      : this.store.findOrCreatePhoneUser({
          userId: this.ids.next(),
          phoneNumber: challenge.phoneNumber,
          role: input.role,
          createdAt: now.toISOString(),
          ...(input.shouldCreateUser !== undefined ? { shouldCreateUser: input.shouldCreateUser } : {}),
        });
    if (!user) return { result: input.authenticatedUserId ? 'phone_in_use' : 'account_not_found' };
    return { result: 'verified', user };
  }
}
