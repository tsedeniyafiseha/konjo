import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { Alert, Platform } from 'react-native';
import { ApiClientError } from '@/services/api-client';

import { professionalDashboardService } from '@/features/professional/professional-dashboard-service';
import { distanceMeters, type GeoPoint } from './geo';

/**
 * Streams the professional's position to the backend while a visit is live.
 *
 * Foreground: `watchPositionAsync` while the app is open.
 * Background (native builds only): a TaskManager location task keeps reporting
 * when the professional locks the phone or switches to a maps app. The task
 * restores the authorized active visit from secure storage after a restart.
 *
 * Each report also carries a short area name ("Bole, Addis Ababa") from the
 * phone's own reverse geocoder (expo-location: Android's platform geocoder,
 * Apple's on iOS; no API key). Geocoding is throttled: once per 300 m of
 * movement, never concurrently, and the previous label is reused meanwhile.
 */
const BACKGROUND_TASK = 'konjo-live-location';
const ACTIVE_REPORT_KEY = 'konjo.active-location.v1';
const REPORT_INTERVAL_MS = 5_000;
const REPORT_DISTANCE_METERS = 15;
/**
 * Position watchers only fire on movement. A professional waiting at a light
 * or stuck in traffic would otherwise look "stale" to the client, so while the
 * app is open we re-send the last known position on a fixed heartbeat.
 */
const HEARTBEAT_MS = 20_000;
const GEOCODE_MIN_DISTANCE_METERS = 300;
const GEOCODE_RETRY_MS = 60_000;

interface ActiveReport {
  bookingId: string;
  token: string;
  /** The professional whose journey this is; sharing dies with their session. */
  userId: string;
  expiresAt: number;
}

let active: ActiveReport | null = null;
let foregroundSubscription: Location.LocationSubscription | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastSentAt = 0;
let inFlight = false;
let generation = 0;
let mayRestore = true;
/** The signed-in user as last told by the session; undefined until the session is known. */
let sessionUserId: string | null | undefined;
let consentForVisit: { bookingId: string; allowed: boolean } | null = null;
let backgroundOperation = Promise.resolve();
let areaCache: { point: GeoPoint; label: string | null; at: number } | null = null;
let geocoding = false;

/** "Bole, Addis Ababa" from a geocoder address; null when it has nothing useful. */
export function describeArea(address: Pick<Location.LocationGeocodedAddress, 'district' | 'subregion' | 'street' | 'name' | 'city' | 'region'>): string | null {
  const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
  const area = [address.district, address.subregion, address.street, address.name].map(clean).find((value) => value.length > 1 && !/^[\d\s+-]+$/.test(value)) ?? '';
  const city = clean(address.city) || clean(address.region);
  if (!area && !city) return null;
  if (!area) return city;
  return city && city.toLowerCase() !== area.toLowerCase() ? `${area}, ${city}` : area;
}

/** Refreshes the cached area label when the professional has moved far enough. Never blocks a report. */
function refreshAreaLabel(point: GeoPoint): void {
  if (Platform.OS === 'web' || geocoding) return;
  const cached = areaCache;
  if (cached && distanceMeters(cached.point, point) < GEOCODE_MIN_DISTANCE_METERS &&
    (cached.label !== null || Date.now() - cached.at < GEOCODE_RETRY_MS)) return;
  geocoding = true;
  void Location.reverseGeocodeAsync(point)
    .then(([address]) => { areaCache = { point, label: (address ? describeArea(address) : null) ?? cached?.label ?? null, at: Date.now() }; })
    .catch(() => { areaCache = { point, label: cached?.label ?? null, at: Date.now() }; })
    .finally(() => { geocoding = false; });
}

const CONSENT_KEY = 'konjo.location-consent.v1';

