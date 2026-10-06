import type { GeoPoint } from './geo';

export interface MapMarker {
  id: string;
  point: GeoPoint;
  kind: 'destination' | 'professional' | 'self';
  label?: string;
}

export const ADDIS_ABABA: GeoPoint = { latitude: 9.0192, longitude: 38.7525 };

/** Plain data handed to the map page; stable JSON so unchanged markers send nothing. */
export function serializeMarkers(markers: readonly MapMarker[]): string {
  return JSON.stringify(markers.map((marker) => ({
    id: marker.id,
    kind: marker.kind,
    label: marker.label ?? null,
    latitude: Number(marker.point.latitude.toFixed(6)),
    longitude: Number(marker.point.longitude.toFixed(6)),
  })));
}
