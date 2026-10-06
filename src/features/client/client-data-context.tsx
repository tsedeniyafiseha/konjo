import type { ApiPaymentIntent } from '../../../shared/api-contracts';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { ClientDataController } from '@/application/client-data/client-data-controller';
import type {
  BookingRatingInput,
  ClientBooking,
  ClientBookingStatus,
  NewClientBooking,
  NotificationPreferenceKey,
} from '@/application/client-data/client-data-contracts';
import { useAuthSession } from '@/features/auth/session-context';
import { AppState } from 'react-native';
import { liveUpdatesGateway } from '@/bootstrap/client-composition-root';

export type {
  BookingRatingInput,
  ClientBooking,
  ClientBookingStatus,
  NewClientBooking,
  NotificationPreferenceKey,
} from '@/application/client-data/client-data-contracts';

interface ClientDataContextValue {
  bookings: readonly ClientBooking[];
  favouriteIds: ReadonlySet<string>;
  notificationPreferences: Readonly<Record<NotificationPreferenceKey, boolean>>;
  addBooking: (booking: NewClientBooking) => void;
  cancelBooking: (bookingId: string) => Promise<void>;
  archiveBooking: (bookingId: string) => Promise<void>;
  rescheduleBooking: (bookingId: string, dateIso: string, time: string) => Promise<void>;
  initiatePayment: (bookingId: string) => Promise<ApiPaymentIntent>;
  verifyPayment: (bookingId: string) => Promise<'captured' | 'failed' | 'pending' | null>;
  updateBookingStatus: (bookingId: string, status: ClientBookingStatus) => void;
  rateBooking: (bookingId: string, input: BookingRatingInput) => Promise<void>;
  toggleFavourite: (professionalId: string) => Promise<void>;
  toggleNotificationPreference: (key: NotificationPreferenceKey) => Promise<void>;
}

interface ClientDataProviderProps {
  children: ReactNode;
  controller: ClientDataController;
}

const ClientDataContext = createContext<ClientDataContextValue | null>(null);

export function ClientDataProvider({ children, controller }: ClientDataProviderProps) {
  const { session } = useAuthSession();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.setSession(session);
    return () => controller.deactivate();
  }, [controller, session]);

  useEffect(() => {
    if (!session?.userId) return;
    const refresh = () => { void controller.refresh(); };
    const unsubscribe = liveUpdatesGateway.subscribe('bookings', 'client_id', session.userId, refresh);
    const payments = liveUpdatesGateway.subscribe('payment_intents', 'client_id', session.userId, refresh);
    const state = AppState.addEventListener('change', (value) => { if (value === 'active') refresh(); });
    return () => { unsubscribe(); payments(); state.remove(); };
  }, [controller, session?.userId]);

  const addBooking = useCallback(
    (booking: NewClientBooking) => controller.addBooking(booking),
    [controller],
  );
  const archiveBooking = useCallback(
    (bookingId: string) => controller.archiveBooking(bookingId),
    [controller],
  );
  const cancelBooking = useCallback(
    (bookingId: string) => controller.cancelBooking(bookingId),
    [controller],
  );
  const rescheduleBooking = useCallback(
    (bookingId: string, dateIso: string, time: string) => (
      controller.rescheduleBooking(bookingId, dateIso, time)
    ),
    [controller],
  );
  const verifyPayment = useCallback(
    (bookingId: string) => controller.verifyPayment(bookingId),
    [controller],
  );
  const initiatePayment = useCallback(
    (bookingId: string) => controller.initiatePayment(bookingId),
    [controller],
  );
  const updateBookingStatus = useCallback(
    (bookingId: string, status: ClientBookingStatus) => (
      controller.updateBookingStatus(bookingId, status)
    ),
    [controller],
  );
  const rateBooking = useCallback(
    (bookingId: string, input: BookingRatingInput) => controller.rateBooking(bookingId, input),
    [controller],
  );
  const toggleFavourite = useCallback(
    (professionalId: string) => controller.toggleFavourite(professionalId),
    [controller],
  );
  const toggleNotificationPreference = useCallback(
    (key: NotificationPreferenceKey) => controller.toggleNotificationPreference(key),
    [controller],
  );

  const value = useMemo<ClientDataContextValue>(() => ({
    bookings: snapshot.bookings,
    favouriteIds: snapshot.favouriteIds,
    notificationPreferences: snapshot.notificationPreferences,
    addBooking,
    cancelBooking,
    archiveBooking,
    rescheduleBooking,
    initiatePayment,
    verifyPayment,
    updateBookingStatus,
    rateBooking,
    toggleFavourite,
    toggleNotificationPreference,
  }), [
    addBooking,
    cancelBooking,
    archiveBooking,
    initiatePayment,
    verifyPayment,
    rateBooking,
    rescheduleBooking,
    snapshot.bookings,
    snapshot.favouriteIds,
    snapshot.notificationPreferences,
    toggleFavourite,
    toggleNotificationPreference,
    updateBookingStatus,
  ]);

  return <ClientDataContext.Provider value={value}>{children}</ClientDataContext.Provider>;
}

export function useClientData(): ClientDataContextValue {
  const value = useContext(ClientDataContext);
  if (!value) throw new Error('useClientData must be used inside ClientDataProvider.');
  return value;
}
