import type { ApiClientIdentityStatus } from '../../../shared/api-contracts';
import { apiRequest } from '@/services/api-client';

export const clientIdentityService = {
  async getStatus(token: string): Promise<ApiClientIdentityStatus> {
    const response = await apiRequest<{ identity: ApiClientIdentityStatus }>('/v1/client/identity', { token });
    return response.identity;
  },

  async verifyFayda(identifier: string, token: string): Promise<ApiClientIdentityStatus> {
    const response = await apiRequest<{ identity: ApiClientIdentityStatus }>('/v1/client/fayda/verify', {
      method: 'POST',
      token,
      body: { identifier },
    });
    return response.identity;
  },
};
