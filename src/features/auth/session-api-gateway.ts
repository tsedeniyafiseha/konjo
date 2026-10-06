import type { SessionRevocationGateway } from '@/application/auth/session-controller';
import { apiRequest } from '@/services/api-client';

export const apiSessionRevocationGateway: SessionRevocationGateway = {
  async revoke(session) {
    if (session.source !== 'api' || !session.accessToken) return;
    await apiRequest('/v1/auth/logout', {
      method: 'POST',
      token: session.accessToken,
    });
  },
};
