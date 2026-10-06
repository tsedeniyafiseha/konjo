import { supabaseServiceHeaders } from './supabase-service-headers.ts';
import type { ApiBooking, ApiClientRewards, ApiPaymentIntent } from '../../../shared/api-contracts.ts';
import type {
  BookingCreationResult,
  BookingPaymentContext,
  BookingQuote,
  BookingQuoteFailureReason,
  CancelBookingResult,
  CancelBookingStoreInput,
  CreateBookingCommandInput,
  PaymentProviderIntent,
  InitiateBookingPaymentResult,
  RescheduleBookingResult,
  RescheduleBookingStoreInput,
  SubmitBookingReviewResult,
  SubmitBookingReviewStoreInput,
  ArchiveBookingResult,
  ArchiveBookingStoreInput,
} from '../application/contracts.ts';
import type {
  BookingCancellationStore,
  BookingCommandStore,
  BookingPaymentStore,
  BookingRescheduleStore,
  BookingReviewStore,
  ClientBookingReadStore,
} from '../application/ports.ts';

type JsonRecord = Record<string, unknown>;

const quoteFailureReasons = new Set<BookingQuoteFailureReason>([
  'client_unavailable',
  'professional_unavailable',
  'service_unavailable',
  'female_only_unavailable',
  'zone_unavailable',
  'identity_required',
  'time_unavailable',
]);

export class SupabaseBookingRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseBookingRepositoryError';
  }
}

export class SupabaseBookingRepository
implements
  BookingCommandStore,
  BookingPaymentStore,
  ClientBookingReadStore,
  BookingRescheduleStore,
  BookingCancellationStore,
  BookingReviewStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(baseUrl: string, secretKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
  }

  async findBookingByRequest(
    clientId: string,
    requestId: string,
  ): Promise<BookingCreationResult | null> {
    return await this.rpc('find_marketplace_booking_by_request', {
      p_client_id: clientId,
      p_request_id: requestId,
    }) as BookingCreationResult | null;
  }

  async quoteBooking(input: CreateBookingCommandInput): Promise<BookingQuote | null> {
    return await this.rpc('quote_marketplace_booking', {
      p_input: input,
    }) as BookingQuote | null;
  }

  async explainQuoteFailure(input: CreateBookingCommandInput): Promise<BookingQuoteFailureReason | null> {
    const result = await this.rpc('explain_marketplace_booking_quote', { p_input: input });
    if (result === null) return null;
    if (typeof result !== 'string' || !quoteFailureReasons.has(result as BookingQuoteFailureReason)) {
      throw new SupabaseBookingRepositoryError('Supabase returned an invalid booking quote explanation.');
    }
    return result as BookingQuoteFailureReason;
  }

  async commitBooking(
    input: CreateBookingCommandInput,
    quote: BookingQuote,
  ): Promise<BookingCreationResult | null> {
    return await this.rpc('commit_marketplace_booking', {
      p_input: input,
      p_quote: quote,
    }) as BookingCreationResult | null;
  }

  async getBookingPaymentContext(
    clientId: string,
    bookingId: string,
  ): Promise<BookingPaymentContext | null> {
    return await this.rpc('get_booking_payment_context', {
      p_client_id: clientId,
      p_booking_id: bookingId,
    }) as BookingPaymentContext | null;
  }

  async commitBookingPayment(
    clientId: string,
    bookingId: string,
    providerIntent: PaymentProviderIntent,
    occurredAt: string,
  ): Promise<InitiateBookingPaymentResult> {
    return await this.rpc('commit_booking_payment_intent', {
      p_client_id: clientId,
      p_booking_id: bookingId,
      p_provider_intent: providerIntent,
      p_occurred_at: occurredAt,
    }) as InitiateBookingPaymentResult;
  }

  async listBookings(userId: string): Promise<ReadonlyArray<ApiBooking>> {
    const result = await this.rpc('list_client_bookings', { p_client_id: userId });
    if (!Array.isArray(result)) {
      throw new SupabaseBookingRepositoryError('Supabase returned an invalid booking history.');
    }
    return result as ApiBooking[];
  }

  async getRewards(userId: string): Promise<ApiClientRewards> {
    const result = await this.rpc('get_client_rewards', { p_client_id: userId });
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new SupabaseBookingRepositoryError('Supabase returned an invalid rewards summary.');
    }
    return result as ApiClientRewards;
  }

  async getPaymentIntent(
    userId: string,
    paymentIntentId: string,
  ): Promise<ApiPaymentIntent | null> {
    return await this.rpc('get_client_payment_intent', {
      p_client_id: userId,
      p_payment_intent_id: paymentIntentId,
    }) as ApiPaymentIntent | null;
  }

  async rescheduleBooking(input: RescheduleBookingStoreInput): Promise<RescheduleBookingResult> {
    return await this.rpc('reschedule_client_booking', {
      p_client_id: input.clientId,
      p_booking_id: input.bookingId,
      p_date: input.dateIso,
      p_time: input.time,
      p_occurred_at: input.occurredAt,
    }) as RescheduleBookingResult;
  }

  async archiveBooking(input: ArchiveBookingStoreInput): Promise<ArchiveBookingResult> {
    const result = await this.rpc('archive_client_booking', {
      p_client_id: input.clientId,
      p_booking_id: input.bookingId,
      p_occurred_at: input.occurredAt,
    });
    if (result !== 'archived' && result !== 'not_found' && result !== 'not_allowed') {
      throw new SupabaseBookingRepositoryError('Supabase returned an invalid archive result.');
    }
    return result;
  }

  async cancelBooking(input: CancelBookingStoreInput): Promise<CancelBookingResult> {
    return await this.rpc('cancel_client_booking', {
      p_client_id: input.clientId,
      p_booking_id: input.bookingId,
      p_occurred_at: input.occurredAt,
    }) as CancelBookingResult;
  }

  async submitReview(input: SubmitBookingReviewStoreInput): Promise<SubmitBookingReviewResult> {
    return await this.rpc('submit_client_booking_review', {
      p_client_id: input.clientId,
      p_booking_id: input.bookingId,
      p_review_id: input.reviewId,
      p_technique_rating: input.techniqueRating,
      p_professionalism_rating: input.professionalismRating,
      p_tags: input.tags,
      p_review_text: input.reviewText,
      p_occurred_at: input.occurredAt,
    }) as SubmitBookingReviewResult;
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
      throw new SupabaseBookingRepositoryError('Supabase booking data is unavailable.');
    }
    if (!response.ok) {
      throw new SupabaseBookingRepositoryError('Supabase rejected the booking operation.');
    }
    return response.json();
  }
}
