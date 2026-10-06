import type {
  Clock,
  MarketplaceProfessionalFilters,
  MarketplaceReadStore,
} from './ports.ts';

export class ReadMarketplace {
  private readonly store: MarketplaceReadStore;
  private readonly clock: Clock;

  constructor(store: MarketplaceReadStore, clock: Clock) {
    this.store = store;
    this.clock = clock;
  }

  listProfessionals(filters: MarketplaceProfessionalFilters = {}) {
    const today = this.clock.now().toISOString().slice(0, 10);
    return this.store.listProfessionals(filters, today);
  }

  listServiceZones() {
    return this.store.listServiceZones();
  }

  listServiceCategories(activeOnly = true) {
    return this.store.listServiceCategories(activeOnly);
  }

  listPromotions() {
    return this.store.listPromotions();
  }

  findServiceZone(zone: string) {
    return this.store.findServiceZone(zone);
  }

  bookingRequiresClientIdentity(userId: string, professionalId: string) {
    return this.store.bookingRequiresClientIdentity(userId, professionalId);
  }

  listProfessionalReviews(professionalId: string, limit: number) {
    return this.store.listProfessionalReviews(professionalId, limit);
  }
}
