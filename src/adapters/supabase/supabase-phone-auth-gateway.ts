import {
  PhoneAuthError,
  type OtpChallenge,
  type PhoneAuthenticationGateway,
  type VerifyOtpInput,
} from '../../application/auth/phone-auth-contracts.ts';
import { ClientAuthError } from '../../application/auth/client-auth-contracts.ts';
import {
  sessionFromSupabase,
  type SupabaseAuthIdentity,
  type SupabaseAuthPort,
} from './supabase-client-auth-gateway.ts';
import { PROFESSIONAL_MOCK_OTP_CHALLENGE_PREFIX } from '../../../shared/mock-professional-otp.ts';

export interface ProfessionalRegistrationOtpMock {
  requestOtp(phoneNumber: string): Promise<OtpChallenge>;
  verifyOtp(input: VerifyOtpInput): Promise<SupabaseAuthIdentity>;
}

function serviceError(error: unknown): PhoneAuthError {
  if (error instanceof PhoneAuthError) return error;
  if (error instanceof ClientAuthError && error.code === 'invalid_input') {
    return new PhoneAuthError(error.providerCode === 'otp_expired' ? 'invalid_code' : 'invalid_request', error.message);
  }
  return new PhoneAuthError(
    'service_unavailable',
    error instanceof Error ? error.message : 'Phone verification is temporarily unavailable.',
  );
}

function digits(value: string | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Only a signed-in user entering a new number is changing their phone. */
function isDifferentPhone(current: string | undefined, requested: string): boolean {
  return Boolean(current) && digits(current) !== digits(requested);
}

export class SupabasePhoneAuthGateway implements PhoneAuthenticationGateway {
  private readonly port: SupabaseAuthPort;
  private readonly professionalRegistrationMock: ProfessionalRegistrationOtpMock | null;

  constructor(
    port: SupabaseAuthPort,
    professionalRegistrationMock: ProfessionalRegistrationOtpMock | null = null,
  ) {
    this.port = port;
    this.professionalRegistrationMock = professionalRegistrationMock;
  }

  async requestOtp(
    phoneNumber: string,
    role: VerifyOtpInput['role'],
    context?: Parameters<PhoneAuthenticationGateway['requestOtp']>[2],
  ): Promise<OtpChallenge> {
    if (role === 'professional' && context?.shouldCreateUser === true && this.professionalRegistrationMock) {
      try {
        return await this.professionalRegistrationMock.requestOtp(phoneNumber);
      } catch (error) {
        throw serviceError(error);
      }
    }
    try {
      await this.port.requestPhoneOtp(phoneNumber, role, {
        changeExistingPhone: role === 'client' && isDifferentPhone(context?.session?.phoneNumber, phoneNumber),
        ...(context?.registration ? { registration: context.registration } : {}),
        ...(context?.resend ? { resend: true } : {}),
        shouldCreateUser:
          context?.shouldCreateUser ?? (role === 'professional' || Boolean(context?.registration)),
      });
      return {
        id: `supabase-${role}-${Date.now()}`,
        phoneNumber,
        expiresAt: Date.now() + 60_000,
        codeLength: 6,
      };
    } catch (error) {
      throw serviceError(error);
    }
  }

  async verifyOtp(input: VerifyOtpInput) {
    let identity: SupabaseAuthIdentity;
    try {
      identity = input.role === 'professional' &&
        input.challengeId.startsWith(PROFESSIONAL_MOCK_OTP_CHALLENGE_PREFIX) &&
        this.professionalRegistrationMock
        ? await this.professionalRegistrationMock.verifyOtp(input)
        : await this.port.verifyPhoneOtp(
          input.phoneNumber,
          input.code,
          input.role,
          input.role === 'client' && isDifferentPhone(input.session?.phoneNumber, input.phoneNumber),
        );
    } catch (error) {
      throw serviceError(error);
    }
    if (identity.role !== input.role) {
      await this.port.signOut();
      throw new PhoneAuthError(
        'account_role_mismatch',
        `This phone number belongs to a ${identity.role} account.`,
      );
    }
    return sessionFromSupabase(identity);
  }
}
