import type { BookingRequestIdGenerator } from '@/application/booking/booking-draft-controller';

export const bookingRequestIdGenerator: BookingRequestIdGenerator = {
  generate() {
    return `booking-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  },
};
