import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { ProfessionalRegistrationController } from '@/application/professional-registration/professional-registration-controller';
import type {
  ProfessionalApplication,
  ProfessionalAppLanguage,
  ProfessionalProfileDraft,
  ProfessionalRegistrationDraft,
  ProfessionalServiceDraft,
} from '@/application/professional-registration/professional-registration-contracts';
import { useAuthSession } from '@/features/auth/session-context';

type RegistrationLoadStatus = 'loading' | 'ready' | 'error';

interface ProfessionalRegistrationContextValue {
  application: ProfessionalApplication | null;
  draft: ProfessionalRegistrationDraft;
  loadStatus: RegistrationLoadStatus;
  syncStatus: 'saved' | 'saving' | 'error';
  syncError: string | null;
  syncDraft: () => Promise<void>;
  loadSavedDraft: () => Promise<void>;
  retryLoad: () => Promise<void>;
  refreshApplication: () => Promise<void>;
  updateProfile: (changes: Partial<ProfessionalProfileDraft>) => void;
  setPreferredLanguage: (language: ProfessionalAppLanguage) => void;
  addService: () => void;
  updateService: (id: string, changes: Partial<ProfessionalServiceDraft>) => void;
  removeService: (id: string) => void;
  toggleWorkingDay: (day: string) => void;
  cycleWorkingHours: (day: string) => void;
  toggleTravelZone: (id: string) => void;
  toggleSameDayBookings: () => void;
  setTermsAccepted: (accepted: boolean) => void;
  submit: () => Promise<void>;
  saveApprovedProfile: (draft: ProfessionalRegistrationDraft) => Promise<void>;
  listZones: () => Promise<readonly { id: string; label: string }[]>;
}

interface ProfessionalRegistrationProviderProps extends PropsWithChildren {
  controller: ProfessionalRegistrationController;
}

const RegistrationContext = createContext<ProfessionalRegistrationContextValue | null>(null);

export function ProfessionalRegistrationProvider({
  children,
  controller,
}: ProfessionalRegistrationProviderProps) {
  const { session } = useAuthSession();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.setSession(session);
  }, [controller, session]);

  useEffect(() => () => controller.deactivate(), [controller]);

  const value = useMemo<ProfessionalRegistrationContextValue>(() => ({
    application: snapshot.application,
    draft: snapshot.draft,
    loadStatus: snapshot.loadStatus,
    syncStatus: snapshot.syncStatus,
    syncError: snapshot.syncError,
    syncDraft: () => controller.syncDraft(),
    loadSavedDraft: () => controller.loadSavedDraft(),
    retryLoad: () => controller.retryLoad(),
    refreshApplication: () => controller.refreshApplication(),
    updateProfile: (changes) => controller.updateProfile(changes),
    setPreferredLanguage: (language) => controller.setPreferredLanguage(language),
    addService: () => controller.addService(),
    updateService: (id, changes) => controller.updateService(id, changes),
    removeService: (id) => controller.removeService(id),
    toggleWorkingDay: (day) => controller.toggleWorkingDay(day),
    cycleWorkingHours: (day) => controller.cycleWorkingHours(day),
    toggleTravelZone: (id) => controller.toggleTravelZone(id),
    toggleSameDayBookings: () => controller.toggleSameDayBookings(),
    setTermsAccepted: (accepted) => controller.setTermsAccepted(accepted),
    submit: () => controller.submit(),
    saveApprovedProfile: (draft) => controller.saveApprovedProfile(draft),
    listZones: () => controller.listZones(),
  }), [controller, snapshot]);

  return <RegistrationContext.Provider value={value}>{children}</RegistrationContext.Provider>;
}

export function useProfessionalRegistration(): ProfessionalRegistrationContextValue {
  const value = useContext(RegistrationContext);
  if (!value) throw new Error('useProfessionalRegistration must be used inside ProfessionalRegistrationProvider.');
  return value;
}
