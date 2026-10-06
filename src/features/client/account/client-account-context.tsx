import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { BookingAddress } from '@/application/booking/booking-contracts';
import type { ClientAccountController } from '@/application/client-account/client-account-controller';
import type {
  ClientAccount,
  ClientOnboardingDraft,
} from '@/application/client-account/client-account-contracts';
import { useAuthSession } from '@/features/auth/session-context';
import { useClientLanguage } from '@/localization/client-language-context';

interface ClientAccountContextValue {
  account: ClientAccount | null;
  draft: ClientOnboardingDraft;
  loadStatus: 'loading' | 'ready' | 'error';
  retryLoad: () => Promise<void>;
  updateDraft: (changes: Partial<ClientOnboardingDraft>) => void;
  updateProfile: (changes: Partial<ClientAccount['profile']>) => Promise<void>;
  completeOnboarding: (address?: Omit<BookingAddress, 'id' | 'fee'>) => Promise<void>;
  addAddress: (address: Omit<BookingAddress, 'id' | 'fee'>) => Promise<string>;
  updateAddress: (
    addressId: string,
    address: Omit<BookingAddress, 'id' | 'fee'>,
  ) => Promise<void>;
  removeAddress: (addressId: string) => Promise<void>;
  setDefaultAddress: (addressId: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
}

interface ClientAccountProviderProps extends PropsWithChildren {
  controller: ClientAccountController;
}

const ClientAccountContext = createContext<ClientAccountContextValue | null>(null);

export function ClientAccountProvider({
  children,
  controller,
}: ClientAccountProviderProps) {
  const { session } = useAuthSession();
  const { language, setLanguage } = useClientLanguage();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    controller.setLanguage(language);
  }, [controller, language]);

  useEffect(() => {
    void controller.setSession(session);
  }, [controller, session]);

  useEffect(() => {
    if (snapshot.language !== language) setLanguage(snapshot.language);
  }, [language, setLanguage, snapshot.language]);

  const updateDraft = useCallback((changes: Partial<ClientOnboardingDraft>) => {
    controller.updateDraft(changes);
  }, [controller]);

  const updateProfile = useCallback(
    (changes: Partial<ClientAccount['profile']>) => controller.updateProfile(changes),
    [controller],
  );

  const completeOnboarding = useCallback(
    (address?: Omit<BookingAddress, 'id' | 'fee'>) => controller.completeOnboarding(address),
    [controller],
  );

  const addAddress = useCallback(
    (address: Omit<BookingAddress, 'id' | 'fee'>) => controller.addAddress(address),
    [controller],
  );

  const updateAddress = useCallback((
    addressId: string,
    address: Omit<BookingAddress, 'id' | 'fee'>,
  ) => controller.updateAddress(addressId, address), [controller]);

  const removeAddress = useCallback(
    (addressId: string) => controller.removeAddress(addressId),
    [controller],
  );

  const setDefaultAddress = useCallback(
    (addressId: string) => controller.setDefaultAddress(addressId),
    [controller],
  );

  const deleteAccount = useCallback(
    () => controller.deleteAccount(),
    [controller],
  );

  const value = useMemo<ClientAccountContextValue>(() => ({
    account: snapshot.account,
    draft: snapshot.draft,
    loadStatus: snapshot.loadStatus,
    retryLoad: () => controller.retryLoad(),
    updateDraft,
    updateProfile,
    completeOnboarding,
    addAddress,
    updateAddress,
    removeAddress,
    setDefaultAddress,
    deleteAccount,
  }), [
    controller,
    addAddress,
    completeOnboarding,
    deleteAccount,
    removeAddress,
    setDefaultAddress,
    snapshot.account,
    snapshot.draft,
    snapshot.loadStatus,
    updateAddress,
    updateDraft,
    updateProfile,
  ]);

  return (
    <ClientAccountContext.Provider value={value}>
      {children}
    </ClientAccountContext.Provider>
  );
}

export function useClientAccount(): ClientAccountContextValue {
  const value = useContext(ClientAccountContext);
  if (!value) throw new Error('useClientAccount must be used inside ClientAccountProvider.');
  return value;
}
