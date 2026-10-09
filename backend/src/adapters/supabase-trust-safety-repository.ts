import { supabaseServiceHeaders } from './supabase-service-headers.ts';
import type {
  OpenBookingDisputeStoreInput,
  OpenSafetyIncidentResult,
  OpenSafetyIncidentStoreInput,
  CreateContentReportResult,
  CreateContentReportStoreInput,
  ResolveContentReportStoreInput,
  SetProfessionalBlockStoreInput,
  ResolveBookingDisputeStoreInput,
  ResolveQualityFlagStoreInput,
  ResolveSafetyIncidentStoreInput,
  TrustSafetyResolutionResult,
} from '../application/contracts.ts';
import type { TrustSafetyCommandStore } from '../application/ports.ts';

type JsonRecord = Record<string, unknown>;

export class SupabaseTrustSafetyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseTrustSafetyError';
  }
}

export class SupabaseTrustSafetyRepository implements TrustSafetyCommandStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(baseUrl: string, secretKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
  }

  async openSafetyIncident(input: OpenSafetyIncidentStoreInput): Promise<OpenSafetyIncidentResult> {
    return await this.rpc('open_safety_incident', this.input(input)) as OpenSafetyIncidentResult;
  }

  async createContentReport(input: CreateContentReportStoreInput): Promise<CreateContentReportResult> {
    return await this.rpc('create_content_report', this.input(input)) as CreateContentReportResult;
  }

  async listBlockedProfessionals(clientId: string): Promise<ReadonlyArray<string>> {
    const result = await this.rpc('list_client_blocked_professionals', { p_client_id: clientId });
    if (!Array.isArray(result) || result.some((item) => typeof item !== 'string')) {
      throw new SupabaseTrustSafetyError('Supabase returned an invalid blocked-professionals list.');
    }
    return result as string[];
  }

  async setProfessionalBlocked(input: SetProfessionalBlockStoreInput): Promise<boolean> {
    return await this.rpc('set_client_professional_block', this.input(input)) === true;
  }

  async openBookingDispute(
    input: OpenBookingDisputeStoreInput,
  ): Promise<TrustSafetyResolutionResult['dispute'] | null> {
    return await this.rpc('open_booking_dispute', this.input(input)) as TrustSafetyResolutionResult['dispute'] | null;
  }

  async resolveSafetyIncident(
    input: ResolveSafetyIncidentStoreInput,
  ): Promise<TrustSafetyResolutionResult['safetyIncident'] | null> {
    return await this.rpc('resolve_safety_incident', this.input(input)) as TrustSafetyResolutionResult['safetyIncident'] | null;
  }

  async resolveQualityFlag(
    input: ResolveQualityFlagStoreInput,
  ): Promise<TrustSafetyResolutionResult['qualityFlag'] | null> {
    return await this.rpc('resolve_professional_quality_flag', this.input(input)) as TrustSafetyResolutionResult['qualityFlag'] | null;
  }

  async resolveBookingDispute(
    input: ResolveBookingDisputeStoreInput,
  ): Promise<TrustSafetyResolutionResult['dispute'] | null> {
    return await this.rpc('resolve_booking_dispute', this.input(input)) as TrustSafetyResolutionResult['dispute'] | null;
  }

  async resolveContentReport(
    input: ResolveContentReportStoreInput,
  ): Promise<TrustSafetyResolutionResult['contentReport'] | null> {
    return await this.rpc('resolve_content_report', this.input(input)) as TrustSafetyResolutionResult['contentReport'] | null;
  }

  private input(value: object): JsonRecord {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      `p_${key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`,
      item,
    ]));
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
      throw new SupabaseTrustSafetyError('Supabase trust-and-safety operations are unavailable.');
    }
    if (!response.ok) throw new SupabaseTrustSafetyError('Supabase rejected the trust-and-safety operation.');
    if (response.status === 204) return null;
    return response.json();
  }
}
