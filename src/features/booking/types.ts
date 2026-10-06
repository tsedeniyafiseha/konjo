import type { BookingPaymentMethodId } from '@/application/booking/booking-contracts';

export type {
  BookingAddress,
  BookingDraft,
  BookingPaymentMethodId,
  BookingReceipt,
} from '@/application/booking/booking-contracts';

export interface BookingPaymentMethod {
  id: BookingPaymentMethodId;
  label: string;
  description: string;
  tag?: string;
}

export interface CreateBookingInput {
  requestId: string;
  professionalId: string;
  serviceId: string;
  serviceName: string;
  dateIso: string;
  time: string;
  addressId: string;
  addressLabel: string;
  addressZone: string;
  addressDetail: string;
  paymentMethod: BookingPaymentMethodId;
  servicePrice: number;
  serviceFee?: number;
  travelFee: number;
  total: number;
}
