import type {
  ApiProfessionalAvailability,
  ApiProfessionalPortfolioItem,
  ApiProfessionalSummary,
  ApiServiceCategory,
  ApiProfessionalReview,
} from '../../../shared/api-contracts';
import type {
  Professional,
  ProfessionalAvailabilityInput,
  ProfessionalReview,
  ServiceCategory,
} from './discovery-contracts';

function relativeDayLabel(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function reviewFromApi(review: ApiProfessionalReview): ProfessionalReview {
  return {
    name: review.clientName,
    zone: review.tags.slice(0, 2).join(' · '),
    rating: review.averageRating.toFixed(1),
    text: review.reviewText,
    time: relativeDayLabel(review.createdAt),
    service: `Technique ${review.techniqueRating}/5 · Professionalism ${review.professionalismRating}/5`,
  };
}

export interface DiscoveryGateway {
  readonly configured: boolean;
  listProfessionals(): Promise<readonly ApiProfessionalSummary[]>;
  listCategories(): Promise<readonly ApiServiceCategory[]>;
  getAvailability(input: ProfessionalAvailabilityInput): Promise<ApiProfessionalAvailability>;
  listPortfolio(professionalId: string): Promise<readonly ApiProfessionalPortfolioItem[]>;
  listReviews(professionalId: string): Promise<readonly ApiProfessionalReview[]>;
}

export interface DiscoveryFallbackCatalog {
  professionals: readonly Professional[];
  categories: readonly ServiceCategory[];
  timeSlots: readonly string[];
}

export interface DiscoveryControllerLogger {
  error(message: string, error: unknown): void;
}

export interface DiscoverySnapshot {
  professionals: readonly Professional[];
  categories: readonly ServiceCategory[];
  loading: boolean;
}

type DiscoveryListener = () => void;

const INITIAL_RETRY_DELAY_MS = 5_000;

export interface DiscoveryControllerOptions {
  /** Delay before the first automatic retry after a failed catalog load. */
  retryDelayMs?: number;
  blockedProfessionalsStorage?: BlockedProfessionalsStorage;
}

export interface BlockedProfessionalsStorage {
  read(): Promise<readonly string[]>;
  write(professionalIds: readonly string[]): Promise<void>;
}
const MAX_RETRY_DELAY_MS = 60_000;

const silentLogger: DiscoveryControllerLogger = {
  error() {},
};

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export class DiscoveryController {
  private snapshot: DiscoverySnapshot;
  private readonly listeners = new Set<DiscoveryListener>();
  private readonly gateway: DiscoveryGateway;
  private readonly fallback: DiscoveryFallbackCatalog;
  private readonly logger: DiscoveryControllerLogger;
  private refreshPromise: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly initialRetryDelayMs: number;
  private retryDelayMs: number;
  private readonly blockedProfessionalsStorage: BlockedProfessionalsStorage | null;
  private readonly blockedProfessionalIds = new Set<string>();
  private blockedProfessionalsLoaded = false;

  constructor(
    gateway: DiscoveryGateway,
    fallback: DiscoveryFallbackCatalog,
    logger: DiscoveryControllerLogger = silentLogger,
    options: DiscoveryControllerOptions = {},
  ) {
    this.gateway = gateway;
    this.fallback = fallback;
    this.logger = logger;
    this.initialRetryDelayMs = options.retryDelayMs ?? INITIAL_RETRY_DELAY_MS;
    this.retryDelayMs = this.initialRetryDelayMs;
    this.blockedProfessionalsStorage = options.blockedProfessionalsStorage ?? null;
    this.snapshot = {
      professionals: fallback.professionals,
      categories: fallback.categories,
      loading: gateway.configured,
    };
  }

  readonly getSnapshot = (): DiscoverySnapshot => this.snapshot;

  readonly subscribe = (listener: DiscoveryListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getProfessional(professionalId: string | undefined): Professional | undefined {
    if (!professionalId || this.blockedProfessionalIds.has(professionalId)) return undefined;
    return this.snapshot.professionals.find((professional) => professional.id === professionalId);
  }

  refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;

    if (!this.blockedProfessionalsStorage) {
      if (!this.gateway.configured) return Promise.resolve();
      this.publish({ ...this.snapshot, loading: true });
      this.refreshPromise = this.loadCatalog().finally(() => {
        this.refreshPromise = null;
      });
      return this.refreshPromise;
    }

    if (this.gateway.configured) this.publish({ ...this.snapshot, loading: true });
    this.refreshPromise = this.loadBlockedProfessionalsAndCatalog().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async blockProfessional(professionalId: string): Promise<void> {
    if (!professionalId || this.blockedProfessionalIds.has(professionalId)) return;
    this.blockedProfessionalIds.add(professionalId);
    this.publish({
      ...this.snapshot,
      professionals: this.snapshot.professionals.filter((professional) => professional.id !== professionalId),
    });
    try {
      await this.blockedProfessionalsStorage?.write([...this.blockedProfessionalIds]);
    } catch (error) {
      this.logger.error('Unable to persist the blocked professional.', error);
    }
  }

  async getAvailableSlots(input: ProfessionalAvailabilityInput): Promise<readonly string[]> {
    if (!this.gateway.configured) return this.fallback.timeSlots;
    const availability = await this.gateway.getAvailability(input);
    return availability.slots;
  }

  /** Published client reviews for a profile, newest first; empty when the API is not configured. */
  async loadReviews(professionalId: string): Promise<readonly ProfessionalReview[]> {
    if (!this.gateway.configured) return this.snapshot.professionals.find((professional) => professional.id === professionalId)?.reviewsList ?? [];
    try {
      const reviews = await this.gateway.listReviews(professionalId);
      const list = reviews.map((review) => reviewFromApi(review));
      this.publish({
        ...this.snapshot,
        professionals: this.snapshot.professionals.map((professional) => professional.id === professionalId ? { ...professional, reviewsList: list } : professional),
      });
      return list;
    } catch (error) {
      this.logger.error('Unable to load professional reviews.', error);
      return this.snapshot.professionals.find((professional) => professional.id === professionalId)?.reviewsList ?? [];
    }
  }

  async loadPortfolio(professionalId: string): Promise<readonly string[]> {
    const existing = this.getProfessional(professionalId);
    if (!this.gateway.configured) return existing?.portfolio ?? [];
    try {
      const portfolio = await this.gateway.listPortfolio(professionalId);
      const urls = portfolio.map((item) => item.url);
      this.publish({
        ...this.snapshot,
        professionals: this.snapshot.professionals.map((professional) => (
          professional.id === professionalId ? { ...professional, portfolio: urls } : professional
        )),
      });
      return urls;
    } catch (error) {
      this.logger.error('Unable to load approved portfolio media.', error);
      return existing?.portfolio ?? [];
    }
  }

  private async loadCatalog(): Promise<void> {
    try {
      const [professionals, categories] = await Promise.all([
        this.gateway.listProfessionals(),
        this.gateway.listCategories(),
      ]);
      this.clearRetry();
      this.publish({
        professionals: professionals
          .filter((professional) => !this.blockedProfessionalIds.has(professional.id))
          .map((professional) => this.toProfessional(professional)),
        categories: categories.map((category) => ({
          id: category.slug,
          label: category.name,
          initial: category.name.charAt(0).toUpperCase(),
        })),
        loading: false,
      });
    } catch (error) {
      this.logger.error('Unable to refresh the professional catalog.', error);
      this.publish({ ...this.snapshot, loading: false });
      this.scheduleRetry();
    }
  }

  private async loadBlockedProfessionalsAndCatalog(): Promise<void> {
    if (!this.blockedProfessionalsLoaded) {
      try {
        const stored = await this.blockedProfessionalsStorage?.read() ?? [];
        for (const professionalId of stored) {
          if (professionalId) this.blockedProfessionalIds.add(professionalId);
        }
        this.publish({
          ...this.snapshot,
          professionals: this.snapshot.professionals.filter(
            (professional) => !this.blockedProfessionalIds.has(professional.id),
          ),
        });
      } catch (error) {
        this.logger.error('Unable to load blocked professionals.', error);
      } finally {
        this.blockedProfessionalsLoaded = true;
      }
    }
    if (this.gateway.configured) await this.loadCatalog();
  }

  // A failed load (API down, no network) must not leave the catalog empty until
  // the app is backgrounded: retry with a growing delay until a load succeeds.
  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const delay = this.retryDelayMs;
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, MAX_RETRY_DELAY_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.refresh();
    }, delay);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryDelayMs = this.initialRetryDelayMs;
  }

  private toProfessional(api: ApiProfessionalSummary): Professional {
    // Sample data never decorates a live profile.
    const fallback = this.gateway.configured ? undefined : this.fallback.professionals.find((professional) => professional.id === api.id);
    const firstName = api.displayName.trim().split(/\s+/)[0] || api.displayName;
    return {
      id: api.id,
      name: api.displayName,
      firstName,
      service: api.specialty,
      category: api.category,
      rating: api.rating,
      reviews: api.reviewCount,
      priceFrom: api.services.length
        ? Math.min(...api.services.map((service) => service.price))
        : 0,
      zone: api.baseZone,
      nextSlot: api.nextAvailableSlot ?? 'unavailable',
      // The professional's own switch decides: on means bookable around the clock.
      available: api.available !== false,
      acceptingBookings: api.available,
      onVisit: api.onVisit === true,
      featured: api.featured,
      femaleOnlyEligible: api.femaleOnlyEligible,
      travelZones: api.travelZones,
      languages: api.languages,
      languageSkills: api.languageSkills,
      educationLevel: api.educationLevel,
      gender: api.gender ?? fallback?.gender ?? 'unspecified',
      distanceKm: fallback?.distanceKm ?? 99,
      initials: initials(api.displayName),
      image: fallback?.image,
      bio: api.bio,
      stats: [
        { value: `${api.yearsExperience} yrs`, label: 'Experience' },
        { value: String(api.reviewCount), label: 'Reviews' },
        { value: api.available ? 'Open' : 'Paused', label: 'Bookings' },
        { value: String(api.travelZones.length), label: 'Zones' },
      ],
      services: api.services.map((service) => {
        const localService = fallback?.services.find((item) => item.id === service.id);
        return {
          id: service.id,
          name: service.name,
          price: service.price,
          duration: durationLabel(service.durationMinutes),
          note: localService?.note ?? 'At-home service',
          description: localService?.description
            ?? `${service.name} delivered at your chosen address.`,
          ...(localService?.tag ? { tag: localService.tag } : {}),
        };
      }),
      portfolio: fallback?.portfolio ?? [],
      // Real reviews arrive through loadReviews(); never show sample reviews for a live profile.
      reviewsList: this.snapshot.professionals.find((professional) => professional.id === api.id)?.reviewsList ?? [],
    };
  }

  private publish(snapshot: DiscoverySnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
