import type { DatabaseSync } from 'node:sqlite';

import type {
  ApiPromotion,
  ApiProfessionalReview,
  ApiProfessionalService,
  ApiProfessionalSummary,
  ApiServiceCategory,
  ApiServiceZone,
} from '../../../../shared/api-contracts.ts';
import type {
  MarketplaceProfessionalFilters,
  MarketplaceReadStore,
} from '../../application/ports.ts';
import { SqliteAvailabilityRepository } from './availability-repository.ts';
import { SqliteClientReadRepository } from './client-read-repository.ts';

interface ProfessionalRow {
  id: string;
  display_name: string;
  specialty: string;
  base_zone: string;
  services_json: string;
  category: string;
  bio: string;
  years_experience: number;
  education_level: ApiProfessionalSummary['educationLevel'];
  gender: ApiProfessionalSummary['gender'];
  languages_json: string;
  language_skills_json: string;
  featured: number;
  hidden: number;
  suspended: number;
  female_only_eligible: number;
  rating_baseline: number;
  review_count_baseline: number;
}

function addDaysToDateKey(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export class SqliteMarketplaceReadRepository implements MarketplaceReadStore {
  private readonly database: DatabaseSync;
  private readonly availability: SqliteAvailabilityRepository;
  private readonly clients: SqliteClientReadRepository;

  constructor(
    database: DatabaseSync,
    availability: SqliteAvailabilityRepository,
    clients: SqliteClientReadRepository,
  ) {
    this.database = database;
    this.availability = availability;
    this.clients = clients;
  }

  listProfessionals(
    filters: MarketplaceProfessionalFilters,
    today: string,
  ): ReadonlyArray<ApiProfessionalSummary> {
    const rows = this.database.prepare(`
      SELECT * FROM professionals
      WHERE hidden = 0 AND suspended = 0
      ORDER BY display_name
    `).all() as unknown as ProfessionalRow[];
    const normalizedQuery = filters.query?.trim().toLowerCase();
    const normalizedCategory = filters.category?.trim().toLowerCase();
    const normalizedZone = filters.zone?.trim().toLowerCase();

    return rows.map((row): ApiProfessionalSummary => {
      const services = JSON.parse(row.services_json) as ApiProfessionalService[];
      const zones = this.database.prepare(`
        SELECT zone FROM professional_catalog_zones
        WHERE professional_id = ?
        ORDER BY zone
      `).all(row.id) as unknown as Array<{ zone: string }>;
      const workingDays = this.database.prepare(`
        SELECT day, enabled FROM professional_catalog_working_days
        WHERE professional_id = ?
        ORDER BY rowid
      `).all(row.id) as unknown as Array<{ day: string; enabled: number }>;
      const acceptingBookings = this.database.prepare(`
        SELECT available FROM professional_availability WHERE professional_id = ?
      `).get(row.id) as unknown as { available: number } | undefined;
      const activeBooking = this.database.prepare(`
        SELECT 1 FROM bookings
        WHERE professional_id = ? AND status IN ('on_the_way', 'in_progress')
        LIMIT 1
      `).get(row.id);
      const ratings = this.database.prepare(`
        SELECT COUNT(*) AS count,
          COALESCE(AVG((technique_rating + professionalism_rating) / 2.0), 0) AS rating
        FROM booking_reviews WHERE professional_id = ?
      `).get(row.id) as unknown as { count: number; rating: number };
      const reviewCount = row.review_count_baseline + ratings.count;
      const rating = reviewCount === 0
        ? 0
        : ((row.rating_baseline * row.review_count_baseline) + (ratings.rating * ratings.count)) / reviewCount;
      const availabilityWindow = Array.from({ length: 7 }, (_, offset) => {
        const dateIso = addDaysToDateKey(today, offset);
        return {
          dateIso,
          offset,
          availability: this.availability.getProfessionalAvailability(
            row.id,
            dateIso,
            services[0]?.id,
          ),
        };
      });
      const nextAvailable = availabilityWindow.find((item) => item.availability?.slots.length);
      const nextAvailableSlot = nextAvailable
        ? `${
            nextAvailable.offset === 0
              ? ''
              : nextAvailable.offset === 1
                ? 'Tomorrow '
                : `${new Intl.DateTimeFormat('en-US', {
                    weekday: 'short',
                    timeZone: 'UTC',
                  }).format(new Date(`${nextAvailable.dateIso}T12:00:00.000Z`))} `
          }${nextAvailable.availability!.slots[0]}`
        : null;
      return {
        id: row.id,
        displayName: row.display_name,
        specialty: row.specialty,
        category: row.category,
        baseZone: row.base_zone,
        bio: row.bio,
        yearsExperience: row.years_experience,
        educationLevel: row.education_level,
        languages: JSON.parse(row.languages_json) as string[],
        languageSkills: JSON.parse(row.language_skills_json) as ApiProfessionalSummary['languageSkills'],
        gender: row.gender ?? 'unspecified',
        rating: Number(rating.toFixed(2)),
        reviewCount,
        available: acceptingBookings?.available === 1,
        onVisit: Boolean(activeBooking),
        availableToday: availabilityWindow[0]?.availability?.available ?? false,
        nextAvailableSlot,
        featured: row.featured === 1,
        femaleOnlyEligible: row.female_only_eligible === 1,
        travelZones: zones.map((zone) => zone.zone),
        workingDays: workingDays.map((day) => ({ day: day.day, enabled: day.enabled === 1 })),
        services,
      };
    }).filter((professional) => {
      if (normalizedCategory && professional.category.toLowerCase() !== normalizedCategory) return false;
      if (normalizedZone && !professional.travelZones.some((zone) => zone.toLowerCase() === normalizedZone)) return false;
      if (filters.featured !== undefined && professional.featured !== filters.featured) return false;
      if (filters.available !== undefined && professional.available !== filters.available) return false;
      if (normalizedQuery) {
        const haystack = [
          professional.displayName,
          professional.specialty,
          professional.baseZone,
          ...professional.travelZones,
          ...professional.services.map((service) => service.name),
        ].join(' ').toLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }

  listServiceZones(): ReadonlyArray<ApiServiceZone> {
    const rows = this.database.prepare(`
      SELECT id, label, travel_fee
      FROM service_zones
      WHERE active = 1
      ORDER BY label
    `).all() as unknown as Array<{ id: string; label: string; travel_fee: number }>;
    return rows.map((row) => ({ id: row.id, label: row.label, travelFee: row.travel_fee }));
  }

  listServiceCategories(activeOnly: boolean): ReadonlyArray<ApiServiceCategory> {
    const rows = this.database.prepare(`
      SELECT * FROM service_categories
      ${activeOnly ? 'WHERE active = 1' : ''}
      ORDER BY sort_order, name
    `).all() as unknown as Array<{
      id: string;
      slug: string;
      name: string;
      active: number;
      sort_order: number;
      updated_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      active: row.active === 1,
      sortOrder: row.sort_order,
      updatedAt: row.updated_at,
    }));
  }

  listPromotions(): ReadonlyArray<ApiPromotion> {
    const rows = this.database.prepare(`
      SELECT * FROM promotions ORDER BY created_at DESC
    `).all() as unknown as Array<{
      id: string;
      code: string;
      description: string;
      discount_percent: number;
      active: number;
      starts_at: string;
      ends_at: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      description: row.description,
      discountPercent: row.discount_percent,
      active: row.active === 1,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      createdAt: row.created_at,
    }));
  }

  findServiceZone(zone: string): ApiServiceZone | null {
    const row = this.database.prepare(`
      SELECT id, label, travel_fee
      FROM service_zones
      WHERE lower(label) = lower(?) AND active = 1
    `).get(zone) as unknown as { id: string; label: string; travel_fee: number } | undefined;
    return row ? { id: row.id, label: row.label, travelFee: row.travel_fee } : null;
  }

  bookingRequiresClientIdentity(userId: string, professionalId: string): boolean {
    const professional = this.database.prepare(`
      SELECT category FROM professionals
      WHERE id = ? AND hidden = 0 AND suspended = 0
    `).get(professionalId) as unknown as { category: string } | undefined;
    if (professional?.category.toLowerCase() !== 'massage') return false;
    return !this.clients.getIdentityStatus(userId).verified;
  }

  listProfessionalReviews(professionalId: string, limit: number): ReadonlyArray<ApiProfessionalReview> {
    const rows = this.database.prepare(`
      SELECT
        br.id,
        SUBSTR(b.client_id, 1, 8) AS client_name,
        br.technique_rating,
        br.professionalism_rating,
        br.tags_json,
        br.review_text,
        br.created_at
      FROM booking_reviews br
      JOIN bookings b ON b.id = br.booking_id
      WHERE br.professional_id = ? AND br.visible = 1
      ORDER BY br.created_at DESC
      LIMIT ?
    `).all(professionalId, limit) as unknown as Array<{
      id: string;
      client_name: string;
      technique_rating: number;
      professionalism_rating: number;
      tags_json: string;
      review_text: string;
      created_at: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      clientName: row.client_name,
      techniqueRating: row.technique_rating,
      professionalismRating: row.professionalism_rating,
      averageRating: Number(((row.technique_rating + row.professionalism_rating) / 2).toFixed(2)),
      tags: JSON.parse(row.tags_json ?? '[]') as string[],
      reviewText: row.review_text ?? '',
      createdAt: row.created_at,
    }));
  }
}
