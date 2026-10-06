import type {
  RescheduleBookingCommandInput,
  RescheduleBookingResult,
} from './contracts.ts';
import type { BookingRescheduleStore, Clock } from './ports.ts';

export class RescheduleBookingHandler {
  private readonly bookings: BookingRescheduleStore;
  private readonly clock: Clock;

  constructor(bookings: BookingRescheduleStore, clock: Clock) {
    this.bookings = bookings;
    this.clock = clock;
  }

  async execute(input: RescheduleBookingCommandInput): Promise<RescheduleBookingResult> {
    return await this.bookings.rescheduleBooking({
      ...input,
      occurredAt: this.clock.now().toISOString(),
    });
  }
}
