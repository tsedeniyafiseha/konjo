import type { AdminAuthenticationGateway } from '@/application/auth/admin-auth-contracts';
import type { AuthSession } from '@/application/auth/session-controller';
import type { AuthApiResponse } from '../../../shared/api-contracts';
import { apiRequest } from '@/services/api-client';

function sessionFromResponse(response: AuthApiResponse): AuthSession {
  if (response.user.role !== 'admin') throw new Error('The account is not an administrator.');
  return {
    userId: response.user.id,
    expiresAt: response.session.expiresAt,
    source: 'api',
    role: 'admin',
    authMethod: 'email_password',
    email: response.user.email ?? undefined,
    displayName: response.user.fullName,
    accessToken: response.session.token,
  };
}

export const apiAdminAuthenticationGateway: AdminAuthenticationGateway = {
  async signInWithEmail(input) {
    const response = await apiRequest<AuthApiResponse>('/v1/auth/login/admin', {
      method: 'POST',
      body: { email: input.email, password: input.password },
    });
    return sessionFromResponse(response);
  },
};
