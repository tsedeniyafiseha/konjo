import type { AuthSession } from '@/application/auth/session-controller';
import {
  ClientAuthError,
  type ClientAuthenticationGateway,
} from '@/application/auth/client-auth-contracts';
import type { ApiPasswordResetRequest, AuthApiResponse } from '../../../shared/api-contracts';
import { apiBaseUrl, ApiClientError, apiRequest } from '@/services/api-client';

export { ClientAuthError } from '@/application/auth/client-auth-contracts';
export type { EmailCredentials, EmailRegistration } from '@/application/auth/client-auth-contracts';

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const validEmail = (email: string) => /^\S+@\S+\.\S+$/.test(email.trim());

function sessionFromApi(response: AuthApiResponse, method: AuthSession['authMethod']): AuthSession {
  return {
    userId: response.user.id,
    expiresAt: response.session.expiresAt,
    source: 'api',
    role: response.user.role,
    authMethod: method,
    email: response.user.email ?? undefined,
    phoneNumber: response.user.phoneNumber ?? undefined,
    displayName: response.user.fullName,
    accessToken: response.session.token,
  };
}

function toClientAuthError(error: unknown): ClientAuthError {
  if (error instanceof ApiClientError) {
    const code = error.status >= 500 || error.status === 0 ? 'service_unavailable' : 'invalid_input';
    return new ClientAuthError(code, error.message);
  }
  return new ClientAuthError('service_unavailable', 'We could not connect to Konjo. Please try again.');
}

function sessionFor(email: string, method: AuthSession['authMethod'], displayName?: string): AuthSession {
  const normalizedEmail = email.trim().toLowerCase();
  let hash = 0;
  for (const character of normalizedEmail) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return {
    userId: `development-client-${Math.abs(hash)}`,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    source: 'development',
    role: 'client',
    authMethod: method,
    email: normalizedEmail,
    displayName,
  };
}

function sessionForPhone(phoneNumber: string): AuthSession {
  const normalizedPhone = phoneNumber.trim();
  let hash = 0;
  for (const character of normalizedPhone) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return {
    userId: `development-client-${Math.abs(hash)}`,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    source: 'development',
    role: 'client',
    authMethod: 'email_password',
    phoneNumber: normalizedPhone,
  };
}

export const developmentClientAuthGateway: ClientAuthenticationGateway = {
  googleSignInAvailable: true,
  async registerWithEmail({ email, password, fullName }) {
    await wait(550);
    if (!validEmail(email) || password.length < 10 || fullName.trim().length < 2) {
      throw new ClientAuthError('invalid_input', 'Check your name, email, and password, then try again.');
    }
    return sessionFor(email, 'email_password', fullName.trim());
  },
  async confirmEmail() {
    throw new ClientAuthError('invalid_input', 'Email confirmation is not required in development mode.');
  },
  async resendEmailConfirmation() {
    throw new ClientAuthError('invalid_input', 'Email confirmation is not required in development mode.');
  },
  async signInWithEmail({ email, password }) {
    await wait(500);
    if (!validEmail(email) || password.length < 10) {
      throw new ClientAuthError('invalid_input', 'The email or password is not valid.');
    }
    return sessionFor(email, 'email_password');
  },
  async signInWithPhone({ phoneNumber, password }) {
    await wait(500);
    if (!/^\+251[79]\d{8}$/.test(phoneNumber) || password.length < 10) {
      throw new ClientAuthError('invalid_input', 'The phone number or password is not valid.');
    }
    return sessionForPhone(phoneNumber);
  },
  async updatePassword(password) {
    await wait(350);
    if (password.length < 10) {
      throw new ClientAuthError('invalid_input', 'Use at least 10 characters for your password.');
    }
  },
  async signInWithGoogle() {
    await wait(500);
    return sessionFor('google.preview@konjo.app', 'google');
  },
  async requestPasswordReset(email) {
    await wait(450);
    if (!validEmail(email)) throw new ClientAuthError('invalid_input', 'Enter a valid email address.');
    return { accepted: true, developmentToken: 'development-reset-token' };
  },
  async preparePasswordReset(token) {
    await wait(250);
    if (token !== 'development-reset-token') {
      throw new ClientAuthError('invalid_input', 'The reset token is not valid.');
    }
  },
  async confirmPasswordReset(token, password) {
    await wait(450);
    if (token !== 'development-reset-token' || password.length < 10) {
      throw new ClientAuthError('invalid_input', 'The reset token or password is not valid.');
    }
  },
};

