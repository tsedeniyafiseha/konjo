import type { ApiOtpChallenge, AuthApiResponse } from '../../../shared/api-contracts';
import type { AuthSession } from '../../application/auth/session-controller.ts';
import {
  PhoneAuthError,
  type PhoneAuthenticationGateway,
} from '../../application/auth/phone-auth-contracts.ts';
import { apiBaseUrl, ApiClientError, apiRequest } from '../../services/api-client.ts';

export { PhoneAuthError as AuthServiceError } from '../../application/auth/phone-auth-contracts.ts';
export type {
  AccountRole,
  OtpChallenge,
  PhoneAuthenticationGateway as AuthService,
  VerifyOtpInput,
} from '../../application/auth/phone-auth-contracts.ts';

const DEVELOPMENT_CODE = '2471';

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const developmentAuthService: PhoneAuthenticationGateway = {
  async requestOtp(phoneNumber) {
    await wait(450);

    return {
      id: `development-${Date.now()}`,
      phoneNumber,
      expiresAt: Date.now() + 5 * 60 * 1000,
      codeLength: 4,
      developmentCode: DEVELOPMENT_CODE,
    };
  },

  async verifyOtp({ code, role, phoneNumber, session }) {
    await wait(550);

    if (code !== DEVELOPMENT_CODE) {
      throw new PhoneAuthError('invalid_code', 'That verification code is not correct. Try again.');
    }

    return session && role === 'client' ? {
      ...session,
      phoneNumber,
      phoneVerified: true,
    } : {
      userId: `development-${role}`,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      source: 'development',
      role,
      authMethod: 'phone_otp',
      phoneNumber,
      phoneVerified: true,
    };
  },
};

function sessionFromApi(response: AuthApiResponse): AuthSession {
  return {
    userId: response.user.id,
    expiresAt: response.session.expiresAt,
    source: 'api',
    role: response.user.role,
    authMethod: 'phone_otp',
    email: response.user.email ?? undefined,
    phoneNumber: response.user.phoneNumber ?? undefined,
    displayName: response.user.fullName,
    accessToken: response.session.token,
  };
}

function toAuthServiceError(error: unknown): PhoneAuthError {
  if (error instanceof ApiClientError) {
    if (error.code === 'ACCOUNT_NOT_FOUND') return new PhoneAuthError('account_not_found', error.message);
    if (error.code === 'INVALID_OTP' || error.code === 'OTP_CHALLENGE_INVALID') {
      return new PhoneAuthError('invalid_code', error.message);
    }
    if (error.code === 'OTP_RATE_LIMITED') {
      return new PhoneAuthError('rate_limited', error.message);
    }
    return new PhoneAuthError('service_unavailable', error.message);
  }
  return new PhoneAuthError('service_unavailable', 'Phone verification is temporarily unavailable. Please try again later.');
}

const apiAuthService: PhoneAuthenticationGateway = {
  async requestOtp(phoneNumber, role, context) {
    try {
      const response = await apiRequest<{ challenge: ApiOtpChallenge }>('/v1/auth/otp/request', {
        method: 'POST',
        body: { phoneNumber, role },
        token: role === 'client' ? context?.session?.accessToken : undefined,
      });
      return { ...response.challenge, codeLength: 4 };
    } catch (error) {
      throw toAuthServiceError(error);
    }
  },
  async verifyOtp(input) {
    try {
      const response = await apiRequest<AuthApiResponse>('/v1/auth/otp/verify', {
        method: 'POST',
        body: {
          challengeId: input.challengeId,
          code: input.code,
          role: input.role,
          ...(input.shouldCreateUser !== undefined ? { shouldCreateUser: input.shouldCreateUser } : {}),
        },
        token: input.role === 'client' ? input.session?.accessToken : undefined,
      });
      return sessionFromApi(response);
    } catch (error) {
      throw toAuthServiceError(error);
    }
  },
};

const unavailableAuthService: PhoneAuthenticationGateway = {
  async requestOtp() {
    throw new PhoneAuthError(
      'service_unavailable',
      'Phone verification is temporarily unavailable. Please try again later.',
    );
  },
  async verifyOtp() {
    throw new PhoneAuthError(
      'service_unavailable',
      'Phone verification is temporarily unavailable. Please try again later.',
    );
  },
};

// This explicit development boundary is replaced by the production authentication adapter.
export const authService: PhoneAuthenticationGateway = apiBaseUrl
  ? apiAuthService
  : __DEV__ ? developmentAuthService : unavailableAuthService;
