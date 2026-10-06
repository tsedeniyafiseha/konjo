import type { ApiBookingTracking, ApiPayoutBatch, ApiProfessionalCatalogSettings, ApiProfessionalDashboard, ApiProfessionalReview } from '../../../shared/api-contracts';
import type { ProfessionalBookingAction } from '@/application/professional-data/professional-data-contracts';
import { apiRequest } from '@/services/api-client';

export type { ProfessionalBookingAction } from '@/application/professional-data/professional-data-contracts';

export const professionalDashboardService = {
  async getDashboard(token: string): Promise<ApiProfessionalDashboard> {
    const response = await apiRequest<{ dashboard: ApiProfessionalDashboard }>('/v1/professional/dashboard', {
      token,
    });
    return response.dashboard;
  },

  /** The professional's own published reviews, newest first (the same public list clients see). */
  async listReviews(professionalId: string, limit = 50): Promise<ApiProfessionalReview[]> {
    const response = await apiRequest<{ reviews: ApiProfessionalReview[] }>(
      `/v1/professionals/${encodeURIComponent(professionalId)}/reviews?limit=${limit}`,
    );
    return response.reviews;
  },

  /** Payout batches Konjo has prepared or paid for this professional, newest first. */
  async listPayouts(token: string): Promise<ApiPayoutBatch[]> {
    const response = await apiRequest<{ payouts: ApiPayoutBatch[] }>('/v1/professional/payouts', { token });
    return response.payouts;
  },

  async setAvailability(token: string, available: boolean): Promise<boolean> {
    const response = await apiRequest<{ available: boolean }>('/v1/professional/availability', {
      method: 'PATCH',
      token,
      body: { available },
    });
    return response.available;
  },

  async getCatalog(token: string): Promise<ApiProfessionalCatalogSettings> {
    const response = await apiRequest<{ settings: ApiProfessionalCatalogSettings }>('/v1/professional/catalog', { token });
    return response.settings;
  },

  async updateCatalog(token: string, settings: ApiProfessionalCatalogSettings): Promise<ApiProfessionalCatalogSettings> {
    const response = await apiRequest<{ settings: ApiProfessionalCatalogSettings }>('/v1/professional/catalog', {
      method: 'PATCH', token, body: settings as unknown as Record<string, unknown>,
    });
    return response.settings;
  },

  async reportLocation(
    token: string,
    bookingId: string,
    point: { latitude: number; longitude: number; accuracyMeters?: number | null; heading?: number | null; speedMps?: number | null; areaLabel?: string | null },
  ): Promise<ApiBookingTracking | null> {
    const response = await apiRequest<{ tracking: ApiBookingTracking | null }>(
      `/v1/professional/bookings/${encodeURIComponent(bookingId)}/location`,
      { method: 'POST', token, body: { ...point } },
    );
    return response.tracking;
  },

  async transitionBooking(
    token: string,
    bookingId: string,
    action: ProfessionalBookingAction,
    options?: { travelFee?: number; extraAmount?: number; extraNote?: string },
  ): Promise<ApiProfessionalDashboard> {
    // An acceptance carries the travel fee (checked against the administrator
    // cap); a checkout carries the extra services the client owes for.
    const body = action === 'accept' && options?.travelFee !== undefined
      ? { travelFee: options.travelFee }
      : action === 'complete' && options?.extraAmount !== undefined
        ? { extraAmount: options.extraAmount, ...(options.extraNote ? { extraNote: options.extraNote } : {}) }
        : undefined;
    const response = await apiRequest<{ dashboard: ApiProfessionalDashboard }>(
      `/v1/professional/bookings/${encodeURIComponent(bookingId)}/${action}`,
      { method: 'POST', token, ...(body ? { body } : {}) },
    );
    return response.dashboard;
  },
};
