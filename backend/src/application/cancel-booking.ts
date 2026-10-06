import type {
  CancelBookingCommandInput,
  CancelBookingResult,
} from './contracts.ts';
import type { BookingCancellationStore, Clock } from './ports.ts';

export class CancelBookingHandler {
  private readonly bookings: BookingCancellationStore;
  private readonly clock: Clock;

  constructor(bookings: BookingCancellationStore, clock: Clock) {
    this.bookings = bookings;
    this.clock = clock;
  }

  async execute(input: CancelBookingCommandInput): Promise<CancelBookingResult> {
    return await this.bookings.cancelBooking({
      ...input,
      occurredAt: this.clock.now().toISOString(),
    });
  }
}
