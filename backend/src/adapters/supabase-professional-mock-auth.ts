import { randomBytes } from 'node:crypto';

import {
  MockProfessionalRegistrationError,
  type MockProfessionalSessionTokens,
  type ProfessionalMockAuthentication,
} from '../application/ports.ts';
import { supabaseServiceHeaders } from './supabase-service-headers.ts';

export { MockProfessionalRegistrationError } from '../application/ports.ts';

interface AdminUserResponse {
  id?: unknown;
}

interface PasswordSessionResponse {
  access_token?: unknown;
  refresh_token?: unknown;
}

/**
 * Development-only bridge for creating a real, confirmed Supabase professional
 * session after the fixed mock OTP is accepted by the Konjo API.
 *
 * The privileged key never leaves the backend. A random temporary password is
 * used only long enough to mint the session; the app immediately replaces it
 * with the password selected by the professional.
 */
export class SupabaseProfessionalMockAuth implements ProfessionalMockAuthentication {
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly publishableKey: string;
  private readonly fetcher: typeof fetch;

  constructor(
    baseUrl: string,
    secretKey: string,
    publishableKey: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl;
    this.secretKey = secretKey;
    this.publishableKey = publishableKey;
    this.fetcher = fetcher;
  }

  async register(phoneNumber: string): Promise<MockProfessionalSessionTokens> {
    const temporaryPassword = randomBytes(36).toString('base64url');
    const created = await this.fetcher(`${this.baseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: supabaseServiceHeaders(this.secretKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        phone: phoneNumber,
        password: temporaryPassword,
        phone_confirm: true,
        user_metadata: { role: 'professional', full_name: '' },
      }),
    }).catch(() => null);

    if (!created) {
      throw new MockProfessionalRegistrationError('provider_unavailable', 'Supabase Auth could not be reached.');
    }
    if (created.status === 422) {
      throw new MockProfessionalRegistrationError('phone_in_use', 'This phone number already has an account. Log in instead.');
    }
    if (!created.ok) {
      throw new MockProfessionalRegistrationError('provider_unavailable', `Supabase Auth returned HTTP ${created.status}.`);
    }

    const createdUser = await created.json().catch(() => null) as AdminUserResponse | null;
    const userId = typeof createdUser?.id === 'string' ? createdUser.id : null;
    if (!userId) {
      throw new MockProfessionalRegistrationError('provider_unavailable', 'Supabase Auth did not return the new account.');
    }

    try {
      const verified = await this.fetcher(
        `${this.baseUrl}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          headers: supabaseServiceHeaders(this.secretKey, {
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          }),
          body: JSON.stringify({ phone_verified_at: new Date().toISOString() }),
        },
      );
      if (!verified.ok) throw new Error(`Profile verification returned HTTP ${verified.status}.`);

      const signedIn = await this.fetcher(`${this.baseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          apikey: this.publishableKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phone: phoneNumber, password: temporaryPassword }),
      });
      const session = await signedIn.json().catch(() => null) as PasswordSessionResponse | null;
      if (
        !signedIn.ok ||
        typeof session?.access_token !== 'string' ||
        typeof session.refresh_token !== 'string'
      ) {
        throw new Error(`Supabase sign-in returned HTTP ${signedIn.status}.`);
      }
      return { accessToken: session.access_token, refreshToken: session.refresh_token };
    } catch (error) {
      await this.deleteUser(userId);
      throw new MockProfessionalRegistrationError(
        'provider_unavailable',
        error instanceof Error ? error.message : 'Supabase could not create the mock professional session.',
      );
    }
  }

  private async deleteUser(userId: string): Promise<void> {
    await this.fetcher(`${this.baseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: supabaseServiceHeaders(this.secretKey),
    }).catch(() => undefined);
  }
}
