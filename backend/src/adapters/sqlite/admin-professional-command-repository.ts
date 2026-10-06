import type { DatabaseSync } from 'node:sqlite';

import type { ApiProfessionalService } from '../../../../shared/api-contracts.ts';
import type {
  AdminCommandContext,
  DevelopmentApproveProfessionalApplicationStoreInput,
  ReviewProfessionalApplicationStoreInput,
  SetAdminProfessionalStateStoreInput,
  UpdateAdminProfessionalStoreInput,
} from '../../application/contracts.ts';
import type { AdminProfessionalCommandStore } from '../../application/ports.ts';
import { domainEventTypes } from '../../domain/events.ts';
import { readAdminProfessional, readProfessionalApplication } from './professional-records.ts';
import type { SqliteDomainEventOutbox } from './domain-event-outbox.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqliteAdminProfessionalCommandRepository implements AdminProfessionalCommandStore {
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

  approveForDevelopment(input: DevelopmentApproveProfessionalApplicationStoreInput) {
    return this.unitOfWork.run(() => {
      const application = readProfessionalApplication(this.database, input.professionalId);
      if (!application || application.status !== 'pending') {
        return this.unitOfWork.abort(null);
      }
      const updated = this.database.prepare(`
        UPDATE professional_applications SET status = 'approved', updated_at = ?
        WHERE user_id = ? AND status = 'pending'
      `).run(input.occurredAt, input.professionalId);
      if (updated.changes !== 1) {
        return this.unitOfWork.abort(null);
      }
      this.publishApprovedProfessional(input.professionalId, application, input.occurredAt);
      this.enqueueApprovalEvent(input.professionalId, application.id, input.occurredAt);
      const approved = readProfessionalApplication(this.database, input.professionalId);
      return approved;
    });
  }

  reviewApplication(input: ReviewProfessionalApplicationStoreInput) {
    return this.unitOfWork.run(() => {
      const application = readProfessionalApplication(this.database, input.professionalId);
      if (!application || application.status !== 'pending') {
        return this.unitOfWork.abort(null);
      }

      const status = input.action === 'approve'
        ? 'approved'
        : input.action === 'reject'
          ? 'rejected'
          : 'changes_requested';
      const updated = this.database.prepare(`
        UPDATE professional_applications SET status = ?, updated_at = ?
        WHERE user_id = ? AND status = 'pending'
      `).run(status, input.occurredAt, input.professionalId);
      if (updated.changes !== 1) {
        return this.unitOfWork.abort(null);
      }

      if (input.action === 'approve') {
        this.publishApprovedProfessional(input.professionalId, application, input.occurredAt);
        this.enqueueApprovalEvent(input.professionalId, application.id, input.occurredAt);
      }
      this.insertAudit(
        input,
        input.action === 'approve'
          ? 'professional_application.approved'
          : input.action === 'reject'
            ? 'professional_application.rejected'
            : 'professional_application.changes_requested',
        'professional_application',
        input.professionalId,
        { applicationId: application.id },
      );
      const reviewed = readProfessionalApplication(this.database, input.professionalId);
      return reviewed;
    });
  }

  updateProfessional(input: UpdateAdminProfessionalStoreInput) {
    return this.unitOfWork.run(() => {
      const result = this.database.prepare(`
        UPDATE professionals SET featured = ?, female_only_eligible = ? WHERE id = ?
      `).run(input.featured ? 1 : 0, input.femaleOnlyEligible ? 1 : 0, input.professionalId);
      if (result.changes !== 1) {
        return this.unitOfWork.abort(null);
      }
      this.insertAudit(input, 'professional.updated', 'professional', input.professionalId, {
        featured: input.featured,
        femaleOnlyEligible: input.femaleOnlyEligible,
      });
      const professional = readAdminProfessional(this.database, input.professionalId);
      return professional;
    });
  }

  setProfessionalState(input: SetAdminProfessionalStateStoreInput) {
    return this.unitOfWork.run(() => {
      const suspended = input.action === 'suspend';
      const result = this.database.prepare('UPDATE professionals SET suspended = ? WHERE id = ?')
        .run(suspended ? 1 : 0, input.professionalId);
      if (result.changes !== 1) {
        return this.unitOfWork.abort(null);
      }
      this.database.prepare(`
        UPDATE professional_applications SET status = ?, updated_at = ? WHERE user_id = ?
      `).run(suspended ? 'suspended' : 'approved', input.occurredAt, input.professionalId);
      this.insertAudit(
        input,
        suspended ? 'professional.suspended' : 'professional.restored',
        'professional',
        input.professionalId,
        {},
      );
      const professional = readAdminProfessional(this.database, input.professionalId);
      return professional;
    });
  }

  private publishApprovedProfessional(
    professionalId: string,
    application: NonNullable<ReturnType<typeof readProfessionalApplication>>,
    occurredAt: string,
  ): void {
    const services: ApiProfessionalService[] = application.services.map((service) => ({
      id: service.id,
      name: service.name,
      price: service.price,
      durationMinutes: service.durationMinutes,
    }));
    this.database.prepare(`
      INSERT INTO professionals (
        id, display_name, specialty, base_zone, services_json, category, bio,
        years_experience, education_level, gender, languages_json, language_skills_json, featured
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        specialty = excluded.specialty,
        base_zone = excluded.base_zone,
        services_json = excluded.services_json,
        category = excluded.category,
        bio = excluded.bio,
        years_experience = excluded.years_experience,
        education_level = excluded.education_level,
        gender = excluded.gender,
        languages_json = excluded.languages_json,
        language_skills_json = excluded.language_skills_json
    `).run(
      professionalId,
      application.profile.displayName,
      application.profile.specialty,
      application.profile.baseZone,
      JSON.stringify(services),
      application.services[0]?.category.toLowerCase().split(' ')[0] ?? application.profile.specialty.toLowerCase(),
      application.profile.bio,
      Number(application.profile.yearsExperience),
      application.profile.educationLevel ?? 'secondary',
      application.profile.gender ?? 'unspecified',
      JSON.stringify(application.profile.languages),
      JSON.stringify(application.profile.languageSkills),
    );
    this.database.prepare('DELETE FROM professional_catalog_working_days WHERE professional_id = ?')
      .run(professionalId);
    const insertWorkingDay = this.database.prepare(`
      INSERT INTO professional_catalog_working_days (professional_id, day, hours, enabled) VALUES (?, ?, ?, ?)
    `);
    for (const day of application.workingDays) {
      insertWorkingDay.run(professionalId, day.day, day.hours, day.enabled ? 1 : 0);
    }
    this.database.prepare('DELETE FROM professional_catalog_zones WHERE professional_id = ?').run(professionalId);
    const insertZone = this.database.prepare(`
      INSERT INTO professional_catalog_zones (professional_id, zone) VALUES (?, ?)
    `);
    for (const zone of application.travelZones.filter((item) => item.active)) {
      insertZone.run(professionalId, zone.label);
    }
    this.database.prepare(`
      INSERT OR IGNORE INTO professional_availability (professional_id, available, updated_at)
      VALUES (?, 0, ?)
    `).run(professionalId, occurredAt);
  }

  private enqueueApprovalEvent(
    professionalId: string,
    applicationId: string,
    occurredAt: string,
  ): void {
    this.domainEvents.enqueue({
      eventType: domainEventTypes.professionalApproved,
      schemaVersion: 1,
      aggregateType: 'professional',
      aggregateId: professionalId,
      aggregateVersion: 2,
      occurredAt,
      correlationId: applicationId,
      causationId: null,
      payload: { professionalId, applicationId },
    });
  }

  private insertAudit(
    context: AdminCommandContext,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ): void {
    this.database.prepare(`
      INSERT INTO admin_audit_logs (
        id, admin_id, action, target_type, target_id, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      context.auditId,
      context.adminId,
      action,
      targetType,
      targetId,
      JSON.stringify(metadata),
      context.occurredAt,
    );
  }
}
