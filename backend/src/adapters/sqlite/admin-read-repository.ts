import type { DatabaseSync } from 'node:sqlite';

import type {
  ApiAdminAuditLog,
  ApiAdminPendingPayout,
  ApiAdminBooking,
  ApiAdminBroadcast,
  ApiAdminPlatformSettings,
  ApiAdminProfessional,
  ApiAdminProfessionalApplication,
  ApiAdminSummary,
  ApiAdminZone,
  ApiBookingDispute,
  ApiPayoutBatch,
  ApiProfessionalApplication,
  ApiProfessionalQualityFlag,
  ApiSafetyIncident,
  ApiContentReport,
} from '../../../../shared/api-contracts.ts';
import type {
  AdminBookingFilters,
  AdminReadStore,
  AdminRevenueRow,
} from '../../application/ports.ts';
import { type BookingRow, toApiBooking } from './booking-records.ts';
import { readPlatformSettings } from './platform-settings.ts';
import { type PayoutRow, parsePayoutMethod, toApiPayoutBatch } from './payout-records.ts';
import {
  listAdminProfessionals as readAdminProfessionals,
  readProfessionalApplication,
} from './professional-records.ts';
import {
  type BookingDisputeRow,
  type ProfessionalQualityFlagRow,
  type SafetyIncidentRow,
  toApiBookingDispute,
  toApiProfessionalQualityFlag,
  toApiSafetyIncident,
  type ContentReportRow,
  toApiContentReport,
} from './trust-safety-records.ts';

export class SqliteAdminReadRepository implements AdminReadStore {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  getSummary(): ApiAdminSummary {
    const scalar = (sql: string) => (
      this.database.prepare(sql).get() as unknown as { value: number }
    ).value;
    return {
      pendingApplications: scalar("SELECT COUNT(*) AS value FROM professional_applications WHERE status = 'pending'"),
      activeProfessionals: scalar('SELECT COUNT(*) AS value FROM professionals WHERE suspended = 0'),
      openBookings: scalar("SELECT COUNT(*) AS value FROM bookings WHERE status NOT IN ('completed', 'cancelled')"),
      openNotificationFailures: scalar("SELECT COUNT(*) AS value FROM notification_outbox WHERE status = 'failed'"),
      queuedPayoutAmount: scalar("SELECT COALESCE(SUM(amount), 0) AS value FROM payout_batches WHERE status = 'queued'"),
      capturedPaymentAmount: scalar("SELECT COALESCE(SUM(amount), 0) AS value FROM payment_intents WHERE status = 'captured'"),
      openQualityFlags: scalar("SELECT COUNT(*) AS value FROM professional_quality_flags WHERE status = 'open'"),
      openSafetyIncidents: scalar("SELECT COUNT(*) AS value FROM safety_incidents WHERE status = 'open'"),
      openContentReports: scalar("SELECT COUNT(*) AS value FROM content_reports WHERE status = 'open'"),
    };
  }

  getPlatformSettings(): ApiAdminPlatformSettings {
    return readPlatformSettings(this.database);
  }

  listProfessionalApplications(
    status?: ApiProfessionalApplication['status'],
  ): ReadonlyArray<ApiAdminProfessionalApplication> {
    const rows = (status
      ? this.database.prepare(`
          SELECT user_id FROM professional_applications
          WHERE status = ?
          ORDER BY submitted_at
        `).all(status)
      : this.database.prepare(`
          SELECT user_id FROM professional_applications ORDER BY submitted_at DESC
        `).all()
    ) as unknown as Array<{ user_id: string }>;
    return rows.flatMap((row) => {
      const application = readProfessionalApplication(this.database, row.user_id);
      if (!application) return [];
      const user = this.database.prepare(`
        SELECT phone_number FROM users WHERE id = ?
      `).get(row.user_id) as unknown as { phone_number: string | null } | undefined;
      return [{
        userId: row.user_id,
        phoneNumber: user?.phone_number ?? null,
        application,
      }];
    });
  }

  listProfessionals(): ReadonlyArray<ApiAdminProfessional> {
    return readAdminProfessionals(this.database);
  }

  listBookings(
    filters: AdminBookingFilters,
    limit: number,
  ): ReadonlyArray<ApiAdminBooking> {
    const conditions: string[] = [];
    const parameters: Array<string | number> = [];
    if (filters.query) {
      conditions.push(`(
        lower(bookings.id) LIKE ? OR lower(clients.full_name) LIKE ? OR
        lower(professionals.display_name) LIKE ? OR lower(bookings.service_name) LIKE ?
      )`);
      const query = `%${filters.query.trim().toLowerCase()}%`;
      parameters.push(query, query, query, query);
    }
    if (filters.status) {
      conditions.push('bookings.status = ?');
      parameters.push(filters.status);
    }
    if (filters.dateFrom) {
      conditions.push('bookings.date_iso >= ?');
      parameters.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      conditions.push('bookings.date_iso <= ?');
      parameters.push(filters.dateTo);
    }
    if (filters.professionalId) {
      conditions.push('bookings.professional_id = ?');
      parameters.push(filters.professionalId);
    }
    const rows = this.database.prepare(`
      SELECT bookings.*, clients.full_name AS client_name,
        professionals.display_name AS professional_name,
        booking_reviews.id AS review_id,
        booking_reviews.technique_rating,
        booking_reviews.professionalism_rating,
        booking_reviews.tags_json AS review_tags_json,
        booking_reviews.review_text,
        booking_reviews.created_at AS review_created_at
      FROM bookings
      JOIN users clients ON clients.id = bookings.client_id
      JOIN professionals ON professionals.id = bookings.professional_id
      LEFT JOIN booking_reviews ON booking_reviews.booking_id = bookings.id
      ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
      ORDER BY bookings.created_at DESC
      LIMIT ?
    `).all(...parameters, limit) as unknown as Array<
      BookingRow & { client_name: string; professional_name: string }
    >;
    return rows.map((row) => ({
      ...toApiBooking(row, this.database),
      clientName: row.client_name,
      professionalName: row.professional_name,
    }));
  }

