import type { ApiAddressCandidate } from '../../../../shared/api-contracts';
import { ApiClientError, apiBaseUrl, apiRequest } from '@/services/api-client';

/** Address search runs through the API so the geocoding key stays server-side. */
export const addressSearchAvailable = Boolean(apiBaseUrl);

interface AddressSearchResult {
  candidates: readonly ApiAddressCandidate[];
  /** False when the API has no geocoding key; the form then hides the search box. */
  available: boolean;
}

export async function searchAddresses(query: string, token: string): Promise<AddressSearchResult> {
  try {
    const response = await apiRequest<{ candidates: ApiAddressCandidate[] }>(
      `/v1/addresses/search?query=${encodeURIComponent(query)}`,
      { token },
    );
    return { candidates: response.candidates, available: true };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 503) return { candidates: [], available: false };
    throw error;
  }
}

/** Best address for a pinned location, or null when unknown or unavailable. */
export async function reverseGeocode(point: { latitude: number; longitude: number }, token: string): Promise<ApiAddressCandidate | null> {
  try {
    const response = await apiRequest<{ candidate: ApiAddressCandidate | null }>(
      `/v1/addresses/reverse?latitude=${encodeURIComponent(String(point.latitude))}&longitude=${encodeURIComponent(String(point.longitude))}`,
      { token },
    );
    return response.candidate;
  } catch {
    return null;
  }
}
