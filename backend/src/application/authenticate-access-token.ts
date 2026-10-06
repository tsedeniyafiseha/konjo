import type { ApiUser } from '../../../shared/api-contracts.ts';

export interface LocalAccessTokenResolver {
  resolve(token: string): ApiUser | null;
}

export interface ExternalAccessTokenResolver {
  resolve(token: string): Promise<ApiUser | null>;
}

export interface ExternalAccountProjection {
  synchronize(user: ApiUser): ApiUser;
}

export class AccessTokenAuthenticationUnavailableError extends Error {
  constructor(message = 'External authentication is temporarily unavailable.') {
    super(message);
    this.name = 'AccessTokenAuthenticationUnavailableError';
  }
}

export interface AccessTokenAuthenticatorOptions {
  /** How long an externally verified token is trusted without asking again. */
  cacheTtlMs?: number;
  /** How long a previously verified token may still be honoured while the provider is down. */
  staleTtlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

interface CachedResolution {
  user: ApiUser;
  resolvedAt: number;
}

/**
 * Local sessions resolve in memory. External (Supabase) tokens cost two
 * network round trips, so a verified token is remembered for a short while:
 * every screen polls the API, and re-verifying on each poll made a slow
 * provider surface as 503s in the app. Concurrent requests for one token share
 * a single verification, and a recently verified token keeps working for a
 * bounded time if the provider stops answering.
 */
export class AccessTokenAuthenticator {
  private readonly local: LocalAccessTokenResolver;
  private readonly external: ExternalAccessTokenResolver;
  private readonly accounts: ExternalAccountProjection;
  private readonly cacheTtlMs: number;
  private readonly staleTtlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, CachedResolution>();
  private readonly inFlight = new Map<string, Promise<ApiUser | null>>();

  constructor(
    local: LocalAccessTokenResolver,
    external: ExternalAccessTokenResolver,
    accounts: ExternalAccountProjection,
    options: AccessTokenAuthenticatorOptions = {},
  ) {
    this.local = local;
    this.external = external;
    this.accounts = accounts;
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
    this.staleTtlMs = options.staleTtlMs ?? 10 * 60_000;
    this.maxEntries = options.maxEntries ?? 5_000;
    this.now = options.now ?? Date.now;
  }

  async authenticate(token: string): Promise<ApiUser | null> {
    const localUser = this.local.resolve(token);
    if (localUser) return localUser;
    // Keyed by the token itself: the map lives only in this process's memory.
    const key = token;
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.resolvedAt < this.cacheTtlMs) return this.accounts.synchronize(cached.user);
    let pending = this.inFlight.get(key);
    if (!pending) {
      pending = this.verify(token, key, cached).finally(() => { this.inFlight.delete(key); });
      this.inFlight.set(key, pending);
    }
    return pending;
  }

  private async verify(token: string, key: string, cached: CachedResolution | undefined): Promise<ApiUser | null> {
    let externalUser: ApiUser | null;
    try {
      externalUser = await this.external.resolve(token);
    } catch (error) {
      if (cached && this.now() - cached.resolvedAt < this.staleTtlMs) return this.accounts.synchronize(cached.user);
      throw error;
    }
    if (!externalUser) {
      this.cache.delete(key);
      return null;
    }
    this.remember(key, externalUser);
    return this.accounts.synchronize(externalUser);
  }

  private remember(key: string, user: ApiUser): void {
    this.cache.delete(key);
    this.cache.set(key, { user, resolvedAt: this.now() });
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}
