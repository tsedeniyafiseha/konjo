import type {
  ApiBooking,
  ApiBookingTracking,
  ApiNotificationPreferences,
  ApiPaymentStatus,
  ApiRewardReason,
} from '../../../shared/api-contracts';
import type {
  BookingPaymentMethodId,
  BookingReceipt,
} from '../booking/booking-contracts';

export type ClientBookingStatus = ApiBooking['status'];

export interface ClientBooking {
  paymentSummary?: ApiBooking['paymentSummary'];
  /** Platform commission rate on this booking (basis points). */
  commissionRateBps?: number;
  /** Extra services the professional named at checkout, the fee on them, and what they were for. */
  extraAmount?: number;
  extraFee?: number;
  extraNote?: string | null;
  /** Reward off the service price (first booking or loyalty coupon), funded by Konjo. */
  discountAmount?: number;
  discountReason?: ApiRewardReason | null;
  payments?: ApiBooking['payments'];
  arrivedAt?: string | null;
  id: string;
  professionalId: string;
  serviceId: string;
  serviceName: string;
  dateIso: string;
  dateLabel: string;
  time: string;
  /** New time the client asked for on an accepted booking, until the professional answers. */
  proposedDateIso?: string | null;
  proposedTime?: string | null;
  total: number;
  travelFee: number;
  address: string;
  paymentMethod: BookingPaymentMethodId;
  paymentIntentId?: string;
  paymentStatus?: ApiPaymentStatus;
  /** Hosted checkout for online payment methods, once the intent exists. */
  checkoutUrl?: string | null;
  status: ClientBookingStatus;
  cancellationPolicy: ApiBooking['cancellationPolicy'];
  cancelledBy?: 'client' | 'professional' | null;
  cancellationReason?: string | null;
  /** Address pin for the visit, when the saved address had one. */
  latitude?: number | null;
  longitude?: number | null;
  /** Latest live position of the professional while en route / on site. */
  tracking?: ApiBookingTracking | null;
  rated: boolean;
  rating?: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export type NotificationPreferenceKey = keyof ApiNotificationPreferences;

export interface NewClientBooking {
  receipt: BookingReceipt;
  professionalId: string;
  serviceId: string;
  serviceName: string;
  dateIso: string;
  dateLabel: string;
  time: string;
  total: number;
  address: string;
  paymentMethod: BookingPaymentMethodId;
}

export interface BookingRatingInput {
  techniqueRating: number;
  professionalismRating: number;
  tags: readonly string[];
  reviewText: string;
}