/** A "Continue" is remembered for the booking, so a relaunch mid-journey does not ask again. */
async function rememberedConsent(bookingId: string): Promise<boolean | null> {
  if (consentForVisit?.bookingId === bookingId) return consentForVisit.allowed;
  if (Platform.OS === 'web') return null;
  try {
    const stored = await SecureStore.getItemAsync(CONSENT_KEY);
    const parsed = stored ? JSON.parse(stored) as { bookingId?: unknown; allowed?: unknown } : null;
    return parsed?.bookingId === bookingId && parsed.allowed === true ? true : null;
  } catch {
    return null;
  }
}

async function locationDisclosure(bookingId: string): Promise<boolean> {
  const remembered = await rememberedConsent(bookingId);
  if (remembered !== null) return remembered;
  const message = 'Konjo collects and shares your precise location with the client during an active trip so they can follow your progress and Konjo can support booking safety. Sharing continues when the app is in the background or your phone is locked, and stops when you arrive or the booking ends. On the next system screen, you can allow or deny location access.';
  const allowed = Platform.OS === 'web'
    ? typeof window !== 'undefined' && window.confirm('Share your location while you travel? Keep Konjo open on the way. Sharing stops when you arrive or the booking is cancelled.')
    : await new Promise<boolean>((resolve) => Alert.alert('Location sharing during this visit', message,
      [{ text: 'Continue', onPress: () => resolve(true) }],
      { cancelable: false }));
  consentForVisit = { bookingId, allowed };
  if (allowed && Platform.OS !== 'web') {
    try { await SecureStore.setItemAsync(CONSENT_KEY, JSON.stringify({ bookingId, allowed })); } catch { /* asked again next launch */ }
  }
  return allowed;
}

async function send(position: Location.LocationObject): Promise<void> {
  if (!active || inFlight) return;
  if (active.expiresAt <= Date.now()) { await liveLocationReporter.stop(); return; }
  const report = active;
  const now = Date.now();
  if (now - lastSentAt < REPORT_INTERVAL_MS * 0.8) return;
  inFlight = true;
  const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  refreshAreaLabel(point);
  try {
    await professionalDashboardService.reportLocation(report.token, report.bookingId, {
      ...point,
      accuracyMeters: position.coords.accuracy ?? null,
      heading: position.coords.heading ?? null,
      speedMps: position.coords.speed ?? null,
      areaLabel: areaCache?.label ?? null,
    });
    lastSentAt = now;
  } catch (error) {
    if (active === report && error instanceof ApiClientError && [401, 403, 404, 409].includes(error.status)) {
      await liveLocationReporter.stop();
      return;
    }
    if (__DEV__) console.warn('Live location report failed.', error);
  } finally {
    inFlight = false;
  }
}

if (Platform.OS !== 'web') {
  TaskManager.defineTask(BACKGROUND_TASK, async ({ data, error }) => {
    if (error || !data) return;
    if (!active && mayRestore) {
      const version = generation;
      try {
        const stored = await SecureStore.getItemAsync(ACTIVE_REPORT_KEY);
        const restored = stored ? JSON.parse(stored) as Partial<ActiveReport> : null;
        // Never restore before the session is known, and only for the professional it belongs to.
        if (mayRestore && generation === version && sessionUserId !== undefined && restored && typeof restored.bookingId === 'string' && typeof restored.token === 'string' &&
          typeof restored.userId === 'string' && restored.userId === sessionUserId &&
          typeof restored.expiresAt === 'number' && restored.expiresAt > Date.now()) active = restored as ActiveReport;
      } catch { /* A locked or cleared secure store must never start a report. */ }
    }
    if (!active) { if (sessionUserId !== undefined) await stopBackgroundUpdates(); return; }
    const { locations } = data as { locations: Location.LocationObject[] };
    const latest = locations[locations.length - 1];
    if (latest) await send(latest);
  });
}

async function startBackgroundUpdates(version: number): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const background = await Location.requestBackgroundPermissionsAsync();
    if (!background.granted || generation !== version || !active) return;
    backgroundOperation = backgroundOperation.catch(() => {}).then(async () => {
      if (generation !== version || !active || await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK)) return;
      if (generation !== version || !active) return;
      await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: REPORT_INTERVAL_MS,
      distanceInterval: REPORT_DISTANCE_METERS,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Konjo is sharing your location',
        notificationBody: 'Your client can follow your arrival. This stops when you arrive.',
        notificationColor: '#3F6B3A',
      },
      });
    });
    await backgroundOperation;
  } catch (error) {
    if (__DEV__) console.warn('Background location updates unavailable.', error);
  }
}

