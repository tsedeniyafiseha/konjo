import type { DatabaseSync } from 'node:sqlite';
import type { ApiProfessionalService } from '../../../../shared/api-contracts.ts';
import type { UpdateProfessionalCatalogStoreInput } from '../../application/contracts.ts';
import type { ProfessionalSelfServiceCommandStore } from '../../application/ports.ts';
import { readProfessionalApplication } from './professional-records.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqliteProfessionalSelfServiceCommandRepository implements ProfessionalSelfServiceCommandStore {
  private readonly database: DatabaseSync;
  private readonly unitOfWork: SqliteUnitOfWork;
  constructor(database: DatabaseSync, unitOfWork = new SqliteUnitOfWork(database)) {
    this.database = database;
    this.unitOfWork = unitOfWork;
  }

  updateCatalog(input: UpdateProfessionalCatalogStoreInput) {
    const application = this.database.prepare("SELECT id FROM professional_applications WHERE user_id = ? AND status = 'approved'").get(input.professionalId) as unknown as { id: string } | undefined;
    const professional = this.database.prepare('SELECT id FROM professionals WHERE id = ? AND hidden = 0 AND suspended = 0').get(input.professionalId);
    if (!application || !professional) return { result: 'not_found' as const };
    const invalidZone = input.settings.travelZones.some((zone) => zone.active && !this.database.prepare('SELECT id FROM service_zones WHERE lower(label) = lower(?) AND active = 1').get(zone.label));
    if (invalidZone) return { result: 'invalid_zone' as const };
    const publicServices: ApiProfessionalService[] = input.settings.services.map((service) => ({ id: service.id, name: service.name, price: service.price, durationMinutes: service.durationMinutes }));
    this.unitOfWork.run(() => {
      this.database.prepare('DELETE FROM professional_application_services WHERE application_id = ?').run(application.id);
      const addService = this.database.prepare('INSERT INTO professional_application_services (application_id, id, category, name, duration_minutes, price, note, popular) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      for (const service of input.settings.services) addService.run(application.id, service.id, service.category, service.name, service.durationMinutes, service.price, service.note, service.popular ? 1 : 0);
      this.database.prepare('DELETE FROM professional_application_working_days WHERE application_id = ?').run(application.id);
      this.database.prepare('DELETE FROM professional_catalog_working_days WHERE professional_id = ?').run(input.professionalId);
      const addApplicationDay = this.database.prepare('INSERT INTO professional_application_working_days (application_id, day, hours, enabled) VALUES (?, ?, ?, ?)');
      const addCatalogDay = this.database.prepare('INSERT INTO professional_catalog_working_days (professional_id, day, hours, enabled) VALUES (?, ?, ?, ?)');
      for (const day of input.settings.workingDays) { addApplicationDay.run(application.id, day.day, day.hours, day.enabled ? 1 : 0); addCatalogDay.run(input.professionalId, day.day, day.hours, day.enabled ? 1 : 0); }
      this.database.prepare('DELETE FROM professional_application_travel_zones WHERE application_id = ?').run(application.id);
      this.database.prepare('DELETE FROM professional_catalog_zones WHERE professional_id = ?').run(input.professionalId);
      const addApplicationZone = this.database.prepare('INSERT INTO professional_application_travel_zones (application_id, id, label, active) VALUES (?, ?, ?, ?)');
      const addCatalogZone = this.database.prepare('INSERT INTO professional_catalog_zones (professional_id, zone) VALUES (?, ?)');
      for (const zone of input.settings.travelZones) { addApplicationZone.run(application.id, zone.id, zone.label, zone.active ? 1 : 0); if (zone.active) addCatalogZone.run(input.professionalId, zone.label); }
      this.database.prepare('UPDATE professional_applications SET same_day_bookings = ?, updated_at = ? WHERE id = ?').run(input.settings.sameDayBookings ? 1 : 0, input.occurredAt, application.id);
      this.database.prepare('UPDATE professionals SET services_json = ? WHERE id = ?').run(JSON.stringify(publicServices), input.professionalId);
    });
    const updated = readProfessionalApplication(this.database, input.professionalId);
    if (!updated) return { result: 'not_found' as const };
    return { result: 'updated' as const, settings: { services: updated.services, workingDays: updated.workingDays, travelZones: updated.travelZones, sameDayBookings: updated.sameDayBookings } };
  }

  setAvailability(input: { professionalId: string; available: boolean; occurredAt: string }): boolean {
    const professional = this.database.prepare('SELECT id FROM professionals WHERE id = ? AND hidden = 0 AND suspended = 0').get(input.professionalId);
    if (!professional) return false;
    this.database.prepare('INSERT INTO professional_availability (professional_id, available, updated_at) VALUES (?, ?, ?) ON CONFLICT(professional_id) DO UPDATE SET available = excluded.available, updated_at = excluded.updated_at').run(input.professionalId, input.available ? 1 : 0, input.occurredAt);
    return true;
  }
}
