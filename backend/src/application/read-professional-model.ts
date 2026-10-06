import type {
  Clock,
  ProfessionalApplicationReadStore,
  ProfessionalAvailabilityReadStore,
  ProfessionalOperationsReadStore,
  ProfessionalReadStore,
} from './ports.ts';

const DASHBOARD_EARNINGS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export class ReadProfessionalModel {
  private readonly applicationStore: ProfessionalApplicationReadStore;
  private readonly availabilityStore: ProfessionalAvailabilityReadStore;
  private readonly operationsStore: ProfessionalOperationsReadStore;
  private readonly clock: Clock;

  constructor(
    store: ProfessionalReadStore,
    clock: Clock,
    applicationStore: ProfessionalApplicationReadStore = store,
    availabilityStore: ProfessionalAvailabilityReadStore = store,
    operationsStore: ProfessionalOperationsReadStore = store,
  ) {
    this.applicationStore = applicationStore;
    this.availabilityStore = availabilityStore;
    this.operationsStore = operationsStore;
    this.clock = clock;
  }

  getApplication(userId: string) {
    return this.applicationStore.getApplication(userId);
  }

  getDashboard(professionalId: string) {
    const earningsSince = new Date(
      this.clock.now().getTime() - DASHBOARD_EARNINGS_WINDOW_MS,
    ).toISOString();
    return this.operationsStore.getDashboard(professionalId, earningsSince);
  }

  getCatalogSettings(professionalId: string) {
    return this.operationsStore.getCatalogSettings(professionalId);
  }

  getAvailability(
    professionalId: string,
    dateIso: string,
    serviceId?: string,
    excludeBookingId?: string,
  ) {
    return this.availabilityStore.getProfessionalAvailability(
      professionalId,
      dateIso,
      serviceId,
      excludeBookingId,
    );
  }

  listPayouts(professionalId: string) {
    return this.operationsStore.listPayouts(professionalId);
  }
}
