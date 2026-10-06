import { router } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';
import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import type { ApiNotificationRecord } from '../../../shared/api-contracts';
import { useAuthSession } from '@/features/auth/session-context';
import { liveUpdatesGateway } from '@/bootstrap/client-composition-root';
import { type NotificationLanguage, type NotificationRole, notificationRoute, renderNotification } from './notification-copy';
import { notificationService } from './notification-service';
import { loadNotifications } from './expo-notifications-module';
import { installNotificationHandler, registerForPushNotifications } from './push-registration';

const POLL_INTERVAL_MS = 15_000;
const BANNER_DURATION_MS = 6_000;
/** Unread items shown when the app opens stay a little longer. */
const OPEN_BANNER_DURATION_MS = 12_000;

export interface InboxNotification {
  id: string;
  template: string;
  payload: Record<string, unknown>;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

interface NotificationContextValue {
  role: NotificationRole;
  notifications: readonly InboxNotification[];
  unreadCount: number;
  loading: boolean;
  banner: InboxNotification | null;
  refresh: () => Promise<void>;
  markRead: (ids: readonly string[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismissBanner: () => void;
  open: (notification: InboxNotification) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

interface NotificationProviderProps extends PropsWithChildren {
  role: NotificationRole;
  language: NotificationLanguage;
}

function toInbox(record: ApiNotificationRecord, language: NotificationLanguage): InboxNotification {
  const rendered = renderNotification(record, language);
  return {
    id: record.id,
    template: record.template,
    payload: record.payload ?? {},
    title: rendered.title,
    body: rendered.body,
    readAt: record.readAt ?? null,
    createdAt: record.createdAt,
  };
}

/**
 * In-app notification inbox for the signed-in user. The outbox rows written by
 * the backend are the source of truth; this keeps a live copy via Supabase
 * Realtime with API polling as the fallback, surfaces unseen records as a
 * banner, and registers the device for push on native builds.
 */
export function NotificationProvider({ children, role, language }: NotificationProviderProps) {
  const { session } = useAuthSession();
  const token = session?.source === 'api' ? session.accessToken ?? null : null;
  const userId = session?.userId ?? null;
  const [inbox, setInbox] = useState<{ userId: string; records: readonly ApiNotificationRecord[] } | null>(null);
  const records = useMemo<readonly ApiNotificationRecord[]>(
    () => (inbox && inbox.userId === userId ? inbox.records : []),
    [inbox, userId],
  );
  // Loading until the first list for this user has landed.
  const loading = Boolean(token && userId) && inbox?.userId !== userId;
  const [banner, setBanner] = useState<InboxNotification | null>(null);
  const knownIds = useRef<Set<string> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUser = useRef(userId);
  useEffect(() => { currentUser.current = userId; return () => { currentUser.current = null; }; }, [userId]);
  const handledResponse = useRef<string | null>(null);

  const showBanner = useCallback((notification: InboxNotification, durationMs = BANNER_DURATION_MS) => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    setBanner(notification);
    bannerTimer.current = setTimeout(() => setBanner(null), durationMs);
  }, []);

  const refresh = useCallback(async () => {
    if (!token || !userId) return;
    try {
      const next = await notificationService.listNotifications(token);
      if (currentUser.current !== userId) return;
      setInbox({ userId, records: next });
      const known = knownIds.current;
      if (known) {
        const fresh = next.filter((record) => !known.has(record.id) && !record.readAt);
        if (fresh.length) showBanner(toInbox(fresh[0], language));
      } else {
        // First load after opening the app: surface the newest unread notification
        // at the top so it is not forgotten in the inbox.
        const unread = next.filter((record) => !record.readAt);
        if (unread.length) showBanner(toInbox(unread[0], language), OPEN_BANNER_DURATION_MS);
      }
      knownIds.current = new Set(next.map((record) => record.id));
    } catch (error) {
      if (__DEV__) console.warn('Unable to load notifications.', error);
    }
  }, [token, userId, language, showBanner]);

  // Initial load, polling while active, and Realtime for instant delivery.
  useEffect(() => {
    knownIds.current = null;
    if (!token || !userId) return;
    // The first load is deferred a tick so the effect only wires subscriptions.
    const initial = setTimeout(() => { void refresh(); }, 0);
    const interval = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, POLL_INTERVAL_MS);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    const unsubscribe = liveUpdatesGateway.subscribe('notification_outbox', 'user_id', userId, () => { void refresh(); });
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      appState.remove();
      unsubscribe();
    };
  }, [token, userId, refresh]);

  // Push: register the device and route taps on system notifications.
  useEffect(() => {
    if (Platform.OS === 'web' || !token || !userId) return;
    const Notifications = loadNotifications();
    if (!Notifications) return;
    installNotificationHandler();
    void registerForPushNotifications(userId, token);
    let cancelled = false;
    const handleResponse = async (response: NotificationResponse | null) => {
      if (!response || cancelled || handledResponse.current === response.notification.request.identifier) return;
      const data = response.notification.request.content.data as { template?: unknown; bookingId?: unknown } | undefined;
      if (!data || typeof data.template !== 'string') return;
      // Resolve against the signed-in user's inbox before opening a cold-start tap.
      const owned = await notificationService.listNotifications(token).catch(() => []);
      if (cancelled || currentUser.current !== userId) return;
      const record = owned.find((item) => item.template === data.template && item.payload?.bookingId === data.bookingId);
      if (!record) return;
      handledResponse.current = response.notification.request.identifier;
      router.push(notificationRoute(role, record));
      void notificationService.markRead([record.id]);
      void Notifications.clearLastNotificationResponseAsync();
      void refresh();
    };
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => { void handleResponse(response); });
    const received = Notifications.addNotificationReceivedListener(() => { void refresh(); });
    void Notifications.getLastNotificationResponseAsync().then(handleResponse);
    return () => { cancelled = true; subscription.remove(); received.remove(); };
  }, [token, userId, role, refresh]);

  useEffect(() => () => { if (bannerTimer.current) clearTimeout(bannerTimer.current); }, []);

  const notifications = useMemo(() => records.map((record) => toInbox(record, language)), [records, language]);

  const markRead = useCallback(async (ids: readonly string[]) => {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setInbox((current) => current ? {
      ...current,
      records: current.records.map((record) => ids.includes(record.id) && !record.readAt ? { ...record, readAt: now } : record),
    } : current);
    try { await notificationService.markRead(ids); }
    catch (error) { if (__DEV__) console.warn('Unable to mark notifications read.', error); }
  }, []);

  const markAllRead = useCallback(async () => {
    await markRead(records.filter((record) => !record.readAt).map((record) => record.id));
  }, [markRead, records]);

  const dismissBanner = useCallback(() => setBanner(null), []);

  const open = useCallback((notification: InboxNotification) => {
    setBanner(null);
    void markRead([notification.id]);
    router.push(notificationRoute(role, notification));
  }, [markRead, role]);

  const value = useMemo<NotificationContextValue>(() => ({
    role,
    notifications,
    unreadCount: notifications.filter((notification) => !notification.readAt).length,
    loading,
    banner,
    refresh,
    markRead,
    markAllRead,
    dismissBanner,
    open,
  }), [role, notifications, loading, banner, refresh, markRead, markAllRead, dismissBanner, open]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextValue {
  const value = useContext(NotificationContext);
  if (!value) throw new Error('useNotifications must be used inside NotificationProvider.');
  return value;
}

/** Safe variant for screens that render with or without the provider. */
export function useOptionalNotifications(): NotificationContextValue | null {
  return useContext(NotificationContext);
}
