import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { ApiPayoutBatch } from '../../../shared/api-contracts';
import { liveUpdatesGateway } from '@/bootstrap/client-composition-root';
import { useAuthSession } from '@/features/auth/session-context';
import { professionalDashboardService } from '@/features/professional/professional-dashboard-service';

/**
 * Loads the signed-in professional's payout history from the API; empty outside
 * API sessions. Stays in step with the admin dashboard: it reloads when Konjo
 * prepares or marks a payout paid (Realtime on payout_batches) and whenever the
 * app returns to the foreground.
 */
export function useProfessionalPayouts(): { payouts: readonly ApiPayoutBatch[]; loading: boolean; error: string | null } {
  const { session } = useAuthSession();
  const token = session?.source === 'api' ? session.accessToken ?? null : null;
  const userId = session?.userId ?? null;
  const [state, setState] = useState<{ token: string | null; payouts: readonly ApiPayoutBatch[]; loading: boolean; error: string | null }>({
    token: null, payouts: [], loading: false, error: null,
  });

  const load = useCallback(async (activeToken: string, isActive: () => boolean) => {
    try {
      const payouts = await professionalDashboardService.listPayouts(activeToken);
      if (isActive()) setState({ token: activeToken, payouts, loading: false, error: null });
    } catch (error: unknown) {
      if (isActive()) {
        setState((current) => ({
          token: activeToken,
          payouts: current.token === activeToken ? current.payouts : [],
          loading: false,
          error: error instanceof Error ? error.message : 'Unable to load payouts.',
        }));
      }
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const isActive = () => active;
    Promise.resolve().then(() => { if (active) setState((current) => ({ ...current, token, loading: true, error: null })); });
    void load(token, isActive);
    const reload = () => { void load(token, isActive); };
    const payouts = userId ? liveUpdatesGateway.subscribe('payout_batches', 'professional_id', userId, reload) : () => {};
    const appState = AppState.addEventListener('change', (value) => { if (value === 'active') reload(); });
    return () => { active = false; payouts(); appState.remove(); };
  }, [load, token, userId]);

  return token && state.token === token ? state : { payouts: [], loading: Boolean(token), error: null };
}
