import type {
  AuthSession,
  SessionRevocationGateway,
  SessionStorage,
  ExternalSessionSource,
} from '../../application/auth/session-controller';
import {
  sessionFromSupabase,
  type SupabaseAuthPort,
} from './supabase-client-auth-gateway.ts';

export class SupabaseAwareSessionStorage implements SessionStorage {
  private readonly supabase: SupabaseAuthPort;
  private readonly fallback: SessionStorage;

  constructor(
    supabase: SupabaseAuthPort,
    fallback: SessionStorage,
  ) {
    this.supabase = supabase;
    this.fallback = fallback;
  }

  async read(): Promise<AuthSession | null> {
    const identity = await this.supabase.restore();
    await this.fallback.clear();
    return identity ? sessionFromSupabase(identity) : null;
  }

  write(_session: AuthSession): Promise<void> {
    // Supabase persists and refreshes its own session. Keeping a second token in
    // the legacy session store can revive an expired login after Supabase signs
    // the user out, so Supabase remains the only source of truth in this mode.
    return this.fallback.clear();
  }

  clear(): Promise<void> {
    return this.fallback.clear();
  }
}

export class SupabaseAwareSessionRevocationGateway implements SessionRevocationGateway {
  private readonly supabase: SupabaseAuthPort;
  private readonly fallback: SessionRevocationGateway;

  constructor(
    supabase: SupabaseAuthPort,
    fallback: SessionRevocationGateway,
  ) {
    this.supabase = supabase;
    this.fallback = fallback;
  }

  async revoke(session: AuthSession): Promise<void> {
    if (await this.supabase.ownsUser(session.userId)) {
      await this.supabase.signOut();
      return;
    }
    await this.fallback.revoke(session);
  }
}

export class SupabaseExternalSessionSource implements ExternalSessionSource {
  private readonly supabase: SupabaseAuthPort;

  constructor(supabase: SupabaseAuthPort) {
    this.supabase = supabase;
  }

  subscribe(listener: (session: AuthSession | null) => void): () => void {
    return this.supabase.subscribe((identity) => {
      listener(identity ? sessionFromSupabase(identity) : null);
    });
  }
}
