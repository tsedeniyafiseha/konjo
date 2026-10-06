import { supabaseServiceHeaders } from './supabase-service-headers.ts';
import type {
  ProcessPaymentEventResult,
  ProcessPaymentEventStoreInput,
  ProfessionalPayoutCommandResult,
  QueueProfessionalPayoutStoreInput,
  SettleProfessionalPayoutStoreInput,
} from '../application/contracts.ts';
import type { PaymentEventStore, ProfessionalPayoutCommandStore } from '../application/ports.ts';

type JsonRecord = Record<string, unknown>;

export class SupabasePaymentOperationsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabasePaymentOperationsError';
  }
}

export class SupabasePaymentOperationsRepository
implements PaymentEventStore, ProfessionalPayoutCommandStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(baseUrl: string, secretKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
  }

  async processPaymentEvent(input: ProcessPaymentEventStoreInput): Promise<ProcessPaymentEventResult> {
    return await this.rpc(input.verifiedAmount === undefined ? 'process_provider_payment_event' : 'process_verified_provider_payment_event', {
      ...(input.verifiedAmount === undefined ? {} : { p_verified_amount: input.verifiedAmount, p_verified_currency: input.verifiedCurrency }),
      p_event_id: input.eventId,
      p_provider: input.provider,
      p_provider_reference: input.providerReference,
      p_status: input.status,
      p_payload_hash: input.payloadHash,
      p_occurred_at: input.occurredAt,
    }) as ProcessPaymentEventResult;
  }

  async queuePayout(input: QueueProfessionalPayoutStoreInput): Promise<ProfessionalPayoutCommandResult> {
    return await this.rpc('queue_professional_payout', {
      p_professional_id: input.professionalId,
      p_payout_id: input.payoutId,
      p_occurred_at: input.occurredAt,
    }) as ProfessionalPayoutCommandResult;
  }

  async settlePayout(input: SettleProfessionalPayoutStoreInput): Promise<ProfessionalPayoutCommandResult> {
    return await this.rpc('settle_professional_payout', {
      p_professional_id: input.professionalId,
      p_payout_id: input.payoutId,
      p_occurred_at: input.occurredAt,
      ...(input.paidReference ? { p_paid_reference: input.paidReference } : {}),
      ...(input.paidNote ? { p_paid_note: input.paidNote } : {}),
      ...(input.paidBy ? { p_paid_by: input.paidBy } : {}),
    }) as ProfessionalPayoutCommandResult;
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
      throw new SupabasePaymentOperationsError('Supabase payment operations are unavailable.');
    }
    if (!response.ok) {
      throw new SupabasePaymentOperationsError('Supabase rejected the payment operation.');
    }
    return response.json();
  }
}
