import { supabaseServiceHeaders } from './supabase-service-headers.ts';
import type {
  ApiAdminAuditLog,
  ApiAdminBooking,
  ApiAdminBroadcast,
  ApiAdminPlatformSettings,
  ApiAdminProfessional,
  ApiAdminProfessionalApplication,
  ApiAdminSummary,
  ApiAdminZone,
  ApiBookingDispute,
  ApiAdminPendingPayout,
  ApiPayoutBatch,
  ApiProfessionalApplication,
  ApiProfessionalQualityFlag,
  ApiSafetyIncident,
} from '../../../shared/api-contracts.ts';
import type { AdminBookingFilters, AdminReadStore, AdminRevenueRow } from '../application/ports.ts';

type JsonRecord = Record<string, unknown>;

export class SupabaseAdminReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseAdminReadError';
  }
}

export class SupabaseAdminReadRepository implements AdminReadStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(baseUrl: string, secretKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
  }

  async getSummary(): Promise<ApiAdminSummary> {
    return await this.rpc('get_admin_summary', {}) as ApiAdminSummary;
  }

  async getPlatformSettings(): Promise<ApiAdminPlatformSettings> {
    return await this.rpc('get_admin_platform_settings', {}) as ApiAdminPlatformSettings;
  }

  async listProfessionalApplications(
    _status?: ApiProfessionalApplication['status'],
  ): Promise<ReadonlyArray<ApiAdminProfessionalApplication>> {
    throw new SupabaseAdminReadError('Professional applications use the onboarding repository.');
  }

  async listProfessionals(): Promise<ReadonlyArray<ApiAdminProfessional>> {
    return await this.arrayRpc('list_admin_professionals', {});
  }

  async listBookings(filters: AdminBookingFilters, limit: number): Promise<ReadonlyArray<ApiAdminBooking>> {
    return await this.arrayRpc('list_admin_bookings', { p_filters: filters, p_limit: limit });
  }

  async listPendingPayouts(): Promise<ReadonlyArray<ApiAdminPendingPayout>> {
    return await this.arrayRpc('list_admin_pending_payouts', {});
  }

  async listPayouts(): Promise<ReadonlyArray<ApiPayoutBatch>> {
    return await this.arrayRpc('list_admin_payouts', {});
  }

  async listRevenueRows(): Promise<ReadonlyArray<AdminRevenueRow>> {
    return await this.arrayRpc('list_admin_revenue_rows', {});
  }

  async listAuditLogs(limit: number): Promise<ReadonlyArray<ApiAdminAuditLog>> {
    return await this.arrayRpc('list_admin_audit_logs', { p_limit: limit });
  }

  async listZones(): Promise<ReadonlyArray<ApiAdminZone>> {
    return await this.arrayRpc('list_admin_zones', {});
  }

  async listDisputes(): Promise<ReadonlyArray<ApiBookingDispute>> {
    return await this.arrayRpc('list_admin_disputes', {});
  }

  async listQualityFlags(): Promise<ReadonlyArray<ApiProfessionalQualityFlag>> {
    return await this.arrayRpc('list_admin_quality_flags', {});
  }

  async listSafetyIncidents(): Promise<ReadonlyArray<ApiSafetyIncident>> {
    return await this.arrayRpc('list_admin_safety_incidents', {});
  }

  async listBroadcasts(): Promise<ReadonlyArray<ApiAdminBroadcast>> {
    return await this.arrayRpc('list_admin_broadcasts', {});
  }

  private async arrayRpc<T>(name: string, body: JsonRecord): Promise<ReadonlyArray<T>> {
    const result = await this.rpc(name, body);
    if (!Array.isArray(result)) throw new SupabaseAdminReadError(`Supabase returned an invalid ${name} result.`);
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
      throw new SupabaseAdminReadError('Supabase administrator reads are unavailable.');
    }
    if (!response.ok) throw new SupabaseAdminReadError('Supabase rejected the administrator read.');
    return response.json();
  }
}
