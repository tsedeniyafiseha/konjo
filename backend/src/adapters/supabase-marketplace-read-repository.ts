import { supabaseServiceHeaders } from './supabase-service-headers.ts';
import type {
  ApiClientIdentityStatus,
  ApiProfessionalAvailability,
  ApiProfessionalReview,
  ApiProfessionalSummary,
  ApiPromotion,
  ApiServiceCategory,
  ApiServiceZone,
} from '../../../shared/api-contracts.ts';
import type {
  ClientIdentityReadStore,
  ClientIdentityVerificationStore,
  MarketplaceProfessionalFilters,
  MarketplaceReadStore,
  ProfessionalAvailabilityReadStore,
} from '../application/ports.ts';

type JsonRecord = Record<string, unknown>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SupabaseMarketplaceReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseMarketplaceReadError';
  }
}

export class SupabaseMarketplaceReadRepository
implements
  MarketplaceReadStore,
  ProfessionalAvailabilityReadStore,
  ClientIdentityVerificationStore,
  ClientIdentityReadStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(baseUrl: string, secretKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
  }

  async listProfessionals(
    filters: MarketplaceProfessionalFilters,
    today: string,
  ): Promise<ReadonlyArray<ApiProfessionalSummary>> {
    return this.arrayRpc<ApiProfessionalSummary>('list_marketplace_professionals', {
      p_filters: filters,
      p_today: today,
    });
  }

  async listServiceZones(): Promise<ReadonlyArray<ApiServiceZone>> {
    return this.arrayRpc<ApiServiceZone>('list_marketplace_zones', {});
  }

  async listServiceCategories(activeOnly: boolean): Promise<ReadonlyArray<ApiServiceCategory>> {
    return this.arrayRpc<ApiServiceCategory>('list_marketplace_categories', {
      p_active_only: activeOnly,
    });
  }

  async listPromotions(): Promise<ReadonlyArray<ApiPromotion>> {
    return this.arrayRpc<ApiPromotion>('list_marketplace_promotions', {});
  }

  async findServiceZone(zone: string): Promise<ApiServiceZone | null> {
    const result = await this.rpc('find_marketplace_zone', { p_zone: zone });
    return result === null ? null : result as ApiServiceZone;
  }

  async bookingRequiresClientIdentity(userId: string, professionalId: string): Promise<boolean> {
    if (!uuidPattern.test(userId) || !uuidPattern.test(professionalId)) return false;
    const result = await this.rpc('booking_requires_client_identity', {
      p_client_id: userId,
      p_professional_id: professionalId,
    });
    if (typeof result !== 'boolean') {
      throw new SupabaseMarketplaceReadError('Supabase returned an invalid identity policy result.');
    }
    return result;
  }

  async getProfessionalAvailability(
    professionalId: string,
    dateIso: string,
    serviceId?: string,
    excludeBookingId?: string,
  ): Promise<ApiProfessionalAvailability | null> {
    if (!uuidPattern.test(professionalId)) return null;
    const result = await this.rpc('get_marketplace_professional_availability', {
      p_professional_id: professionalId,
      p_date: dateIso,
      p_service_id: serviceId ?? null,
      p_exclude_booking_id: excludeBookingId ?? null,
    });
    if (result === null) return null;
    return result as ApiProfessionalAvailability;
  }

  async recordClientVerification(
    userId: string,
    lastFour: string,
    verifiedAt: string,
  ): Promise<ApiClientIdentityStatus> {
    return await this.rpc('record_client_identity_verification', {
      p_client_id: userId,
      p_last_four: lastFour,
      p_verified_at: verifiedAt,
    }) as ApiClientIdentityStatus;
  }

  async getIdentityStatus(userId: string): Promise<ApiClientIdentityStatus> {
    if (!uuidPattern.test(userId)) {
      return { verified: false, faydaLastFour: null, verifiedAt: null };
    }
    return await this.rpc('get_client_identity_verification', {
      p_client_id: userId,
    }) as ApiClientIdentityStatus;
  }

  async listProfessionalReviews(
    professionalId: string,
    limit: number,
  ): Promise<ReadonlyArray<ApiProfessionalReview>> {
    if (!uuidPattern.test(professionalId)) return [];
    return this.arrayRpc<ApiProfessionalReview>('list_professional_reviews', {
      p_professional_id: professionalId,
      p_limit: limit,
    });
  }

  private async arrayRpc<T>(name: string, body: JsonRecord): Promise<ReadonlyArray<T>> {
    const result = await this.rpc(name, body);
    if (!Array.isArray(result)) {
      throw new SupabaseMarketplaceReadError(`Supabase returned an invalid ${name} result.`);
    }
    return result as T[];
  }

  private async rpc(name: string, body: JsonRecord): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: supabaseServiceHeaders(this.secretKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
    } catch {
      throw new SupabaseMarketplaceReadError('Supabase marketplace data is unavailable.');
    }
    if (!response.ok) {
      throw new SupabaseMarketplaceReadError('Supabase rejected the marketplace query.');
    }
    return response.json();
  }
}
