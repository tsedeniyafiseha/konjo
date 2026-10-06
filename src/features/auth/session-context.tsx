import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { AuthSession, SessionController, SessionStatus } from '@/application/auth/session-controller';
import { unregisterPushNotifications } from '@/features/notifications/push-registration';
import { liveLocationReporter } from '@/features/location/live-location-reporter';

interface SessionContextValue {
  session: AuthSession | null;
  status: SessionStatus;
  completeSignIn: (session: AuthSession) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface SessionProviderProps extends PropsWithChildren {
  controller: SessionController;
}

export function SessionProvider({ children, controller }: SessionProviderProps) {
  const { session, status } = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    controller.activate();
    void controller.restore();
    return () => controller.deactivate();
  }, [controller]);

  // Location sharing is tied to the signed-in professional: any other session
  // state (signed out, expired, a client, another professional) stops it.
  useEffect(() => {
    if (status === 'authenticated') void liveLocationReporter.syncSession(session?.role === 'professional' ? session.userId : null);
    else if (status === 'unauthenticated') void liveLocationReporter.syncSession(null);
  }, [session?.role, session?.userId, status]);

  const completeSignIn = useCallback(async (nextSession: AuthSession) => {
    await controller.completeSignIn(nextSession);
  }, [controller]);

  const signOut = useCallback(async () => {
    await liveLocationReporter.stop();
    try {
      if (session?.accessToken) await unregisterPushNotifications(session.userId, session.accessToken);
    } finally {
      await controller.signOut();
    }
  }, [controller, session]);

  const value = useMemo(
    () => ({ session, status, completeSignIn, signOut }),
    [completeSignIn, session, signOut, status],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useAuthSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useAuthSession must be used inside SessionProvider.');
  return value;
}
