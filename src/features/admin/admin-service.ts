import type {
  ApiAdminAuditLog,
  ApiAdminBooking,
  ApiAdminProfessional,
  ApiAdminProfessionalApplication,
  ApiAdminSummary,
  ApiAdminBroadcast,
  ApiAdminZone,
  ApiBookingDispute,
  ApiPromotion,
  ApiAdminPendingPayout,
  ApiPayoutBatch,
  ApiProfessionalApplication,
  ApiProfessionalQualityFlag,
  ApiSafetyIncident,
  ApiServiceCategory,
  ApiAdminPlatformSettings,
} from '../../../shared/api-contracts';
import { apiBaseUrl, apiRequest } from '@/services/api-client';

export interface AdminDashboardData {
  summary: ApiAdminSummary;
  applications: readonly ApiAdminProfessionalApplication[];
  /** Approved and suspended professionals with their full application details. */
  roster: readonly ApiAdminProfessionalApplication[];
  professionals: readonly ApiAdminProfessional[];
  bookings: readonly ApiAdminBooking[];
  payouts: readonly ApiPayoutBatch[];
  /** Professionals with completed-visit earnings not yet grouped into a payout batch. */
  pendingPayouts: readonly ApiAdminPendingPayout[];
  auditLogs: readonly ApiAdminAuditLog[];
  zones: readonly ApiAdminZone[];
  promotions: readonly ApiPromotion[];
  disputes: readonly ApiBookingDispute[];
  broadcasts: readonly ApiAdminBroadcast[];
  qualityFlags: readonly ApiProfessionalQualityFlag[];
  safetyIncidents: readonly ApiSafetyIncident[];
  categories: readonly ApiServiceCategory[];
  settings: ApiAdminPlatformSettings;
}

