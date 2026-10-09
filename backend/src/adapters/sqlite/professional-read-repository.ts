import type { DatabaseSync } from 'node:sqlite';

import type {
  ApiPayoutBatch,
  ApiProfessionalApplication,
  ApiProfessionalAvailability,
  ApiProfessionalCatalogSettings,
  ApiProfessionalDashboard,
  ApiProfessionalJob,
} from '../../../../shared/api-contracts.ts';
import type { ProfessionalReadStore } from '../../application/ports.ts';
import { type BookingRow, toApiBooking } from './booking-records.ts';
import { SqliteAvailabilityRepository } from './availability-repository.ts';
import { readTravelFeeCap } from './platform-settings.ts';
import { type PayoutRow, toApiPayoutBatch } from './payout-records.ts';
import { readProfessionalApplication } from './professional-records.ts';

export class SqliteProfessionalReadRepository implements ProfessionalReadStore {
  private readonly database: DatabaseSync;
  private readonly availability: SqliteAvailabilityRepository;

  constructor(database: DatabaseSync, availability: SqliteAvailabilityRepository) {
    this.database = database;
    this.availability = availability;
  }

  getApplication(userId: string): ApiProfessionalApplication | null {
    return readProfessionalApplication(this.database, userId);
  }

  getDashboard(professionalId: string, earningsSince: string): ApiProfessionalDashboard | null {
    const professional = this.database.prepare(`
      SELECT id FROM professionals WHERE id = ? AND hidden = 0 AND suspended = 0
    `).get(professionalId) as unknown as { id: string } | undefined;
    if (!professional) return null;

    const rows = this.database.prepare(`
      SELECT bookings.*, users.full_name AS client_name
      FROM bookings
      JOIN users ON users.id = bookings.client_id
      WHERE bookings.professional_id = ?
        AND bookings.status NOT IN ('cancelled', 'completed')
      ORDER BY bookings.date_iso ASC, bookings.time ASC, bookings.created_at ASC
    `).all(professionalId) as unknown as Array<BookingRow & { client_name: string }>;
    const availability = this.database.prepare(
      'SELECT available FROM professional_availability WHERE professional_id = ?',
    ).get(professionalId) as unknown as { available: number } | undefined;
    const completed = this.database.prepare(`
      SELECT COUNT(*) AS count
      FROM bookings
      WHERE professional_id = ? AND status = 'completed'
    `).get(professionalId) as unknown as { count: number };
    const earnings = this.database.prepare(`
      SELECT COALESCE(SUM(net_amount), 0) AS total
      FROM professional_earnings
      WHERE professional_id = ? AND created_at >= ?
    `).get(professionalId, earningsSince) as unknown as { total: number };
    const recentRows = this.database.prepare(`
      SELECT bookings.*, users.full_name AS client_name
      FROM bookings
      JOIN users ON users.id = bookings.client_id
      WHERE bookings.professional_id = ?
        AND bookings.status IN ('completed', 'cancelled')
        AND COALESCE(bookings.completed_at, bookings.created_at) >= ?
      ORDER BY COALESCE(bookings.completed_at, bookings.created_at) DESC
      LIMIT 20
    `).all(professionalId, new Date(Date.parse(earningsSince) - 23 * 24 * 60 * 60 * 1000).toISOString()) as unknown as Array<BookingRow & { client_name: string }>;
    const ratings = this.database.prepare(`
      SELECT COUNT(*) AS count, AVG((technique_rating + professionalism_rating) / 2.0) AS average_rating
      FROM booking_reviews WHERE professional_id = ? AND visible = 1
    `).get(professionalId) as unknown as { count: number; average_rating: number | null };
    const baseline = this.database.prepare('SELECT rating_baseline, review_count_baseline FROM professionals WHERE id = ?')
      .get(professionalId) as unknown as { rating_baseline: number; review_count_baseline: number };
    const reviewCount = baseline.review_count_baseline + ratings.count;
    const rating = reviewCount === 0 ? 0 : Math.round(((baseline.rating_baseline * baseline.review_count_baseline + (ratings.average_rating ?? 0) * ratings.count) / reviewCount) * 100) / 100;

    const toJob = (row: BookingRow & { client_name: string }): ApiProfessionalJob => ({
      paymentSummary: toApiBooking(row, this.database).paymentSummary,
      arrivedAt: row.arrived_at ?? null,
      clientId: row.client_id,
      latitude: row.latitude ?? null,
      longitude: row.longitude ?? null,
      id: row.id,
      clientName: row.client_name,
      serviceName: row.service_name,
      servicePrice: row.service_price,
      travelFee: row.travel_fee,
      extraAmount: row.extra_amount ?? 0,
      extraFee: row.extra_fee ?? 0,
      extraNote: row.extra_note ?? null,
      total: row.total,
      commissionRateBps: row.commission_rate_bps,
      paymentMethod: row.payment_method,
      dateIso: row.date_iso,
      time: row.time,
      proposedDateIso: row.proposed_date_iso ?? null,
      proposedTime: row.proposed_time ?? null,
      addressLabel: row.address_label,
      addressZone: row.address_zone,
      addressDetail: row.address_detail,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
    });
    const jobs = rows.map(toJob);
    return {
      jobs,
      recentJobs: recentRows.map(toJob),
      available: availability?.available === 1,
      completedCount: completed.count,
      weekEarnings: earnings.total,
      rating,
      reviewCount,
      travelFeeCap: readTravelFeeCap(this.database),
    };
  }

  getCatalogSettings(professionalId: string): ApiProfessionalCatalogSettings | null {
    const professional = this.database.prepare(`
      SELECT id FROM professionals WHERE id = ? AND hidden = 0 AND suspended = 0
    `).get(professionalId);
    if (!professional) return null;
    const application = this.getApplication(professionalId);
    if (!application || application.status !== 'approved') return null;
    return {
      services: application.services,
      workingDays: application.workingDays,
      travelZones: application.travelZones,
      sameDayBookings: application.sameDayBookings,
    };
  }

  getProfessionalAvailability(
    professionalId: string,
    dateIso: string,
    serviceId?: string,
    excludeBookingId?: string,
  ): ApiProfessionalAvailability | null {
    return this.availability.getProfessionalAvailability(
      professionalId,
      dateIso,
      serviceId,
      excludeBookingId,
    );
  }

  listPayouts(professionalId: string): ReadonlyArray<ApiPayoutBatch> {
    const rows = this.database.prepare(`
      SELECT * FROM payout_batches WHERE professional_id = ? ORDER BY created_at DESC
    `).all(professionalId) as unknown as PayoutRow[];
    return rows.map(toApiPayoutBatch);
  }
}
