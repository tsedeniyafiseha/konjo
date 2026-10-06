import type { DatabaseSync } from 'node:sqlite';
import type { SubmitProfessionalApplicationStoreInput } from '../../application/contracts.ts';
import type { ProfessionalApplicationCommandStore } from '../../application/ports.ts';
import { readProfessionalApplication } from './professional-records.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqliteProfessionalApplicationCommandRepository implements ProfessionalApplicationCommandStore {
  private readonly database: DatabaseSync;
  private readonly unitOfWork: SqliteUnitOfWork;
  constructor(database: DatabaseSync, unitOfWork = new SqliteUnitOfWork(database)) {
    this.database = database;
    this.unitOfWork = unitOfWork;
  }

  submitApplication(input: SubmitProfessionalApplicationStoreInput) {
    const existing = this.database.prepare('SELECT id, status FROM professional_applications WHERE user_id = ?').get(input.userId) as unknown as { id: string; status: string } | undefined;
    if (existing?.status === 'approved' || existing?.status === 'pending') return { result: 'not_editable' as const };
    const applicationId = existing?.id ?? input.applicationId;
    const application = input.application;
    return this.unitOfWork.run(() => {
      this.database.prepare(`INSERT INTO professional_applications (id, user_id, preferred_language, legal_name, display_name, email, specialty, bio, years_experience, education_level, gender, payout_method_json, languages_json, language_skills_json, base_zone, portfolio_count, credential_added, same_day_bookings, terms_accepted, status, submitted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, 'pending', ?, ?) ON CONFLICT(user_id) DO UPDATE SET preferred_language = excluded.preferred_language, legal_name = excluded.legal_name, display_name = excluded.display_name, email = excluded.email, specialty = excluded.specialty, bio = excluded.bio, years_experience = excluded.years_experience, education_level = excluded.education_level, gender = excluded.gender, payout_method_json = excluded.payout_method_json, languages_json = excluded.languages_json, language_skills_json = excluded.language_skills_json, base_zone = excluded.base_zone, portfolio_count = excluded.portfolio_count, same_day_bookings = excluded.same_day_bookings, terms_accepted = 1, status = 'pending', submitted_at = excluded.submitted_at, updated_at = excluded.updated_at`)
        .run(applicationId, input.userId, application.preferredLanguage, application.profile.legalName, application.profile.displayName, application.profile.email, application.profile.specialty, application.profile.bio, application.profile.yearsExperience, application.profile.educationLevel, application.profile.gender, JSON.stringify(application.profile.payoutMethod), JSON.stringify(application.profile.languageSkills.map((skill) => skill.language)), JSON.stringify(application.profile.languageSkills), application.profile.baseZone, application.profile.portfolioCount, application.sameDayBookings ? 1 : 0, input.submittedAt, input.occurredAt);
      this.database.prepare('DELETE FROM professional_application_services WHERE application_id = ?').run(applicationId);
      this.database.prepare('DELETE FROM professional_application_working_days WHERE application_id = ?').run(applicationId);
      this.database.prepare('DELETE FROM professional_application_travel_zones WHERE application_id = ?').run(applicationId);
      const addService = this.database.prepare('INSERT INTO professional_application_services (application_id, id, category, name, duration_minutes, price, note, popular) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      for (const service of application.services) addService.run(applicationId, service.id, service.category, service.name, service.durationMinutes, service.price, service.note, service.popular ? 1 : 0);
      const addDay = this.database.prepare('INSERT INTO professional_application_working_days (application_id, day, hours, enabled) VALUES (?, ?, ?, ?)');
      for (const day of application.workingDays) addDay.run(applicationId, day.day, day.hours, day.enabled ? 1 : 0);
      const addZone = this.database.prepare('INSERT INTO professional_application_travel_zones (application_id, id, label, active) VALUES (?, ?, ?, ?)');
      for (const zone of application.travelZones) addZone.run(applicationId, zone.id, zone.label, zone.active ? 1 : 0);
      const saved = readProfessionalApplication(this.database, input.userId);
      if (!saved) throw new Error('Submitted professional application could not be read.');
      return { result: 'submitted' as const, application: saved };
    });
  }
}