  listPayouts(): ReadonlyArray<ApiPayoutBatch> {
    const rows = this.database.prepare(`
      SELECT * FROM payout_batches ORDER BY created_at DESC
    `).all() as unknown as PayoutRow[];
    return rows.map(toApiPayoutBatch);
  }

  listPendingPayouts(): ReadonlyArray<ApiAdminPendingPayout> {
    const rows = this.database.prepare(`
      SELECT earning.professional_id, professional.display_name, application.payout_method_json,
        SUM(earning.net_amount) AS amount, COUNT(*) AS booking_count, MIN(earning.created_at) AS oldest_earning_at
      FROM professional_earnings earning
      JOIN professionals professional ON professional.id = earning.professional_id
      LEFT JOIN professional_applications application ON application.user_id = earning.professional_id
      WHERE earning.payout_id IS NULL
      GROUP BY earning.professional_id
      ORDER BY oldest_earning_at, earning.professional_id
    `).all() as unknown as Array<{
      professional_id: string; display_name: string; payout_method_json: string | null;
      amount: number; booking_count: number; oldest_earning_at: string;
    }>;
    return rows.map((row) => ({
      professionalId: row.professional_id,
      displayName: row.display_name,
      amount: row.amount,
      bookingCount: row.booking_count,
      oldestEarningAt: row.oldest_earning_at,
      payoutMethod: parsePayoutMethod(row.payout_method_json),
    }));
  }

  listRevenueRows(): ReadonlyArray<AdminRevenueRow> {
    const rows = this.database.prepare(`
      SELECT bookings.id AS booking_id, bookings.created_at,
        payment_intents.status AS payment_status,
        payment_intents.amount AS gross_amount,
        payment_intents.refunded_amount,
        COALESCE(professional_earnings.commission_amount, 0) AS commission_amount,
        COALESCE(professional_earnings.net_amount, 0) AS professional_payable
      FROM bookings
      JOIN payment_intents ON payment_intents.booking_id = bookings.id
      LEFT JOIN professional_earnings ON professional_earnings.booking_id = bookings.id
      ORDER BY bookings.created_at DESC
    `).all() as unknown as Array<{
      booking_id: string;
      created_at: string;
      payment_status: AdminRevenueRow['paymentStatus'];
      gross_amount: number;
      refunded_amount: number;
      commission_amount: number;
      professional_payable: number;
    }>;
    return rows.map((row) => ({
      bookingId: row.booking_id,
      createdAt: row.created_at,
      paymentStatus: row.payment_status,
      grossAmount: row.gross_amount,
      refundedAmount: row.refunded_amount,
      netCollected: row.gross_amount - row.refunded_amount,
      commissionAmount: row.commission_amount,
      professionalPayable: row.professional_payable,
    }));
  }

  listAuditLogs(limit: number): ReadonlyArray<ApiAdminAuditLog> {
    const rows = this.database.prepare(`
      SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT ?
    `).all(limit) as unknown as Array<{
      id: string;
      admin_id: string;
      action: string;
      target_type: string;
      target_id: string | null;
      metadata_json: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      adminId: row.admin_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
      createdAt: row.created_at,
    }));
  }

  listZones(): ReadonlyArray<ApiAdminZone> {
    const rows = this.database.prepare(`
      SELECT * FROM service_zones ORDER BY label
    `).all() as unknown as Array<{
      id: string;
      label: string;
      travel_fee: number;
      active: number;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      travelFee: row.travel_fee,
      active: row.active === 1,
      updatedAt: row.updated_at,
    }));
  }

  listDisputes(): ReadonlyArray<ApiBookingDispute> {
    const rows = this.database.prepare(`
      SELECT * FROM booking_disputes ORDER BY created_at DESC
    `).all() as unknown as BookingDisputeRow[];
    return rows.map(toApiBookingDispute);
  }

  listQualityFlags(): ReadonlyArray<ApiProfessionalQualityFlag> {
    const rows = this.database.prepare(`
      SELECT flags.*, professionals.display_name AS professional_name
      FROM professional_quality_flags flags
      JOIN professionals ON professionals.id = flags.professional_id
      ORDER BY flags.created_at DESC
    `).all() as unknown as ProfessionalQualityFlagRow[];
    return rows.map(toApiProfessionalQualityFlag);
  }

  listSafetyIncidents(): ReadonlyArray<ApiSafetyIncident> {
    const rows = this.database.prepare(`
      SELECT * FROM safety_incidents ORDER BY created_at DESC
    `).all() as unknown as SafetyIncidentRow[];
    return rows.map(toApiSafetyIncident);
  }

  listContentReports(): ReadonlyArray<ApiContentReport> {
    const rows = this.database.prepare(`
      SELECT report.*, professional.display_name AS professional_name
      FROM content_reports report
      JOIN professionals professional ON professional.id = report.professional_id
      ORDER BY report.created_at DESC
    `).all() as unknown as ContentReportRow[];
    return rows.map(toApiContentReport);
  }

  listBroadcasts(): ReadonlyArray<ApiAdminBroadcast> {
    const rows = this.database.prepare(`
      SELECT * FROM admin_broadcasts ORDER BY created_at DESC
    `).all() as unknown as Array<{
      id: string;
      audience: ApiAdminBroadcast['audience'];
      message: string;
      recipient_count: number;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      audience: row.audience,
      message: row.message,
      recipientCount: row.recipient_count,
      createdAt: row.created_at,
    }));
  }
}
