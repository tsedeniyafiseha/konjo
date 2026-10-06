import type { AuthApiResponse, ApiUser } from '../../../shared/api-contracts.ts';
import type { Clock, SessionStore, SessionTokenSecurity } from './ports.ts';

export class SessionManager {
  private readonly store: SessionStore;
  private readonly security: SessionTokenSecurity;
  private readonly clock: Clock;
  private readonly lifetimeMs: number;

  constructor(
    store: SessionStore,
    security: SessionTokenSecurity,
    clock: Clock,
    lifetimeMs: number,
  ) {
    this.store = store;
    this.security = security;
    this.clock = clock;
    this.lifetimeMs = lifetimeMs;
  }

  issue(user: ApiUser): AuthApiResponse {
    const token = this.security.createToken();
    const now = this.clock.now();
    const expiresAt = now.getTime() + this.lifetimeMs;
    this.store.createSession({
      userId: user.id,
      role: user.role,
      tokenHash: this.security.hashToken(token),
      expiresAt,
      createdAt: now.toISOString(),
    });
    return { user, session: { token, expiresAt } };
  }

  resolve(token: string): ApiUser | null {
    return this.store.findUserForSession(this.security.hashToken(token), this.clock.now().getTime());
  }

  revoke(token: string): void {
    this.store.deleteSession(this.security.hashToken(token));
  }
}
