import { AppState } from 'react-native';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { DiscoveryController } from '@/application/discovery/discovery-controller';
import type {
  Professional,
  ProfessionalAvailabilityInput,
  ServiceCategory,
  ProfessionalReview,
} from '@/application/discovery/discovery-contracts';
import { useAuthSession } from '@/features/auth/session-context';

interface DiscoveryContextValue {
  professionals: readonly Professional[];
  categories: readonly ServiceCategory[];
  loading: boolean;
  getProfessional: (professionalId: string | undefined) => Professional | undefined;
  getAvailableSlots: (input: ProfessionalAvailabilityInput) => Promise<readonly string[]>;
  loadPortfolio: (professionalId: string) => Promise<readonly string[]>;
  loadReviews: (professionalId: string) => Promise<readonly ProfessionalReview[]>;
  blockProfessional: (professionalId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

interface DiscoveryProviderProps extends PropsWithChildren {
  controller: DiscoveryController;
}

const DiscoveryContext = createContext<DiscoveryContextValue | null>(null);

export function DiscoveryProvider({ children, controller }: DiscoveryProviderProps) {
  const { session } = useAuthSession();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.setSession(session);
  }, [controller, session]);

  useEffect(() => {
    // Ratings and availability change while the app is in the background.
    const state = AppState.addEventListener('change', (value) => { if (value === 'active') void controller.refresh(); });
    return () => state.remove();
  }, [controller]);

  useEffect(() => {
    // Approvals and availability switches happen while the app is open, so the
    // catalog also refreshes on its own every couple of minutes.
    const interval = setInterval(() => { void controller.refresh(); }, 120_000);
    return () => clearInterval(interval);
  }, [controller]);

  const getProfessional = useCallback(
    (professionalId: string | undefined) => controller.getProfessional(professionalId),
    [controller],
  );

  const getAvailableSlots = useCallback(
    (input: ProfessionalAvailabilityInput) => controller.getAvailableSlots(input),
    [controller],
  );

  const loadReviews = useCallback(
    (professionalId: string) => controller.loadReviews(professionalId),
    [controller],
  );
  const loadPortfolio = useCallback(
    (professionalId: string) => controller.loadPortfolio(professionalId),
    [controller],
  );

  const refresh = useCallback(() => controller.refresh(), [controller]);
  const blockProfessional = useCallback(
    (professionalId: string) => controller.blockProfessional(professionalId),
    [controller],
  );

  const value = useMemo<DiscoveryContextValue>(() => ({
    professionals: snapshot.professionals,
    categories: snapshot.categories,
    loading: snapshot.loading,
    getProfessional,
    getAvailableSlots,
    loadPortfolio,
    loadReviews,
    blockProfessional,
    refresh,
  }), [
    getAvailableSlots,
    getProfessional,
    loadPortfolio,
    loadReviews,
    blockProfessional,
    refresh,
    snapshot.categories,
    snapshot.loading,
    snapshot.professionals,
  ]);

  return <DiscoveryContext.Provider value={value}>{children}</DiscoveryContext.Provider>;
}

export function useDiscovery(): DiscoveryContextValue {
  const value = useContext(DiscoveryContext);
  if (!value) throw new Error('useDiscovery must be used inside DiscoveryProvider.');
  return value;
}
