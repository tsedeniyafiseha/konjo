import type { ApiAccountRole, ApiUser } from '../../../shared/api-contracts.ts';
import {
  AccessTokenAuthenticationUnavailableError,
  type ExternalAccessTokenResolver,
} from '../application/authenticate-access-token.ts';

interface SupabaseUserResponse {
  id?: unknown;
  email?: unknown;
  phone?: unknown;
}

interface SupabaseProfileRow {
  user_id?: unknown;
  account_role?: unknown;
  full_name?: unknown;
  email?: unknown;
  phone_number?: unknown;
  phone_verified_at?: unknown;
  created_at?: unknown;
}

function isRole(value: unknown): value is ApiAccountRole {
  return value === 'client' || value === 'professional' || value === 'admin';
}

// Supabase Auth stores phone numbers without the leading "+"; the API and
// its validators use E.164 (for example +251911234567).
function toE164(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.trim().replace(/[\s()-]/g, '');
  if (!digits) return null;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

export class SupabaseAccessTokenResolver implements ExternalAccessTokenResolver {
  private readonly projectUrl: string | null;
  private readonly publishableKey: string | null;
  private readonly fetcher: typeof fetch;

  constructor(
    projectUrl: string | null,
    publishableKey: string | null,
    fetcher: typeof fetch = fetch,
  ) {
    this.projectUrl = projectUrl?.replace(/\/$/, '') ?? null;
    this.publishableKey = publishableKey;
    this.fetcher = fetcher;
  }

  async resolve(token: string): Promise<ApiUser | null> {
    if (!this.projectUrl || !this.publishableKey) return null;
    const headers = {
      apikey: this.publishableKey,
      Authorization: `Bearer ${token}`,
    };
    let userResponse: Response;
    let profileResponse: Response;
    try {
      userResponse = await this.fetcher(`${this.projectUrl}/auth/v1/user`, {
        headers,
        signal: AbortSignal.timeout(8_000),
      });
      if (userResponse.status === 401 || userResponse.status === 403) return null;
      if (!userResponse.ok) throw new Error(`Supabase Auth returned ${userResponse.status}.`);
      const user = await userResponse.json() as SupabaseUserResponse;
      if (typeof user.id !== 'string' || user.id.length === 0) return null;

      const query = new URLSearchParams({
        select: 'user_id,account_role,full_name,email,phone_number,phone_verified_at,created_at',
        user_id: `eq.${user.id}`,
        limit: '1',
      });
      profileResponse = await this.fetcher(`${this.projectUrl}/rest/v1/profiles?${query}`, {
        headers,
        signal: AbortSignal.timeout(8_000),
      });
      if (profileResponse.status === 401 || profileResponse.status === 403) return null;
      if (!profileResponse.ok) throw new Error(`Supabase profiles returned ${profileResponse.status}.`);
      const rows = await profileResponse.json() as SupabaseProfileRow[];
      const profile = rows[0];
      if (!profile || profile.user_id !== user.id || !isRole(profile.account_role)) return null;
      return {
        id: user.id,
        role: profile.account_role,
        email: typeof profile.email === 'string'
          ? profile.email
          : typeof user.email === 'string' ? user.email : null,
        fullName: typeof profile.full_name === 'string' && profile.full_name.trim()
          ? profile.full_name
          : 'Konjo member',
        // Clients must have proven the number with an SMS code; until then the
        // API treats them as having no verified phone.
        phoneNumber: profile.account_role === 'client' && !profile.phone_verified_at
          ? null
          : toE164(
            typeof profile.phone_number === 'string' && profile.phone_number
              ? profile.phone_number
              : typeof user.phone === 'string' ? user.phone : null,
          ),
        createdAt: typeof profile.created_at === 'string'
          ? profile.created_at
          : new Date(0).toISOString(),
      };
    } catch (error) {
      if (error instanceof AccessTokenAuthenticationUnavailableError) throw error;
      throw new AccessTokenAuthenticationUnavailableError(
        error instanceof Error ? error.message : undefined,
      );
    }
  }
}
