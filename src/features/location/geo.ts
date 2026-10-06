/** Small geodesy helpers shared by the map, ETA copy, and the location reporter. */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_METERS = 6_371_000;

export function distanceMeters(from: GeoPoint, to: GeoPoint): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(to.latitude - from.latitude);
  const dLng = toRadians(to.longitude - from.longitude);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Rough door-to-door estimate for Addis Ababa traffic (~18 km/h average). */
export function estimateArrivalMinutes(meters: number, speedMps?: number | null): number {
  const effectiveSpeed = speedMps && speedMps > 1.5 ? speedMps : 5;
  return Math.max(1, Math.round(meters / effectiveSpeed / 60));
}

export function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** Whether a reported point is fresh enough to show as "live". */
export function isRecentPoint(recordedAt: string | undefined, now = Date.now(), maxAgeMs = 3 * 60_000): boolean {
  if (!recordedAt) return false;
  const time = Date.parse(recordedAt);
  return !Number.isNaN(time) && now - time <= maxAgeMs;
}
