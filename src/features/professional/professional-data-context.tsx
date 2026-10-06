import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { ProfessionalCheckoutExtras, ProfessionalDataController } from '@/application/professional-data/professional-data-controller';
import type {
  ProfessionalJob,
  ProfessionalService,
  TravelZone,
  WorkingDay,
} from '@/application/professional-data/professional-data-contracts';
import { useAuthSession } from '@/features/auth/session-context';
import { useProfessionalRegistration } from '@/features/professional/registration/professional-registration-context';
import { resolveProfessionalLanguage } from '@/localization/use-professional-copy';
import { AppState } from 'react-native';
import { liveUpdatesGateway } from '@/bootstrap/client-composition-root';

export type {
  ProfessionalJob,
  ProfessionalJobStatus,
  ProfessionalService,
  TravelZone,
  WorkingDay,
} from '@/application/professional-data/professional-data-contracts';

interface ProfessionalDataContextValue {
  activeJob: ProfessionalJob | null;
  upcomingJobs: readonly ProfessionalJob[];
  /** Finished bookings from the last 30 days, newest first, for history and payment status. */
  recentJobs: readonly ProfessionalJob[];
  dashboardLoaded: boolean;
  available: boolean;
  completedCount: number;
  weekEarnings: number;
  rating: number;
  reviewCount: number;
  /** Maximum travel fee (ETB) the professional may set when accepting a booking. */
  travelFeeCap: number;
  sessionStartedAt: number | null;
  services: readonly ProfessionalService[];
  workingDays: readonly WorkingDay[];
  travelZones: readonly TravelZone[];
  sameDayBookings: boolean;
  toast: string | null;
  toggleAvailable: () => void;
  acceptJob: (jobId?: string, travelFee?: number) => void;
  declineJob: (jobId?: string) => void;
  startTravel: (jobId?: string) => void;
  arrive: (jobId?: string) => void;
  checkIn: (jobId?: string) => void;
  reportClientNoShow: (jobId?: string) => void;
  completeJob: (jobId?: string, extras?: ProfessionalCheckoutExtras) => void;
  approveReschedule: (jobId?: string) => void;
  declineReschedule: (jobId?: string) => void;
  removeService: (serviceId: string) => void;
  addService: () => void;
  updateServicePrice: (serviceId: string, price: number) => void;
  toggleWorkingDay: (day: string) => void;
  toggleTravelZone: (zoneId: string) => void;
  toggleSameDayBookings: () => void;
  showToast: (message: string) => void;
}

interface ProfessionalDataProviderProps {
  children: ReactNode;
  controller: ProfessionalDataController;
}

const ProfessionalDataContext = createContext<ProfessionalDataContextValue | null>(null);

export function ProfessionalDataProvider({ children, controller }: ProfessionalDataProviderProps) {
  const { session } = useAuthSession();
  const { application, draft } = useProfessionalRegistration();
  const language = resolveProfessionalLanguage(application, draft);
  useEffect(() => { controller.setLanguage(language); }, [controller, language]);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.activate(session, application);
    return () => controller.deactivate();
  }, [application, controller, session]);

  useEffect(() => {
    if (!session?.userId) return;
    const refresh = () => { void controller.refresh(); };
    const bookings = liveUpdatesGateway.subscribe('bookings', 'professional_id', session.userId, refresh);
    const notifications = liveUpdatesGateway.subscribe('notification_outbox', 'user_id', session.userId, refresh);
    const state = AppState.addEventListener('change', (value) => { if (value === 'active') refresh(); });
    return () => { bookings(); notifications(); state.remove(); };
  }, [controller, session?.userId]);

  const value = useMemo<ProfessionalDataContextValue>(() => ({
    activeJob: snapshot.jobs[0] ?? null,
    upcomingJobs: snapshot.jobs.slice(1),
    recentJobs: snapshot.recentJobs,
    dashboardLoaded: snapshot.dashboardLoaded,
    available: snapshot.available,
    completedCount: snapshot.completedCount,
    weekEarnings: snapshot.weekEarnings,
    rating: snapshot.rating,
    reviewCount: snapshot.reviewCount,
    travelFeeCap: snapshot.travelFeeCap,
    sessionStartedAt: snapshot.sessionStartedAt,
    services: snapshot.services,
    workingDays: snapshot.workingDays,
    travelZones: snapshot.travelZones,
    sameDayBookings: snapshot.sameDayBookings,
    toast: snapshot.toast,
    toggleAvailable: () => { void controller.toggleAvailable(); },
    acceptJob: (jobId, travelFee) => { void controller.acceptJob(jobId, travelFee); },
    declineJob: (jobId) => { void controller.declineJob(jobId); },
    startTravel: (jobId) => { void controller.startTravel(jobId); },
    arrive: (jobId) => { void controller.arrive(jobId); },
    checkIn: (jobId) => { void controller.checkIn(jobId); },
    reportClientNoShow: (jobId) => { void controller.reportClientNoShow(jobId); },
    completeJob: (jobId, extras) => { void controller.completeJob(jobId, extras); },
    approveReschedule: (jobId) => { void controller.approveReschedule(jobId); },
    declineReschedule: (jobId) => { void controller.declineReschedule(jobId); },
    removeService: (serviceId) => { void controller.removeService(serviceId); },
    addService: () => { void controller.addService(); },
    updateServicePrice: (serviceId, price) => { void controller.updateServicePrice(serviceId, price); },
    toggleWorkingDay: (day) => { void controller.toggleWorkingDay(day); },
    toggleTravelZone: (zoneId) => { void controller.toggleTravelZone(zoneId); },
    toggleSameDayBookings: () => { void controller.toggleSameDayBookings(); },
    showToast: (message) => controller.showToast(message),
  }), [controller, snapshot]);

  return <ProfessionalDataContext.Provider value={value}>{children}</ProfessionalDataContext.Provider>;
}

export function useProfessionalData(): ProfessionalDataContextValue {
  const value = useContext(ProfessionalDataContext);
  if (!value) throw new Error('useProfessionalData must be used inside ProfessionalDataProvider.');
  return value;
}