async function stopBackgroundUpdates(): Promise<void> {
  if (Platform.OS === 'web') return;
  backgroundOperation = backgroundOperation.catch(() => {}).then(async () => {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK)) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_TASK);
    }
  } catch {
    // Nothing to stop.
  }
  });
  await backgroundOperation;
}

async function heartbeat(version: number): Promise<void> {
  if (generation !== version || !active || inFlight) return;
  if (Date.now() - lastSentAt < HEARTBEAT_MS - 1_000) return;
  try {
    const position = await Location.getLastKnownPositionAsync({ maxAge: 60_000 })
      ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    if (position && generation === version) await send(position);
  } catch (error) {
    if (__DEV__) console.warn('Live location heartbeat failed.', error);
  }
}

export type LiveLocationPermission = 'granted' | 'denied' | 'unavailable';

export const liveLocationReporter = {
  isActiveFor(bookingId: string): boolean {
    return active?.bookingId === bookingId;
  },

  async start(bookingId: string, token: string, userId: string): Promise<LiveLocationPermission> {
    sessionUserId = userId;
    if (active?.bookingId === bookingId && active.userId === userId && foregroundSubscription) {
      active.token = token;
      if (Platform.OS !== 'web') await SecureStore.setItemAsync(ACTIVE_REPORT_KEY, JSON.stringify(active));
      return 'granted';
    }
    const stopping = this.stop();
    const version = generation;
    await stopping;
    if (generation !== version) return 'unavailable';
    if (!await locationDisclosure(bookingId) || generation !== version) return 'denied';
    let permission: Location.PermissionResponse;
    try {
      permission = await Location.requestForegroundPermissionsAsync();
    } catch {
      return 'unavailable';
    }
    if (!permission.granted || version !== generation) return 'denied';
    active = { bookingId, token, userId, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
    if (Platform.OS !== 'web') await SecureStore.setItemAsync(ACTIVE_REPORT_KEY, JSON.stringify(active));
    lastSentAt = 0;
    areaCache = null;
    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (generation !== version || !active) return 'unavailable';
      void send(current);
      const subscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: REPORT_INTERVAL_MS, distanceInterval: REPORT_DISTANCE_METERS },
        (position) => { if (generation === version) void send(position); },
      );
      if (generation !== version || !active) { subscription.remove(); return 'unavailable'; }
      foregroundSubscription = subscription;
      heartbeatTimer = setInterval(() => { void heartbeat(version); }, HEARTBEAT_MS);
    } catch (error) {
      if (__DEV__) console.warn('Unable to watch the device position.', error);
      if (generation === version) await this.stop();
      return 'unavailable';
    }
    void startBackgroundUpdates(version);
    return 'granted';
  },

  /**
   * Called whenever the session changes. Sharing belongs to one professional:
   * a sign-out, an expired session or a switch to another account (including
   * a client) stops sharing and forgets the stored journey, so a device can
   * never keep publishing a previous user's location.
   */
  async syncSession(userId: string | null): Promise<void> {
    sessionUserId = userId;
    if (active && active.userId !== userId) { await this.stop(); return; }
    if (active || Platform.OS === 'web') return;
    let storedUserId: unknown = null;
    try {
      const stored = await SecureStore.getItemAsync(ACTIVE_REPORT_KEY);
      storedUserId = stored ? (JSON.parse(stored) as { userId?: unknown }).userId : null;
    } catch { storedUserId = null; }
    if (storedUserId !== userId) await this.stop();
  },

  async stop(): Promise<void> {
    generation += 1;
    mayRestore = false;
    foregroundSubscription?.remove();
    foregroundSubscription = null;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    active = null;
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(ACTIVE_REPORT_KEY);
    await stopBackgroundUpdates();
  },
};
