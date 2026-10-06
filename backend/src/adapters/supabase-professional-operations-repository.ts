import { supabaseServiceHeaders } from './supabase-service-headers.ts';
import type {
  ApiPayoutBatch,
  ApiProfessionalCatalogSettings,
  ApiProfessionalDashboard,
} from '../../../shared/api-contracts.ts';
import type {
  TransitionProfessionalBookingResult,
  TransitionProfessionalBookingStoreInput,
  UpdateProfessionalCatalogResult,
  UpdateProfessionalCatalogStoreInput,
} from '../application/contracts.ts';
import type {
  ProfessionalBookingTransitionStore,
  ProfessionalOperationsReadStore,
  ProfessionalSelfServiceCommandStore,
} from '../application/ports.ts';
import { professionalCatalogPayload } from './supabase-professional-onboarding-repository.ts';

type JsonRecord = Record<string, unknown>;

const transitionResults = new Set<TransitionProfessionalBookingResult>([
  'updated',
  'not_found',
  'invalid_transition',
  'invalid_travel_fee',
  'too_early',
  'payment_required',
]);

export class SupabaseProfessionalOperationsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseProfessionalOperationsError';
  }
}

export class SupabaseProfessionalOperationsRepository
implements
  ProfessionalOperationsReadStore,
  ProfessionalSelfServiceCommandStore,
  ProfessionalBookingTransitionStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(baseUrl: string, secretKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
  }

  async getDashboard(
    professionalId: string,
    earningsSince: string,
  ): Promise<ApiProfessionalDashboard | null> {
    return await this.rpc('get_professional_dashboard', {
      p_professional_id: professionalId,
      p_earnings_since: earningsSince,
    }) as ApiProfessionalDashboard | null;
  }

  async getCatalogSettings(professionalId: string): Promise<ApiProfessionalCatalogSettings | null> {
    return await this.rpc('get_professional_catalog_settings', {
      p_professional_id: professionalId,
    }) as ApiProfessionalCatalogSettings | null;
  }

  async listPayouts(professionalId: string): Promise<ReadonlyArray<ApiPayoutBatch>> {
    const result = await this.rpc('list_professional_payouts', {
      p_professional_id: professionalId,
    });
    if (!Array.isArray(result)) {
      throw new SupabaseProfessionalOperationsError('Supabase returned an invalid payout history.');
    }
    return result as ApiPayoutBatch[];
  }

  async updateCatalog(input: UpdateProfessionalCatalogStoreInput): Promise<UpdateProfessionalCatalogResult> {
    const result = await this.rpc('update_professional_catalog', {
      p_professional_id: input.professionalId,
      p_settings: professionalCatalogPayload(input.settings),
      p_occurred_at: input.occurredAt,
    });
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new SupabaseProfessionalOperationsError('Supabase returned an invalid catalog result.');
    }
    return result as unknown as UpdateProfessionalCatalogResult;
  }

  async setAvailability(input: {
    professionalId: string;
    available: boolean;
    occurredAt: string;
  }): Promise<boolean> {
    const result = await this.rpc('set_professional_availability', {
      p_professional_id: input.professionalId,
      p_available: input.available,
      p_occurred_at: input.occurredAt,
    });
    if (typeof result !== 'boolean') {
      throw new SupabaseProfessionalOperationsError('Supabase returned an invalid availability result.');
    }
    return result;
  }

  async transitionBooking(
    input: TransitionProfessionalBookingStoreInput,
  ): Promise<TransitionProfessionalBookingResult> {
    if (input.action === 'complete' && input.extraAmount !== undefined) {
      // Extras are recorded before the visit is closed so the client's final
      // payment already carries them; Postgres refuses them once fully paid.
      const extras = await this.rpc('set_booking_extras_as_professional', {
        p_professional_id: input.professionalId,
        p_booking_id: input.bookingId,
        p_extra_amount: input.extraAmount,
        p_extra_note: input.extraNote ?? null,
        p_occurred_at: input.occurredAt,
      });
      if (extras === 'not_found') return 'not_found';
      if (extras === 'not_allowed') return 'invalid_transition';
      if (extras !== 'updated') throw new SupabaseProfessionalOperationsError('Supabase returned an invalid extras result.');
    }
    const result = input.action === 'decline'
      ? await this.rpc('decline_professional_booking_request', {
          p_professional_id: input.professionalId,
          p_booking_id: input.bookingId,
          p_occurred_at: input.occurredAt,
        })
      : await this.rpc('transition_professional_booking', {
          p_professional_id: input.professionalId,
          p_booking_id: input.bookingId,
          p_action: input.action,
          p_occurred_at: input.occurredAt,
          // Postgres validates the fee against the administrator-set cap.
          ...(input.action === 'accept' && input.travelFee !== undefined ? { p_travel_fee: input.travelFee } : {}),
        });
    if (typeof result !== 'string' || !transitionResults.has(result as TransitionProfessionalBookingResult)) {
      throw new SupabaseProfessionalOperationsError('Supabase returned an invalid booking transition result.');
    }
    return result as TransitionProfessionalBookingResult;
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
      throw new SupabaseProfessionalOperationsError('Supabase professional operations are unavailable.');
    }
    if (!response.ok) {
      throw new SupabaseProfessionalOperationsError('Supabase rejected the professional operation.');
    }
    return response.json();
  }
}
