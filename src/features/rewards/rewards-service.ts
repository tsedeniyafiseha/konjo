import type { ApiClientRewards } from '../../../shared/api-contracts';
import { apiRequest } from '@/services/api-client';

/** The client's rewards standing: welcome discount, loyalty coupons and progress to the next one. */
export async function fetchClientRewards(accessToken: string, signal?: AbortSignal): Promise<ApiClientRewards> {
  const response = await apiRequest<{ rewards: ApiClientRewards }>('/v1/me/rewards', { token: accessToken, signal });
  return response.rewards;
}
