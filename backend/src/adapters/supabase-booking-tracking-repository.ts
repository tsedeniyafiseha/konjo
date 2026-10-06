import type { ApiBookingTracking } from '../../../shared/api-contracts.ts';
import type { RecordBookingLocationResult, RecordBookingLocationStoreInput } from '../application/contracts.ts';
import type { BookingTrackingStore } from '../application/ports.ts';
import { supabaseServiceHeaders } from './supabase-service-headers.ts';

type JsonRecord = Record<string, unknown>;

const recordResults = new Set<RecordBookingLocationResult>(['updated', 'not_found', 'not_active']);

export class SupabaseBookingTrackingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseBookingTrackingError';
  }
}

export class SupabaseBookingTrackingRepository implements BookingTrackingStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(baseUrl: string, secretKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
  }

  async recordLocation(input: RecordBookingLocationStoreInput): Promise<RecordBookingLocationResult> {
    const result = await this.rpc('record_booking_location', {
      p_professional_id: input.professionalId,
      p_booking_id: input.bookingId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_accuracy_meters: input.accuracyMeters ?? null,
      p_heading: input.heading ?? null,
      p_speed_mps: input.speedMps ?? null,
      p_area_label: input.areaLabel ?? null,
      p_recorded_at: input.recordedAt,
    });
    if (typeof result !== 'string' || !recordResults.has(result as RecordBookingLocationResult)) {
      throw new SupabaseBookingTrackingError('Supabase returned an invalid tracking result.');
    }
    return result as RecordBookingLocationResult;
  }

  async getTracking(userId: string, bookingId: string): Promise<ApiBookingTracking | null | undefined> {
    const result = await this.rpc('get_booking_tracking', {
      p_user_id: userId,
      p_booking_id: bookingId,
    });
    // The RPC returns SQL null (no access) or JSON null (no point yet).
    if (result === null || result === undefined) return undefined;
    if (typeof result !== 'object' || Array.isArray(result)) {
      throw new SupabaseBookingTrackingError('Supabase returned an invalid tracking point.');
    }
    return Object.keys(result as JsonRecord).length === 0 ? null : result as ApiBookingTracking;
  }

  private async rpc(name: string, body: JsonRecord): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: supabaseServiceHeaders(this.secretKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
    } catch {
      throw new SupabaseBookingTrackingError('Supabase booking tracking is unavailable.');
    }
    if (!response.ok) {
      throw new SupabaseBookingTrackingError('Supabase rejected the booking tracking operation.');
    }
    const text = await response.text();
    return text ? JSON.parse(text) as unknown : null;
  }
}
