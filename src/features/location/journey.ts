import type { GeoPoint } from './geo';
import type { MapMarker } from './map-markers';

/** Start (the moving pin) and end (the destination) of the remaining journey, or null. */
export function journeyPoints(markers: readonly MapMarker[]): [GeoPoint, GeoPoint] | null {
  const destination = markers.find((marker) => marker.kind === 'destination');
  const moving = markers.find((marker) => marker.kind === 'professional') ?? markers.find((marker) => marker.kind === 'self');
  return destination && moving ? [moving.point, destination.point] : null;
}

/** GeoJSON line for the remaining journey; null when either pin is missing. */
export function journeyFeature(points: [GeoPoint, GeoPoint] | null): GeoJSON.Feature<GeoJSON.LineString> | null {
  if (!points) return null;
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: points.map((point) => [point.longitude, point.latitude]) },
  };
}