export const adminService = {
  async loadDashboard(token: string): Promise<AdminDashboardData> {
    const [summary, applications, professionals, bookings, payouts, auditLogs, zones, promotions, disputes, broadcasts, qualityFlags, safetyIncidents, categories, settings, pendingPayouts] = await Promise.all([
      apiRequest<{ summary: ApiAdminSummary }>('/v1/admin/summary', { token }),
      apiRequest<{ applications: ApiAdminProfessionalApplication[] }>(
        '/v1/admin/professional-applications?status=pending',
        { token },
      ),
      apiRequest<{ professionals: ApiAdminProfessional[] }>('/v1/admin/professionals', { token }),
      apiRequest<{ bookings: ApiAdminBooking[] }>('/v1/admin/bookings', { token }),
      apiRequest<{ payouts: ApiPayoutBatch[] }>('/v1/admin/payouts', { token }),
      apiRequest<{ auditLogs: ApiAdminAuditLog[] }>('/v1/admin/audit-logs', { token }),
      apiRequest<{ zones: ApiAdminZone[] }>('/v1/admin/zones', { token }),
      apiRequest<{ promotions: ApiPromotion[] }>('/v1/admin/promotions', { token }),
      apiRequest<{ disputes: ApiBookingDispute[] }>('/v1/admin/disputes', { token }),
      apiRequest<{ broadcasts: ApiAdminBroadcast[] }>('/v1/admin/broadcasts', { token }),
      apiRequest<{ qualityFlags: ApiProfessionalQualityFlag[] }>('/v1/admin/quality-flags', { token }),
      apiRequest<{ safetyIncidents: ApiSafetyIncident[] }>('/v1/admin/safety-incidents', { token }),
      apiRequest<{ categories: ApiServiceCategory[] }>('/v1/admin/categories', { token }),
      apiRequest<{ settings: ApiAdminPlatformSettings }>('/v1/admin/settings/commission', { token }),
      apiRequest<{ pending: ApiAdminPendingPayout[] }>('/v1/admin/payouts/pending', { token }),
    ]);
    const [approved, suspended] = await Promise.all([
      adminService.listApplications('approved', token),
      adminService.listApplications('suspended', token),
    ]);
    return {
      summary: summary.summary,
      applications: applications.applications,
      roster: [...approved, ...suspended],
      professionals: professionals.professionals,
      bookings: bookings.bookings,
      payouts: payouts.payouts,
      auditLogs: auditLogs.auditLogs,
      zones: zones.zones,
      promotions: promotions.promotions,
      disputes: disputes.disputes,
      broadcasts: broadcasts.broadcasts,
      qualityFlags: qualityFlags.qualityFlags,
      safetyIncidents: safetyIncidents.safetyIncidents,
      categories: categories.categories,
      settings: settings.settings,
      pendingPayouts: pendingPayouts.pending,
    };
  },

  async listApplications(status: 'approved' | 'suspended', token: string) {
    const response = await apiRequest<{ applications: ApiAdminProfessionalApplication[] }>(
      `/v1/admin/professional-applications?status=${status}`,
      { token },
    );
    return response.applications;
  },

  async reviewApplication(
    professionalId: string,
    action: 'approve' | 'reject',
    token: string,
    reason?: string,
  ): Promise<ApiProfessionalApplication> {
    const response = await apiRequest<{ application: ApiProfessionalApplication }>(
      `/v1/admin/professional-applications/${encodeURIComponent(professionalId)}/${action}`,
      { method: 'POST', token, body: { ...(reason?.trim() ? { reason: reason.trim() } : {}) } },
    );
    return response.application;
  },

  async updateProfessional(
    professional: Pick<ApiAdminProfessional, 'id' | 'featured' | 'femaleOnlyEligible'>,
    token: string,
  ) {
    const response = await apiRequest<{ professional: ApiAdminProfessional }>(
      `/v1/admin/professionals/${encodeURIComponent(professional.id)}`,
      {
        method: 'PATCH',
        token,
        body: { featured: professional.featured, femaleOnlyEligible: professional.femaleOnlyEligible },
      },
    );
    return response.professional;
  },

  async setProfessionalState(
    professionalId: string,
    action: 'suspend' | 'restore',
    token: string,
  ) {
    const response = await apiRequest<{ professional: ApiAdminProfessional }>(
      `/v1/admin/professionals/${encodeURIComponent(professionalId)}/${action}`,
      { method: 'POST', token },
    );
    return response.professional;
  },

  async searchBookings(input: { query?: string; status?: string }, token: string) {
    const parameters = new URLSearchParams();
    if (input.query?.trim()) parameters.set('query', input.query.trim());
    if (input.status?.trim()) parameters.set('status', input.status.trim());
    const suffix = parameters.size ? `?${parameters.toString()}` : '';
    const response = await apiRequest<{ bookings: ApiAdminBooking[] }>(`/v1/admin/bookings${suffix}`, { token });
    return response.bookings;
  },

  async updateCategory(category: ApiServiceCategory, token: string) {
    const response = await apiRequest<{ category: ApiServiceCategory }>(
      `/v1/admin/categories/${encodeURIComponent(category.id)}`,
      {
        method: 'PUT',
        token,
        body: { slug: category.slug, name: category.name, active: category.active, sortOrder: category.sortOrder },
      },
    );
    return response.category;
  },

  async updateCommissionRate(commissionRateBps: number, token: string) {
    const response = await apiRequest<{ settings: ApiAdminPlatformSettings }>('/v1/admin/settings/commission', {
      method: 'PATCH', token, body: { commissionRateBps },
    });
    return response.settings;
  },

  /** Sets the platform-wide maximum travel fee (whole ETB) professionals may charge on acceptance. */
  async updateTravelFeeCap(travelFeeCap: number, token: string) {
    const response = await apiRequest<{ settings: ApiAdminPlatformSettings }>('/v1/admin/settings/travel-fee-cap', {
      method: 'PATCH', token, body: { travelFeeCap },
    });
    return response.settings;
  },

  async downloadCsv(kind: 'bookings' | 'revenue' | 'professionals' | 'payouts', token: string) {
    if (!apiBaseUrl || typeof document === 'undefined') throw new Error('CSV downloads are available in the web operations console.');
    const response = await fetch(`${apiBaseUrl}/v1/admin/exports/${kind}.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error('The CSV export could not be generated.');
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `konjo-${kind}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  async updateZone(zone: ApiAdminZone, token: string) {
    const response = await apiRequest<{ zone: ApiAdminZone }>(
      `/v1/admin/zones/${encodeURIComponent(zone.id)}`,
      { method: 'PUT', token, body: { label: zone.label, travelFee: zone.travelFee, active: zone.active } },
    );
    return response.zone;
  },

  async createPromotion(input: {
    code: string;
    description: string;
    discountPercent: number;
    startsAt: string;
    endsAt: string;
  }, token: string) {
    const response = await apiRequest<{ promotion: ApiPromotion }>('/v1/admin/promotions', {
      method: 'POST', token, body: { ...input, active: true },
    });
    return response.promotion;
  },

  async togglePromotion(promotionId: string, active: boolean, token: string) {
    const response = await apiRequest<{ promotion: ApiPromotion }>(
      `/v1/admin/promotions/${encodeURIComponent(promotionId)}`,
      { method: 'PATCH', token, body: { active } },
    );
    return response.promotion;
  },

  async resolveDispute(disputeId: string, status: 'resolved' | 'rejected', resolution: string, token: string) {
    const response = await apiRequest<{ dispute: ApiBookingDispute }>(
      `/v1/admin/disputes/${encodeURIComponent(disputeId)}/resolve`,
      { method: 'POST', token, body: { status, resolution } },
    );
    return response.dispute;
  },

  /** Groups everything a professional is owed into one batch to pay by hand. */
  async queuePayout(professionalId: string, token: string) {
    const response = await apiRequest<{ payout: ApiPayoutBatch }>('/v1/admin/payouts/queue', {
      method: 'POST', token, body: { professionalId },
    });
    return response.payout;
  },

  async markPayoutPaid(payoutId: string, professionalId: string, token: string, details: { paidReference: string; paidNote: string }) {
    const response = await apiRequest<{ payout: ApiPayoutBatch }>(
      `/v1/admin/payouts/${encodeURIComponent(payoutId)}/mark-paid`,
      { method: 'POST', token, body: { professionalId, paidReference: details.paidReference || undefined, paidNote: details.paidNote || undefined } },
    );
    return response.payout;
  },

  async refundBooking(bookingId: string, token: string) {
    return apiRequest(`/v1/admin/bookings/${encodeURIComponent(bookingId)}/refund`, {
      method: 'POST', token,
    });
  },

  async createBroadcast(audience: ApiAdminBroadcast['audience'], message: string, token: string) {
    const response = await apiRequest<{ broadcast: ApiAdminBroadcast }>('/v1/admin/broadcasts', {
      method: 'POST', token, body: { audience, message },
    });
    return response.broadcast;
  },

  async resolveQualityFlag(
    flagId: string,
    resolution: string,
    action: 'restore' | 'keep_hidden',
    token: string,
  ) {
    const response = await apiRequest<{ qualityFlag: ApiProfessionalQualityFlag }>(
      `/v1/admin/quality-flags/${encodeURIComponent(flagId)}/resolve`,
      { method: 'POST', token, body: { resolution, action } },
    );
    return response.qualityFlag;
  },

  async resolveSafetyIncident(incidentId: string, resolution: string, token: string) {
    const response = await apiRequest<{ safetyIncident: ApiSafetyIncident }>(
      `/v1/admin/safety-incidents/${encodeURIComponent(incidentId)}/resolve`,
      { method: 'POST', token, body: { resolution } },
    );
    return response.safetyIncident;
  },
};
