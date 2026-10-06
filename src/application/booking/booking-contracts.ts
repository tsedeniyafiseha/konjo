import type { ApiRewardReason } from '../../../shared/api-contracts';

export type BookingPaymentMethodId = 'telebirr' | 'cbe' | 'card' | 'cash';

export interface BookingAddress {
  id: string;
  label: string;
  zone: string;
  detail: string;
  fee: number;
  /** Consented GPS pin captured when the address was saved. */
  latitude?: number | null;
  longitude?: number | null;
}

export interface BookingDraft {
  requestId: string;
  professionalId: string;
  serviceIndex: number;
  dateIso: string | null;
  time: string | null;
  addressId: string | null;
  paymentMethod: BookingPaymentMethodId;
}

export interface BookingReceipt {
  bookingId: string;
  paymentIntentId?: string;
  paymentStatus: 'not_started' | 'pending' | 'cash_due' | 'authorized' | 'captured';
  paymentReference?: string;
  requestStatus: 'requested';
  createdAt: string;
  servicePrice: number;
  serviceFee?: number;
  travelFee: number;
  /** Reward taken off the service price (funded by Konjo), and why it applied. */
  discountAmount?: number;
  discountReason?: ApiRewardReason | null;
  total: number;
}
