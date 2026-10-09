import type {
  AdminBookingFilters,
  AdminProfessionalApplicationReadStore,
  AdminReadStore,
} from './ports.ts';
import type { ApiProfessionalApplication } from '../../../shared/api-contracts.ts';

export class ReadAdminModel {
  private readonly store: AdminReadStore;
  private readonly professionalApplications: AdminProfessionalApplicationReadStore;

  constructor(
    store: AdminReadStore,
    professionalApplications: AdminProfessionalApplicationReadStore = store,
  ) {
    this.store = store;
    this.professionalApplications = professionalApplications;
  }

  getSummary() {
    return this.store.getSummary();
  }

  getPlatformSettings() {
    return this.store.getPlatformSettings();
  }

  listProfessionalApplications(status?: ApiProfessionalApplication['status']) {
    return this.professionalApplications.listProfessionalApplications(status);
  }

  listProfessionals() {
    return this.store.listProfessionals();
  }

  listBookings(filters: AdminBookingFilters = {}, limit = 100) {
    return this.store.listBookings(filters, limit);
  }

  listPayouts() {
    return this.store.listPayouts();
  }

  listPendingPayouts() {
    return this.store.listPendingPayouts();
  }

  listRevenueRows() {
    return this.store.listRevenueRows();
  }

  listAuditLogs(limit = 100) {
    return this.store.listAuditLogs(limit);
  }

  listZones() {
    return this.store.listZones();
  }

  listDisputes() {
    return this.store.listDisputes();
  }

  listQualityFlags() {
    return this.store.listQualityFlags();
  }

  listSafetyIncidents() {
    return this.store.listSafetyIncidents();
  }

  listContentReports() {
    return this.store.listContentReports();
  }

  listBroadcasts() {
    return this.store.listBroadcasts();
  }
}
