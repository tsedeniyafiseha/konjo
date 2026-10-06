import { supabaseServiceHeaders } from './supabase-service-headers.ts';
import type {
  OpenBookingDisputeStoreInput,
  OpenSafetyIncidentResult,
  OpenSafetyIncidentStoreInput,
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
