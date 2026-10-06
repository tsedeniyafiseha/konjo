import type { ApiAccountRole, ApiOtpChallenge } from '../../../shared/api-contracts.ts';

import type { Clock, IdGenerator, OtpChallengeStore, OtpSecurity, OtpSender } from './ports.ts';

export interface RequestOtpPolicy {
  lifetimeMs: number;
  requestWindowMs: number;
  requestsPerWindow: number;
  attempts: number;
  exposeDevelopmentCode: boolean;
}

export class OtpRequestRateLimitedError extends Error {
  constructor() {
    super('Too many verification codes were requested. Please wait and try again.');
    this.name = 'OtpRequestRateLimitedError';
  }
}

export class RequestOtpHandler {
  private readonly store: OtpChallengeStore;
  private readonly sender: OtpSender;
  private readonly ids: IdGenerator;
  private readonly security: OtpSecurity;
  private readonly clock: Clock;
  private readonly policy: RequestOtpPolicy;

  constructor(
    store: OtpChallengeStore,
    sender: OtpSender,
    ids: IdGenerator,
    security: OtpSecurity,
    clock: Clock,
    policy: RequestOtpPolicy,
  ) {
    this.store = store;
    this.sender = sender;
    this.ids = ids;
    this.security = security;
    this.clock = clock;
    this.policy = policy;
  }

  async execute(input: {
    phoneNumber: string;
    role: Exclude<ApiAccountRole, 'admin'>;
  }): Promise<ApiOtpChallenge> {
    const now = this.clock.now().getTime();
    const recentRequests = this.store.countRecentOtpChallenges(
      input.phoneNumber,
      now - this.policy.requestWindowMs,
    );
    if (recentRequests >= this.policy.requestsPerWindow) throw new OtpRequestRateLimitedError();

    const id = this.ids.next();
    const code = this.security.createCode();
    const expiresAt = now + this.policy.lifetimeMs;
    this.store.createOtpChallenge({
      id,
      phoneNumber: input.phoneNumber,
      role: input.role,
      codeHash: this.security.hash(id, code),
      expiresAt,
      attempts: this.policy.attempts,
      createdAt: now,
    });

    try {
      await this.sender.send(input.phoneNumber, code);
    } catch (error) {
      this.store.deleteOtpChallenge(id);
      throw error;
    }

    return {
      id,
      phoneNumber: input.phoneNumber,
      expiresAt,
      ...(this.policy.exposeDevelopmentCode ? { developmentCode: code } : {}),
    };
  }
}
