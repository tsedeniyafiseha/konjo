import Constants from 'expo-constants';

/** Required by CARTO's basemap terms and shown on every map. */
export const MAP_ATTRIBUTION = '© OpenStreetMap contributors, © CARTO';
export const MAP_ATTRIBUTION_URL = 'https://carto.com/attributions';

const STYLE_URL = /^https:\/\/[^\s'"<>]+$/;

interface MapExtra {
  mapStyleUrl?: unknown;
}

/**
 * The vector style the in-app map renders. Production is CARTO Voyager with
 * Konjo's CARTO Basemaps key, published by app.config.ts as
 * `extra.mapStyleUrl` from CARTO_BASEMAPS_API_KEY. EXPO_PUBLIC_MAP_STYLE_URL
 * overrides it (another CARTO style or a self-hosted MapLibre style). Null
 * when nothing is configured: the map then shows its error state instead of
 * falling back to a public tile server.
 */
export function mapStyleUrl(): string | null {
  const override = process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim();
  if (override && STYLE_URL.test(override)) return override;
  const extra = Constants.expoConfig?.extra as MapExtra | undefined;
  const configured = typeof extra?.mapStyleUrl === 'string' ? extra.mapStyleUrl.trim() : '';
  return STYLE_URL.test(configured) ? configured : null;
}

/** The provider key carried by the style URL, so tile requests to the same host can carry it too. */
export function mapStyleKey(styleUrl: string): string | null {
  try {
    return new URL(styleUrl).searchParams.get('key');
  } catch {
    return null;
  }
}
