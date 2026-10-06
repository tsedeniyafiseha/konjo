import type { BookingPaymentMethod } from '@/features/booking/types';
import { bookingTimeSlots } from '../../../shared/booking-time-slots';

export { bookingTimeSlots };

export const bookingPaymentMethods: readonly BookingPaymentMethod[] = [
  { id: 'telebirr', label: 'Telebirr', description: 'Mobile money' },
  { id: 'cbe', label: 'CBE Birr', description: 'Bank transfer' },
  { id: 'card', label: 'Visa / Mastercard', description: 'For diaspora & card payments' },
  { id: 'cash', label: 'Cash', description: 'Pay the specialist directly', tag: 'Pilot' },
];

export function getZoneTravelFee(zone: string): number {
  if (zone === 'Bole') return 0;
  if (zone === 'CMC' || zone === 'Kazanchis' || zone === 'Megenagna') return 150;
  return 250;
}
