import type { SupabaseClient } from '@supabase/supabase-js';

import type { OtpChallenge, VerifyOtpInput } from '@/application/auth/phone-auth-contracts';
import type {
  SupabaseAuthIdentity,
  SupabaseAuthPort,
} from '@/adapters/supabase/supabase-client-auth-gateway';
import type { ProfessionalRegistrationOtpMock } from '@/adapters/supabase/supabase-phone-auth-gateway';
import { apiRequest } from '@/services/api-client';
import type { Database } from '@/services/supabase-database.types';

interface MockOtpChallengeResponse {
  challenge: OtpChallenge;
}

interface MockOtpVerificationResponse {
  session: {
    accessToken: string;
    refreshToken: string;
  };
}

/** Uses the local Konjo API to exchange the fixed development code for a real Supabase session. */
export class SupabaseProfessionalRegistrationOtpMock implements ProfessionalRegistrationOtpMock {
  private readonly client: SupabaseClient<Database>;
  private readonly authPort: SupabaseAuthPort;

  constructor(
    client: SupabaseClient<Database>,
    authPort: SupabaseAuthPort,
  ) {
    this.client = client;
    this.authPort = authPort;
  }

  async requestOtp(phoneNumber: string): Promise<OtpChallenge> {
    const response = await apiRequest<MockOtpChallengeResponse>('/v1/auth/professional/mock-otp/request', {
      method: 'POST',
      body: { phoneNumber },
    });
    return response.challenge;
  }

  async verifyOtp(input: VerifyOtpInput): Promise<SupabaseAuthIdentity> {
    const response = await apiRequest<MockOtpVerificationResponse>('/v1/auth/professional/mock-otp/verify', {
      method: 'POST',
      body: {
        challengeId: input.challengeId,
        phoneNumber: input.phoneNumber,
        code: input.code,
      },
    });
    const { error } = await this.client.auth.setSession({
      access_token: response.session.accessToken,
      refresh_token: response.session.refreshToken,
    });
    if (error) throw error;
    const identity = await this.authPort.restore();
    if (!identity) throw new Error('The mock professional session could not be restored.');
    return identity;
  }
}
