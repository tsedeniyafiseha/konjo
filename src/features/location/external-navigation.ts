import { Linking, Platform } from 'react-native';

import type { GeoPoint } from './geo';

export interface NavigationTarget {
  destination?: GeoPoint | null;
  address: string;
  addressDetail?: string;
}

async function open(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

async function canOpen(url: string): Promise<boolean> {
  try {
    return await Linking.canOpenURL(url);
  } catch {
    return false;
  }
}

/** The written address as a search string, e.g. "Home, Ayat, Near the school, Addis Ababa". */
export function navigationAddressQuery(target: NavigationTarget): string {
  return `${[target.address.replace(/\s*·\s*/g, ', '), target.addressDetail].filter(Boolean).join(', ')}, Addis Ababa`;
}

/**
 * Hands the trip to an external navigation app; Konjo never runs turn-by-turn
 * itself and no map-provider API key is involved. Pinned coordinates are
 * preferred; otherwise the written address is searched.
 *
 * iOS: Google Maps when installed (LSApplicationQueriesSchemes lists
 * comgooglemaps), else Apple Maps. Android: the navigation intent that
 * Google Maps and compatible apps handle, then a geo: intent any map app
 * handles, then the Google Maps web link. Web: the Google Maps web link.
 */
export async function openExternalNavigation(target: NavigationTarget): Promise<boolean> {
  const point = target.destination ? `${target.destination.latitude},${target.destination.longitude}` : null;
  const query = point ?? navigationAddressQuery(target);
  const encoded = encodeURIComponent(query);
  const webLink = `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;

  if (Platform.OS === 'ios') {
    const googleMaps = `comgooglemaps://?daddr=${encoded}&directionsmode=driving`;
    if (await canOpen(googleMaps) && await open(googleMaps)) return true;
    if (await open(`maps://?daddr=${encoded}&dirflg=d`)) return true;
    return open(`https://maps.apple.com/?daddr=${encoded}&dirflg=d`);
  }
  if (Platform.OS === 'android') {
    if (await open(point ? `google.navigation:q=${point}&mode=d` : `google.navigation:q=${encoded}&mode=d`)) return true;
    if (await open(point ? `geo:${point}?q=${point}` : `geo:0,0?q=${encoded}`)) return true;
    return open(webLink);
  }
  return open(webLink);
}
