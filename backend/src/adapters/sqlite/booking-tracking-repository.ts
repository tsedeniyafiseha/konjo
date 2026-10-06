import type { DatabaseSync } from 'node:sqlite';

import type { ApiBookingTracking } from '../../../../shared/api-contracts.ts';
import type { RecordBookingLocationResult, RecordBookingLocationStoreInput } from '../../application/contracts.ts';
import type { BookingTrackingStore } from '../../application/ports.ts';

interface TrackingRow {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  heading: number | null;
  speed_mps: number | null;
  area_label?: string | null;
  recorded_at: string;
}

export function toApiBookingTracking(row: TrackingRow): ApiBookingTracking {
  return {
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracy_meters,
    heading: row.heading,
    speedMps: row.speed_mps,
    areaLabel: row.area_label ?? null,
    recordedAt: row.recorded_at,
  };
}

export class SqliteBookingTrackingRepository implements BookingTrackingStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  recordLocation(input: RecordBookingLocationStoreInput): RecordBookingLocationResult {
    const booking = this.database.prepare(
      'SELECT status FROM bookings WHERE id = ? AND professional_id = ?',
    ).get(input.bookingId, input.professionalId) as unknown as { status: string } | undefined;
    if (!booking) return 'not_found';
    if (booking.status !== 'on_the_way' && booking.status !== 'in_progress') return 'not_active';
    this.database.prepare(`
      INSERT INTO booking_tracking (
        booking_id, professional_id, latitude, longitude, accuracy_meters, heading, speed_mps, area_label, recorded_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (booking_id) DO UPDATE SET
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        accuracy_meters = excluded.accuracy_meters,
        heading = excluded.heading,
        speed_mps = excluded.speed_mps,
        area_label = COALESCE(excluded.area_label, booking_tracking.area_label),
        recorded_at = excluded.recorded_at,
        updated_at = excluded.updated_at
      WHERE excluded.recorded_at >= booking_tracking.recorded_at
    `).run(
      input.bookingId, input.professionalId, input.latitude, input.longitude,
      input.accuracyMeters ?? null, input.heading ?? null, input.speedMps ?? null, input.areaLabel ?? null,
      input.recordedAt, input.recordedAt,
    );
    return 'updated';
  }

  getTracking(userId: string, bookingId: string): ApiBookingTracking | null | undefined {
    const participant = this.database.prepare(
      'SELECT 1 AS ok FROM bookings WHERE id = ? AND (client_id = ? OR professional_id = ?)',
    ).get(bookingId, userId, userId);
    if (!participant) return undefined;
    const row = this.database.prepare('SELECT * FROM booking_tracking WHERE booking_id = ?')
      .get(bookingId) as unknown as TrackingRow | undefined;
    return row ? toApiBookingTracking(row) : null;
  }
}
