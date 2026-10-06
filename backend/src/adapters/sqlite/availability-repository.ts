import type { DatabaseSync } from 'node:sqlite';

import type {
  ApiProfessionalAvailability,
  ApiProfessionalService,
} from '../../../../shared/api-contracts.ts';
import type { ProfessionalAvailabilityReader } from '../../application/ports.ts';
import { bookingStartTime, bookingTimeSlots, timeToMinutes } from '../../domain/booking-time.ts';

interface ProfessionalAvailabilityRow {
  services_json: string;
  hidden: number;
  suspended: number;
}

export class SqliteAvailabilityRepository implements ProfessionalAvailabilityReader {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  getProfessionalAvailability(
    professionalId: string,
    dateIso: string,
    serviceId?: string,
    excludeBookingId?: string,
  ): ApiProfessionalAvailability | null {
    const professional = this.database.prepare('SELECT services_json, hidden, suspended FROM professionals WHERE id = ?')
      .get(professionalId) as unknown as ProfessionalAvailabilityRow | undefined;
    if (!professional || professional.hidden === 1 || professional.suspended === 1) return null;
    const available = this.database.prepare(
      'SELECT available FROM professional_availability WHERE professional_id = ?',
    ).get(professionalId) as unknown as { available: number } | undefined;
    // Professionals can take bookings at any hour: working hours do not narrow
    // the slots, only the availability switch, the clock and other bookings do.
    if (available?.available !== 1) return { professionalId, dateIso, available: false, slots: [] };

    const activeBooking = this.database.prepare(`
      SELECT 1 FROM bookings
      WHERE professional_id = ?
        AND status IN ('on_the_way', 'in_progress')
        AND (? IS NULL OR id != ?)
      LIMIT 1
    `).get(professionalId, excludeBookingId ?? null, excludeBookingId ?? null);
    // Only a visit that is under way blocks the calendar (mirrors Postgres);
    // accepted bookings just occupy their own slots.
    if (activeBooking) return { professionalId, dateIso, available: false, slots: [] };

    const services = JSON.parse(professional.services_json) as ApiProfessionalService[];
    const requestedDuration = services.find((service) => service.id === serviceId)?.durationMinutes ?? 60;
    const bookings = this.database.prepare(`
      SELECT service_id, time FROM bookings
      WHERE professional_id = ? AND date_iso = ? AND status != 'cancelled'
        AND (? IS NULL OR id != ?)
    `).all(professionalId, dateIso, excludeBookingId ?? null, excludeBookingId ?? null) as unknown as Array<{
      service_id: string;
      time: string;
    }>;
    const occupied = bookings.map((booking) => {
      const duration = services.find((service) => service.id === booking.service_id)?.durationMinutes ?? 60;
      const start = timeToMinutes(booking.time);
      return { start, end: start + duration };
    });
    const now = Date.now();
    const slots = bookingTimeSlots.filter((slot) => {
      const start = timeToMinutes(slot);
      const end = start + requestedDuration;
      if (bookingStartTime(dateIso, slot) <= now) return false;
      return occupied.every((range) => end <= range.start || start >= range.end);
    });
    return { professionalId, dateIso, available: slots.length > 0, slots };
  }
}
