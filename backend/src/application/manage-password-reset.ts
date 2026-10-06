import type { ApiPasswordResetRequest } from '../../../shared/api-contracts.ts';
import {
  EmailDeliveryError,
  type Clock,
  type PasswordResetSender,
  type PasswordResetStore,
  type PasswordSecurity,
  type SessionTokenSecurity,
} from './ports.ts';

export class PasswordResetManager {
  private readonly store: PasswordResetStore;
  private readonly sender: PasswordResetSender;
  private readonly passwords: PasswordSecurity;
  private readonly tokens: SessionTokenSecurity;
  private readonly clock: Clock;
  private readonly lifetimeMs: number;
  private readonly exposeDevelopmentToken: boolean;

  constructor(
    store: PasswordResetStore,
    sender: PasswordResetSender,
    passwords: PasswordSecurity,
    tokens: SessionTokenSecurity,
    clock: Clock,
    policy: { lifetimeMs: number; exposeDevelopmentToken: boolean },
  ) {
    this.store = store;
    this.sender = sender;
    this.passwords = passwords;
    this.tokens = tokens;
    this.clock = clock;
    this.lifetimeMs = policy.lifetimeMs;
    this.exposeDevelopmentToken = policy.exposeDevelopmentToken;
  }

  async request(email: string): Promise<{
    response: ApiPasswordResetRequest;
    deliveryError: Error | null;
  }> {
    const response: ApiPasswordResetRequest = { accepted: true };
    const account = this.store.findResettableClient(email);
    if (!account) return { response, deliveryError: null };

    const token = this.tokens.createToken();
    const tokenHash = this.tokens.hashToken(token);
    const now = this.clock.now().getTime();
    this.store.createPasswordResetToken({
      userId: account.userId,
      tokenHash,
      expiresAt: now + this.lifetimeMs,
      createdAt: now,
    });
    try {
      await this.sender.send(account.email, token);
      if (this.exposeDevelopmentToken) response.developmentToken = token;
      return { response, deliveryError: null };
    } catch (error) {
      this.store.deletePasswordResetToken(tokenHash);
      if (!(error instanceof EmailDeliveryError)) throw error;
      return { response, deliveryError: error };
    }
  }

  async confirm(token: string, password: string): Promise<boolean> {
    return this.store.resetPassword(
      this.tokens.hashToken(token),
      await this.passwords.hash(password),
      this.clock.now().getTime(),
    );
  }
}
