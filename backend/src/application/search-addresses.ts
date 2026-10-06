import type { ApiAddressCandidate } from '../../../shared/api-contracts.ts';
import type { AddressGeocoder } from './ports.ts';

export const ADDRESS_QUERY_MIN_LENGTH = 3;
export const ADDRESS_QUERY_MAX_LENGTH = 120;
export const ADDRESS_CANDIDATE_LIMIT = 6;

export class InvalidAddressQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAddressQueryError';
  }
}

/**
 * Address search for a client's saved addresses. Short queries return nothing
 * without touching the provider; coordinates are range-checked before a
 * reverse lookup so the provider only ever sees well-formed requests.
 */
export class SearchAddresses {
  private readonly geocoder: AddressGeocoder;

  constructor(geocoder: AddressGeocoder) {
    this.geocoder = geocoder;
  }

  async search(rawQuery: string): Promise<ReadonlyArray<ApiAddressCandidate>> {
    const query = rawQuery.trim().replace(/\s+/g, ' ');
    if (query.length < ADDRESS_QUERY_MIN_LENGTH) return [];
    if (query.length > ADDRESS_QUERY_MAX_LENGTH) {
      throw new InvalidAddressQueryError(`Address queries are limited to ${ADDRESS_QUERY_MAX_LENGTH} characters.`);
    }
    return this.geocoder.search(query, ADDRESS_CANDIDATE_LIMIT);
  }

  async reverse(latitude: number, longitude: number): Promise<ApiAddressCandidate | null> {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new InvalidAddressQueryError('A valid latitude and longitude are required.');
    }
    return this.geocoder.reverse({ latitude, longitude });
  }
}
