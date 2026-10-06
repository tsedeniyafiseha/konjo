import type { ApiBookingTracking } from '../../../shared/api-contracts.ts';
import type { RecordBookingLocationCommandInput, RecordBookingLocationResult } from './contracts.ts';
import type { BookingTrackingStore, Clock } from './ports.ts';

const COORDINATE_LIMITS = { latitude: 90, longitude: 180 } as const;

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= COORDINATE_LIMITS.latitude && Math.abs(longitude) <= COORDINATE_LIMITS.longitude;
}

/**
 * Live tracking for an active visit. The assigned professional reports their
 * position while travelling or on site; the booking's client reads it back.
 */
export class BookingTrackingHandler {
  private readonly store: BookingTrackingStore;
  private readonly clock: Clock;

  constructor(store: BookingTrackingStore, clock: Clock) {
    this.store = store;
    this.clock = clock;
  }

  async record(input: RecordBookingLocationCommandInput): Promise<RecordBookingLocationResult> {
    if (!isValidCoordinate(input.latitude, input.longitude)) {
      throw new RangeError('The reported coordinates are out of range.');
    }
    return await this.store.recordLocation({
      ...input,
      accuracyMeters: nonNegative(input.accuracyMeters),
      heading: input.heading !== null && input.heading !== undefined && input.heading >= 0 && input.heading <= 360
        ? input.heading
        : null,
      speedMps: nonNegative(input.speedMps),
      areaLabel: areaLabel(input.areaLabel),
      recordedAt: this.clock.now().toISOString(),
    });
  }

  async get(userId: string, bookingId: string): Promise<ApiBookingTracking | null | undefined> {
    return await this.store.getTracking(userId, bookingId);
  }
}

export const AREA_LABEL_MAX_LENGTH = 80;

/** Collapses whitespace and caps the length; anything unusable becomes null. */
export function areaLabel(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (cleaned.length < 2) return null;
  return cleaned.length > AREA_LABEL_MAX_LENGTH ? `${cleaned.slice(0, AREA_LABEL_MAX_LENGTH - 1).trimEnd()}…` : cleaned;
}

function nonNegative(value: number | null | undefined): number | null {
  return value !== null && value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}
