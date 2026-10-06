import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import type { BookingDraftController } from '@/application/booking/booking-draft-controller';
import type {
  BookingDraft,
  BookingPaymentMethodId,
  BookingReceipt,
} from '@/application/booking/booking-contracts';
import { useClientAccount } from '@/features/client/account/client-account-context';
import { useAuthSession } from '@/features/auth/session-context';

interface BookingContextValue {
  draft: BookingDraft | null;
  receipt: BookingReceipt | null;
  ready: boolean;
  startBooking: (professionalId: string, serviceIndex: number) => Promise<void>;
  selectDate: (dateIso: string) => void;
  selectTime: (time: string) => void;
  selectAddress: (addressId: string) => void;
  selectPaymentMethod: (paymentMethod: BookingPaymentMethodId) => void;
  setReceipt: (receipt: BookingReceipt) => void;
  clearBooking: () => void;
}

const BookingContext = createContext<BookingContextValue | null>(null);

interface BookingProviderProps {
  children: ReactNode;
  controller: BookingDraftController;
}

export function BookingProvider({ children, controller }: BookingProviderProps) {
  const { account } = useClientAccount();
  const { session } = useAuthSession();
  const { draft, receipt } = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const userId = session?.userId ?? null;
  const [readyUserId, setReadyUserId] = useState<string | null>(null);

  // No reset needed when the user changes: `ready` compares readyUserId with the
  // current user, so a stale value from the previous user is never treated as ready.
  useEffect(() => {
    let current = true;
    void controller.setUser(userId).then(() => {
      if (current) setReadyUserId(userId);
    });
    return () => { current = false; };
  }, [controller, userId]);

  const ready = userId !== null && readyUserId === userId;

  const startBooking = useCallback((professionalId: string, serviceIndex: number) => {
    return controller.startBooking(
      professionalId,
      serviceIndex,
      account?.defaultAddressId ?? null,
    );
  }, [account?.defaultAddressId, controller]);

  const selectDate = useCallback((dateIso: string) => {
    void controller.selectDate(dateIso);
  }, [controller]);
  const selectTime = useCallback((time: string) => {
    void controller.selectTime(time);
  }, [controller]);
  const selectAddress = useCallback(
    (addressId: string) => { void controller.selectAddress(addressId); },
    [controller],
  );

  const selectPaymentMethod = useCallback(
    (paymentMethod: BookingPaymentMethodId) => { void controller.selectPaymentMethod(paymentMethod); },
    [controller],
  );
  const setReceipt = useCallback((nextReceipt: BookingReceipt) => {
    controller.setReceipt(nextReceipt);
  }, [controller]);
  const clearBooking = useCallback(() => {
    void controller.clearBooking();
  }, [controller]);

  const value = useMemo<BookingContextValue>(
    () => ({
      draft,
      receipt,
      ready,
      startBooking,
      selectDate,
      selectTime,
      selectAddress,
      selectPaymentMethod,
      setReceipt,
      clearBooking,
    }),
    [
      clearBooking,
      draft,
      receipt,
      ready,
      selectAddress,
      selectDate,
      selectPaymentMethod,
      selectTime,
      setReceipt,
      startBooking,
    ],
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking() {
  const value = useContext(BookingContext);

  if (!value) throw new Error('useBooking must be used inside BookingProvider.');
  return value;
}
