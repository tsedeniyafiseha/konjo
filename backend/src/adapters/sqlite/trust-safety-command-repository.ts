import type { DatabaseSync } from 'node:sqlite';

import type {
  OpenBookingDisputeStoreInput,
  OpenSafetyIncidentResult,
  OpenSafetyIncidentStoreInput,
  CreateContentReportResult,
  CreateContentReportStoreInput,
  ResolveContentReportStoreInput,
  SetProfessionalBlockStoreInput,
  ResolveBookingDisputeStoreInput,
  ResolveQualityFlagStoreInput,
  ResolveSafetyIncidentStoreInput,
  TrustSafetyResolutionResult,
} from '../../application/contracts.ts';
import type { TrustSafetyCommandStore } from '../../application/ports.ts';
import { domainEventTypes } from '../../domain/events.ts';
import type { BookingRow } from './booking-records.ts';
import type { SqliteDomainEventOutbox } from './domain-event-outbox.ts';
import {
  type BookingDisputeRow,
  type ProfessionalQualityFlagRow,
  type SafetyIncidentRow,
  type ContentReportRow,
  toApiBookingDispute,
  toApiProfessionalQualityFlag,
  toApiSafetyIncident,
  toApiContentReport,
} from './trust-safety-records.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqliteTrustSafetyCommandRepository implements TrustSafetyCommandStore {
  private readonly database: DatabaseSync;
  private readonly domainEvents: SqliteDomainEventOutbox;
  private readonly unitOfWork: SqliteUnitOfWork;

  constructor(
    database: DatabaseSync,
    domainEvents: SqliteDomainEventOutbox,
    unitOfWork = new SqliteUnitOfWork(database),
  ) {
    this.database = database;
    this.domainEvents = domainEvents;
    this.unitOfWork = unitOfWork;
  }

  openSafetyIncident(input: OpenSafetyIncidentStoreInput): OpenSafetyIncidentResult {
    return this.unitOfWork.run(() => {
      const booking = this.database.prepare('SELECT * FROM bookings WHERE id = ?')
        .get(input.bookingId) as unknown as BookingRow | undefined;
      if (!booking) return { result: 'not_found' };
      const participant = input.role === 'client'
        ? booking.client_id === input.userId
        : booking.professional_id === input.userId;
      if (!participant) return { result: 'not_found' };
      if (!['accepted', 'on_the_way', 'in_progress'].includes(booking.status)) {
        return { result: 'not_active' };
      }
      const existing = this.database.prepare(`
        SELECT * FROM safety_incidents
        WHERE booking_id = ? AND reported_by_id = ? AND status = 'open'
        ORDER BY created_at DESC LIMIT 1
      `).get(input.bookingId, input.userId) as unknown as SafetyIncidentRow | undefined;
      if (existing) {
        return { result: 'existing', incident: toApiSafetyIncident(existing) };
      }

      this.database.prepare(`
        INSERT INTO safety_incidents (
          id, booking_id, reported_by_id, reported_by_role, latitude, longitude,
          accuracy_meters, status, resolution, created_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', '', ?, NULL)
      `).run(
        input.incidentId,
        input.bookingId,
        input.userId,
        input.role,
        input.latitude,
        input.longitude,
        input.accuracyMeters,
        input.occurredAt,
      );
      const counterpartId = input.role === 'client' ? booking.professional_id : booking.client_id;
      this.domainEvents.enqueue({
        eventType: domainEventTypes.safetyIncidentOpened,
        schemaVersion: 1,
        aggregateType: 'safety_incident',
        aggregateId: input.incidentId,
        aggregateVersion: 1,
        occurredAt: input.occurredAt,
        correlationId: booking.client_request_id ?? booking.id,
        causationId: `${input.role}:${input.userId}:sos`,
        payload: {
          bookingId: input.bookingId,
          incidentId: input.incidentId,
          reportedById: input.userId,
          reportedByRole: input.role,
          counterpartId,
          coordinatesAvailable: input.latitude !== null && input.longitude !== null,
        },
      });
      const row = this.database.prepare('SELECT * FROM safety_incidents WHERE id = ?')
        .get(input.incidentId) as unknown as SafetyIncidentRow;
      return { result: 'created', incident: toApiSafetyIncident(row) };
    });
  }

  createContentReport(input: CreateContentReportStoreInput): CreateContentReportResult {
    return this.unitOfWork.run(() => {
      const reporter = this.database.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'client'")
        .get(input.reportedById);
      if (!reporter) return { result: 'not_found' };
      const target = input.targetType === 'professional'
        ? this.database.prepare('SELECT id AS professional_id FROM professionals WHERE id = ?').get(input.targetId)
        : this.database.prepare('SELECT professional_id FROM booking_reviews WHERE id = ? AND visible = 1').get(input.targetId);
      const professionalId = (target as { professional_id?: string } | undefined)?.professional_id;
      if (!professionalId) return { result: 'not_found' };
      const existing = this.contentReport(
        "WHERE report.reported_by_id = ? AND report.target_type = ? AND report.target_id = ? AND report.status = 'open'",
        input.reportedById,
        input.targetType,
        input.targetId,
      );
      if (existing) return { result: 'existing', report: toApiContentReport(existing) };
      this.database.prepare(`
        INSERT INTO content_reports (
          id, reported_by_id, target_type, target_id, professional_id, reason,
          details, status, resolution, created_at, resolved_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', '', ?, NULL)
      `).run(
        input.reportId,
        input.reportedById,
        input.targetType,
        input.targetId,
        professionalId,
        input.reason,
        input.details,
        input.occurredAt,
      );
      return { result: 'created', report: toApiContentReport(this.contentReport('WHERE report.id = ?', input.reportId)!) };
    });
  }

  listBlockedProfessionals(clientId: string): ReadonlyArray<string> {
    return (this.database.prepare(`
      SELECT professional_id FROM professional_blocks WHERE client_id = ? ORDER BY created_at
    `).all(clientId) as unknown as Array<{ professional_id: string }>).map((row) => row.professional_id);
  }

  setProfessionalBlocked(input: SetProfessionalBlockStoreInput): boolean {
    const client = this.database.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'client'").get(input.clientId);
    const professional = this.database.prepare('SELECT 1 FROM professionals WHERE id = ?').get(input.professionalId);
    if (!client || !professional) return false;
    if (input.blocked) {
      this.database.prepare(`
        INSERT INTO professional_blocks (client_id, professional_id, created_at)
        VALUES (?, ?, ?) ON CONFLICT(client_id, professional_id) DO NOTHING
      `).run(input.clientId, input.professionalId, input.occurredAt);
    } else {
      this.database.prepare('DELETE FROM professional_blocks WHERE client_id = ? AND professional_id = ?')
        .run(input.clientId, input.professionalId);
    }
    return true;
  }

  openBookingDispute(input: OpenBookingDisputeStoreInput): TrustSafetyResolutionResult['dispute'] | null {
    return this.unitOfWork.run(() => {
      const booking = this.database.prepare('SELECT id FROM bookings WHERE id = ? AND client_id = ?')
        .get(input.bookingId, input.clientId);
      if (!booking) return null;
      const existing = this.database.prepare('SELECT id FROM booking_disputes WHERE booking_id = ?')
        .get(input.bookingId);
      if (existing) return null;
      this.database.prepare(`
        INSERT INTO booking_disputes (
          id, booking_id, client_id, reason, status, resolution, created_at, resolved_at
        ) VALUES (?, ?, ?, ?, 'open', '', ?, NULL)
      `).run(input.disputeId, input.bookingId, input.clientId, input.reason, input.occurredAt);
      const row = this.database.prepare('SELECT * FROM booking_disputes WHERE id = ?')
        .get(input.disputeId) as unknown as BookingDisputeRow;
      return toApiBookingDispute(row);
    });
  }

  resolveSafetyIncident(input: ResolveSafetyIncidentStoreInput): TrustSafetyResolutionResult['safetyIncident'] | null {
    return this.unitOfWork.run(() => {
      const incident = this.database.prepare("SELECT * FROM safety_incidents WHERE id = ? AND status = 'open'")
        .get(input.incidentId) as unknown as SafetyIncidentRow | undefined;
      if (!incident) return null;
      this.database.prepare(`
        UPDATE safety_incidents SET status = 'resolved', resolution = ?, resolved_at = ?
        WHERE id = ? AND status = 'open'
      `).run(input.resolution, input.occurredAt, input.incidentId);
      this.insertAudit(
        input.auditId,
        input.adminId,
        'safety_incident.resolved',
        'safety_incident',
        input.incidentId,
        { bookingId: incident.booking_id, reportedByRole: incident.reported_by_role },
        input.occurredAt,
      );
      const row = this.database.prepare('SELECT * FROM safety_incidents WHERE id = ?')
        .get(input.incidentId) as unknown as SafetyIncidentRow;
      return toApiSafetyIncident(row);
    });
  }

  resolveQualityFlag(input: ResolveQualityFlagStoreInput): TrustSafetyResolutionResult['qualityFlag'] | null {
    return this.unitOfWork.run(() => {
      const flag = this.database.prepare(`
        SELECT flags.*, professionals.display_name AS professional_name
        FROM professional_quality_flags flags
        JOIN professionals ON professionals.id = flags.professional_id
        WHERE flags.id = ? AND flags.status = 'open'
      `).get(input.flagId) as unknown as ProfessionalQualityFlagRow | undefined;
      if (!flag) return null;
      this.database.prepare(`
        UPDATE professional_quality_flags
        SET status = 'resolved', resolution = ?, resolved_at = ?
        WHERE id = ? AND status = 'open'
      `).run(input.resolution, input.occurredAt, input.flagId);
      if (input.action === 'restore') {
        const remaining = this.database.prepare(`
          SELECT COUNT(*) AS count FROM professional_quality_flags
          WHERE professional_id = ? AND status = 'open'
        `).get(flag.professional_id) as unknown as { count: number };
        if (remaining.count === 0) {
          this.database.prepare('UPDATE professionals SET hidden = 0 WHERE id = ?').run(flag.professional_id);
        }
      }
      this.insertAudit(
        input.auditId,
        input.adminId,
        'professional_quality_flag.resolved',
        'professional_quality_flag',
        input.flagId,
        { professionalId: flag.professional_id, bookingId: flag.booking_id, action: input.action },
        input.occurredAt,
      );
      const row = this.database.prepare(`
        SELECT flags.*, professionals.display_name AS professional_name
        FROM professional_quality_flags flags
        JOIN professionals ON professionals.id = flags.professional_id
        WHERE flags.id = ?
      `).get(input.flagId) as unknown as ProfessionalQualityFlagRow;
      return toApiProfessionalQualityFlag(row);
    });
  }

  resolveBookingDispute(input: ResolveBookingDisputeStoreInput): TrustSafetyResolutionResult['dispute'] | null {
    return this.unitOfWork.run(() => {
      const dispute = this.database.prepare("SELECT * FROM booking_disputes WHERE id = ? AND status = 'open'")
        .get(input.disputeId) as unknown as BookingDisputeRow | undefined;
      if (!dispute) return null;
      this.database.prepare(`
        UPDATE booking_disputes SET status = ?, resolution = ?, resolved_at = ?
        WHERE id = ? AND status = 'open'
      `).run(input.status, input.resolution, input.occurredAt, input.disputeId);
      this.insertAudit(
        input.auditId,
        input.adminId,
        'dispute.resolved',
        'booking_dispute',
        input.disputeId,
        { status: input.status },
        input.occurredAt,
      );
      const row = this.database.prepare('SELECT * FROM booking_disputes WHERE id = ?')
        .get(input.disputeId) as unknown as BookingDisputeRow;
      return toApiBookingDispute(row);
    });
  }

  resolveContentReport(input: ResolveContentReportStoreInput): TrustSafetyResolutionResult['contentReport'] | null {
    return this.unitOfWork.run(() => {
      const report = this.contentReport("WHERE report.id = ? AND report.status = 'open'", input.reportId);
      if (!report) return null;
      if (input.action === 'hide_review') {
        if (report.target_type !== 'review') return null;
        this.database.prepare('UPDATE booking_reviews SET visible = 0 WHERE id = ?').run(report.target_id);
      }
      if (input.action === 'suspend_professional') {
        this.database.prepare('UPDATE professionals SET suspended = 1, hidden = 1 WHERE id = ?').run(report.professional_id);
      }
      this.database.prepare(`
        UPDATE content_reports SET status = ?, resolution = ?, resolved_at = ?
        WHERE id = ? AND status = 'open'
      `).run(input.status, input.resolution, input.occurredAt, input.reportId);
      this.insertAudit(
        input.auditId,
        input.adminId,
        'content_report.resolved',
        'content_report',
        input.reportId,
        { status: input.status, action: input.action, targetType: report.target_type, targetId: report.target_id },
        input.occurredAt,
      );
      return toApiContentReport(this.contentReport('WHERE report.id = ?', input.reportId)!);
    });
  }

  private contentReport(where: string, ...parameters: string[]): ContentReportRow | null {
    return (this.database.prepare(`
      SELECT report.*, professional.display_name AS professional_name
      FROM content_reports report
      JOIN professionals professional ON professional.id = report.professional_id
      ${where}
      LIMIT 1
    `).get(...parameters) as unknown as ContentReportRow | undefined) ?? null;
  }

  private insertAudit(
    auditId: string,
    adminId: string,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
    occurredAt: string,
  ): void {
    this.database.prepare(`
      INSERT INTO admin_audit_logs (
        id, admin_id, action, target_type, target_id, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(auditId, adminId, action, targetType, targetId, JSON.stringify(metadata), occurredAt);
  }

}