export const apiClientAuthGateway: ClientAuthenticationGateway = {
  googleSignInAvailable: false,
  async registerWithEmail({ email, password, fullName }) {
    try {
      const response = await apiRequest<AuthApiResponse>('/v1/auth/register/client', {
        method: 'POST',
        body: { email, password, fullName },
      });
      return sessionFromApi(response, 'email_password');
    } catch (error) {
      throw toClientAuthError(error);
    }
  },
  async confirmEmail() {
    throw new ClientAuthError('invalid_input', 'This confirmation link is not used by the API authentication mode.');
  },
  async resendEmailConfirmation() {
    throw new ClientAuthError('invalid_input', 'Email confirmation is not used by the API authentication mode.');
  },
  async signInWithEmail({ email, password }) {
    try {
      const response = await apiRequest<AuthApiResponse>('/v1/auth/login/client', {
        method: 'POST',
        body: { email, password },
      });
      return sessionFromApi(response, 'email_password');
    } catch (error) {
      throw toClientAuthError(error);
    }
  },
  async signInWithPhone() {
    throw new ClientAuthError(
      'service_unavailable',
      'Phone and password sign-in requires the Supabase authentication provider.',
    );
  },
  async updatePassword() {
    throw new ClientAuthError(
      'service_unavailable',
      'SMS password recovery requires the Supabase authentication provider.',
    );
  },
  async signInWithGoogle() {
    throw new ClientAuthError('service_unavailable', 'Google sign-in needs its provider credentials before it can be connected.');
  },
  async requestPasswordReset(email) {
    try {
      return await apiRequest<ApiPasswordResetRequest>('/v1/auth/password-reset/request', {
        method: 'POST',
        body: { email },
      });
    } catch (error) {
      throw toClientAuthError(error);
    }
  },
  async preparePasswordReset() {
    // The local API consumes its opaque token together with the new password.
  },
  async confirmPasswordReset(token, password) {
    try {
      await apiRequest('/v1/auth/password-reset/confirm', {
        method: 'POST',
        body: { token, password },
      });
    } catch (error) {
      throw toClientAuthError(error);
    }
  },
};

export const unavailableClientAuthGateway: ClientAuthenticationGateway = {
  googleSignInAvailable: false,
  async registerWithEmail() { throw new ClientAuthError('service_unavailable', 'Email registration is temporarily unavailable.'); },
  async confirmEmail() { throw new ClientAuthError('service_unavailable', 'Email confirmation is temporarily unavailable.'); },
  async resendEmailConfirmation() { throw new ClientAuthError('service_unavailable', 'Email confirmation is temporarily unavailable.'); },
  async signInWithEmail() { throw new ClientAuthError('service_unavailable', 'Email sign-in is temporarily unavailable.'); },
  async signInWithPhone() { throw new ClientAuthError('service_unavailable', 'Phone sign-in is temporarily unavailable.'); },
  async updatePassword() { throw new ClientAuthError('service_unavailable', 'Password updates are temporarily unavailable.'); },
  async signInWithGoogle() { throw new ClientAuthError('service_unavailable', 'Google sign-in has not been configured.'); },
  async requestPasswordReset() { throw new ClientAuthError('service_unavailable', 'Password recovery is temporarily unavailable.'); },
  async preparePasswordReset() { throw new ClientAuthError('service_unavailable', 'Password recovery is temporarily unavailable.'); },
  async confirmPasswordReset() { throw new ClientAuthError('service_unavailable', 'Password recovery is temporarily unavailable.'); },
};

// Production must exchange email credentials or a Google authorization code with the Konjo backend.
// Passwords and Google tokens must never be persisted by the client.
export const clientAuthService: ClientAuthenticationGateway = apiBaseUrl
  ? apiClientAuthGateway
  : __DEV__ ? developmentClientAuthGateway : unavailableClientAuthGateway;
