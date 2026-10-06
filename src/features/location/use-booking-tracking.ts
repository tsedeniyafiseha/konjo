import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { ApiBookingTracking } from '../../../shared/api-contracts';
import type { ClientBooking } from '@/application/client-data/client-data-contracts';
import { liveUpdatesGateway } from '@/bootstrap/client-composition-root';
import { useAuthSession } from '@/features/auth/session-context';
import { apiRequest } from '@/services/api-client';

/** Realtime invalidates the authorized API projection; polling covers reconnects. */
export function useBookingTracking(booking: ClientBooking | undefined): ApiBookingTracking | null {
  const { session } = useAuthSession();
  const bookingId = booking?.id ?? null;
  const live = booking?.status === 'on_the_way' || booking?.status === 'in_progress';
  const token = session?.source === 'api' ? session.accessToken ?? null : null;
  const [remote, setRemote] = useState<{ bookingId: string; point: ApiBookingTracking } | null>(null);
  useEffect(() => {
    if (!bookingId || !live || !token) return;
    let cancelled = false;
    let loading = false;
    const poll = async () => {
      if (loading || cancelled) return;
      loading = true;
      try {
        const { tracking } = await apiRequest<{ tracking: ApiBookingTracking | null }>(
          `/v1/bookings/${encodeURIComponent(bookingId)}/tracking`, { token });
        if (!cancelled && tracking) setRemote((current) => !current || current.bookingId !== bookingId ||
          Date.parse(tracking.recordedAt) >= Date.parse(current.point.recordedAt) ? { bookingId, point: tracking } : current);
      } catch { /* Preserve the last point; its timestamp makes staleness visible. */ }
      finally { loading = false; }
    };
    void poll();
    const interval = setInterval(() => { if (AppState.currentState === 'active') void poll(); }, 10_000);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void poll(); });
    const unsubscribe = liveUpdatesGateway.subscribe('booking_tracking', 'booking_id', bookingId, () => { void poll(); });
    return () => { cancelled = true; clearInterval(interval); appState.remove(); unsubscribe(); };
  }, [bookingId, live, token]);
  if (!live) return null;
  const embedded = booking?.tracking ?? null;
  const streamed = remote?.bookingId === bookingId ? remote.point : null;
  if (!embedded) return streamed;
  if (!streamed) return embedded;
  return Date.parse(streamed.recordedAt) >= Date.parse(embedded.recordedAt) ? streamed : embedded;
}
