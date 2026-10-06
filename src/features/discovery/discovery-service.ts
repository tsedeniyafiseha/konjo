import type {
  ApiPortfolioFeedItem,
  ApiProfessionalAvailability,
  ApiProfessionalPortfolioItem,
  ApiProfessionalSummary,
  ApiServiceCategory, ApiProfessionalReview } from '../../../shared/api-contracts';
import { apiRequest } from '@/services/api-client';

export interface ProfessionalCatalogFilters {
  query?: string;
  category?: string;
  zone?: string;
  featured?: boolean;
  available?: boolean;
}

function queryString(values: Record<string, string | boolean | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const result = params.toString();
  return result ? `?${result}` : '';
}

export const discoveryService = {
  async listCategories() {
    const response = await apiRequest<{ categories: ApiServiceCategory[] }>('/v1/categories');
    return response.categories;
  },
  async listReviews(professionalId: string, limit = 20) {
    const response = await apiRequest<{ reviews: readonly ApiProfessionalReview[] }>(
      `/v1/professionals/${encodeURIComponent(professionalId)}/reviews?limit=${limit}`,
    );
    return response.reviews;
  },

  async listProfessionals(filters: ProfessionalCatalogFilters = {}) {
    const response = await apiRequest<{ professionals: ApiProfessionalSummary[] }>(
      `/v1/professionals${queryString({
        query: filters.query,
        category: filters.category,
        zone: filters.zone,
        featured: filters.featured,
        available: filters.available,
      })}`,
    );
    return response.professionals;
  },

  async listPortfolio(professionalId: string) {
    const response = await apiRequest<{ portfolio: ApiProfessionalPortfolioItem[] }>(
      `/v1/professionals/${encodeURIComponent(professionalId)}/portfolio`,
    );
    return response.portfolio;
  },

  async listPortfolioFeed(limit = 18) {
    const response = await apiRequest<{ items: ApiPortfolioFeedItem[] }>(`/v1/portfolio-feed?limit=${limit}`);
    return response.items;
  },

  async getAvailability(input: {
    professionalId: string;
    dateIso: string;
    serviceId?: string;
    excludeBookingId?: string;
  }) {
    const response = await apiRequest<{ availability: ApiProfessionalAvailability }>(
      `/v1/professionals/${encodeURIComponent(input.professionalId)}/availability${queryString({
        date: input.dateIso,
        serviceId: input.serviceId,
        excludeBookingId: input.excludeBookingId,
      })}`,
    );
    return response.availability;
  },
};
