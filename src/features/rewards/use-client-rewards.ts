import { useEffect, useState } from 'react';

import type { ApiClientRewards, ApiRewardReason } from '../../../shared/api-contracts';
import { useAuthSession } from '@/features/auth/session-context';
import { useClientData } from '@/features/client/client-data-context';
import { fetchClientRewards } from './rewards-service';

export interface RewardDiscount {
  amount: number;
  reason: ApiRewardReason;
  percent: number;
}

/** The reward the next booking gets at this service price, or null. */
export function rewardDiscountFor(rewards: ApiClientRewards | null, servicePrice: number): RewardDiscount | null {
  if (!rewards?.offer) return null;
  return {
    amount: Math.round(servicePrice * rewards.offer.rateBps / 10_000),
    reason: rewards.offer.reason,
    percent: Math.round(rewards.offer.rateBps / 100),
  };
}

/**
 * Rewards for the signed-in client. Reloaded whenever a booking is added or
 * changes status, since that is what earns or spends a reward.
 */
export function useClientRewards(): { rewards: ApiClientRewards | null } {
  const { session } = useAuthSession();
  const { bookings } = useClientData();
  const token = session?.source === 'api' ? session.accessToken : undefined;
  const bookingsKey = bookings.map((booking) => `${booking.id}:${booking.status}`).join(',');
  const [loaded, setLoaded] = useState<{ token: string; rewards: ApiClientRewards } | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    fetchClientRewards(token, controller.signal)
      .then((rewards) => { if (!controller.signal.aborted) setLoaded({ token, rewards }); })
      .catch(() => { /* The card simply stays hidden until the next refresh. */ });
    return () => controller.abort();
  }, [token, bookingsKey]);

  return { rewards: token && loaded?.token === token ? loaded.rewards : null };
}
