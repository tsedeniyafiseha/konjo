import type {
  ApiBooking,
  ApiBookingPaymentMethod,
  ApiBookingReview,
  ApiBookingStatus,
  ApiPaymentIntent,
  ApiPaymentStatus,
} from '../../../../shared/api-contracts.ts';
import type { DatabaseSync } from 'node:sqlite';
import { bookingPaymentSummary } from '../../../../shared/booking-payments.ts';

export interface BookingRow {
  payment_plan?: 'full' | 'split';
  accepted_at?: string | null;
  travel_started_at?: string | null;
  arrived_at?: string | null;
  id: string;
  client_request_id: string | null;
  client_id: string;
  professional_id: string;
  service_id: string;
  service_name: string;
  date_iso: string;
  time: string;
  address_label: string;
  address_zone: string;
  address_detail: string;
  latitude?: number | null;
  longitude?: number | null;
  female_only: number;
  payment_method: ApiBookingPaymentMethod;
  service_price: number;
  service_fee?: number;
  travel_fee: number;
  total: number;
  extra_amount?: number;
  extra_fee?: number;
  extra_note?: string | null;
  proposed_date_iso?: string | null;
  proposed_time?: string | null;
  discount_amount?: number;
  discount_rate_bps?: number;
  discount_reason?: 'first_booking' | 'loyalty' | null;
  commission_rate_bps: number;
  status: ApiBookingStatus;
  started_at: string | null;
  completed_at: string | null;
  cancelled_by: string | null;
  cancellation_reason?: string | null;
  cancellation_policy: ApiBooking['cancellationPolicy'];
  accept_by: string;
  assignment_version: number;
  version: number;
  created_at: string;
  review_id?: string | null;
  technique_rating?: number | null;
  professionalism_rating?: number | null;
  review_tags_json?: string | null;
  review_text?: string | null;
  review_created_at?: string | null;
  payment_intent_id?: string | null;
  payment_provider?: ApiBookingPaymentMethod | null;
  payment_provider_reference?: string | null;
  payment_status?: ApiPaymentStatus | null;
  payment_amount?: number | null;
  payment_refunded_amount?: number | null;
  payment_currency?: 'ETB' | null;
  payment_checkout_url?: string | null;
  payment_created_at?: string | null;
  payment_updated_at?: string | null;
  tracking_latitude?: number | null;
  tracking_longitude?: number | null;
  tracking_accuracy_meters?: number | null;
  tracking_heading?: number | null;
  tracking_speed_mps?: number | null;
  tracking_area_label?: string | null;
  tracking_recorded_at?: string | null;
}

export interface PaymentIntentRow {
  stage?: 'full' | 'deposit' | 'balance';
  attempt?: number;
  id: string;
  booking_id: string;
  client_id: string;
  provider: ApiBookingPaymentMethod;
  provider_reference: string;
  status: ApiPaymentStatus;
  amount: number;
  refunded_amount: number;
  version: number;
  currency: 'ETB';
  checkout_url?: string | null;
  created_at: string;
  updated_at: string;
}

export function toApiPaymentIntent(row: PaymentIntentRow): ApiPaymentIntent {
  return {
    stage: row.stage ?? 'full',
    attempt: row.attempt ?? 1,
    id: row.id,
    bookingId: row.booking_id,
    provider: row.provider,
    providerReference: row.provider_reference,
    status: row.status,
    amount: row.amount,
    refundedAmount: row.refunded_amount,
    currency: row.currency,
    checkoutUrl: row.checkout_url ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toApiBooking(row: BookingRow, database?: DatabaseSync): ApiBooking {
  const review: ApiBookingReview | undefined = row.review_id && row.technique_rating && row.professionalism_rating
    ? {
        id: row.review_id,
        techniqueRating: row.technique_rating,
        professionalismRating: row.professionalism_rating,
        tags: JSON.parse(row.review_tags_json ?? '[]') as string[],
        reviewText: row.review_text ?? '',
        createdAt: row.review_created_at ?? row.created_at,
      }
    : undefined;
  const paymentIntent = row.payment_intent_id && row.payment_provider && row.payment_provider_reference &&
      row.payment_status && row.payment_amount !== null && row.payment_amount !== undefined &&
      row.payment_currency && row.payment_created_at && row.payment_updated_at
    ? {
        id: row.payment_intent_id,
        bookingId: row.id,
        provider: row.payment_provider,
        providerReference: row.payment_provider_reference,
        status: row.payment_status,
        amount: row.payment_amount,
        refundedAmount: row.payment_refunded_amount ?? 0,
        currency: row.payment_currency,
        checkoutUrl: row.payment_checkout_url ?? null,
        createdAt: row.payment_created_at,
        updatedAt: row.payment_updated_at,
      } satisfies ApiPaymentIntent
    : null;
  const tracking = row.tracking_latitude !== null && row.tracking_latitude !== undefined &&
      row.tracking_longitude !== null && row.tracking_longitude !== undefined && row.tracking_recorded_at
    ? {
        latitude: row.tracking_latitude,
        longitude: row.tracking_longitude,
        accuracyMeters: row.tracking_accuracy_meters ?? null,
        heading: row.tracking_heading ?? null,
        speedMps: row.tracking_speed_mps ?? null,
        areaLabel: row.tracking_area_label ?? null,
        recordedAt: row.tracking_recorded_at,
      }
    : null;
  const payments: ApiPaymentIntent[] = database ? (database.prepare('SELECT * FROM payment_intents WHERE booking_id = ? ORDER BY created_at, stage, attempt')
    .all(row.id) as unknown as PaymentIntentRow[]).map(toApiPaymentIntent) : paymentIntent ? [paymentIntent] : [];
  const summary = bookingPaymentSummary(row.total, row.payment_plan ?? 'full', row.status, payments, row.service_price + (row.service_fee ?? 0) + row.travel_fee - (row.discount_amount ?? 0));
  const current = (summary.dueStage ? payments.filter((payment) => payment.stage === summary.dueStage) : payments).at(-1) ?? null;
  return {
    paymentSummary: summary,
    payments,
    acceptedAt: row.accepted_at ?? null,
    travelStartedAt: row.travel_started_at ?? null,
    arrivedAt: row.arrived_at ?? null,
    id: row.id,
    clientId: row.client_id,
    professionalId: row.professional_id,
    serviceId: row.service_id,
    serviceName: row.service_name,
    dateIso: row.date_iso,
    time: row.time,
    proposedDateIso: row.proposed_date_iso ?? null,
    proposedTime: row.proposed_time ?? null,
    addressLabel: row.address_label,
    addressZone: row.address_zone,
    addressDetail: row.address_detail,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    femaleOnly: row.female_only === 1,
    paymentMethod: row.payment_method,
    servicePrice: row.service_price,
    serviceFee: row.service_fee ?? Math.round(row.service_price * 0.18),
    travelFee: row.travel_fee,
    extraAmount: row.extra_amount ?? 0,
    extraFee: row.extra_fee ?? 0,
    extraNote: row.extra_note ?? null,
    discountAmount: row.discount_amount ?? 0,
    discountRateBps: row.discount_rate_bps ?? 0,
    discountReason: row.discount_reason ?? null,
    total: row.total,
    commissionRateBps: row.commission_rate_bps,
    status: row.status,
    cancellationPolicy: row.cancellation_policy,
    cancelledBy: row.cancelled_by === 'client' || row.cancelled_by === 'professional' ? row.cancelled_by : null,
    cancellationReason: row.cancellation_reason ?? null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    paymentIntent: current,
    tracking,
    ...(review ? { review } : {}),
  };
}
