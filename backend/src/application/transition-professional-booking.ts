import type {
  TransitionProfessionalBookingCommandInput,
  TransitionProfessionalBookingResult,
} from './contracts.ts';
import type { Clock, ProfessionalBookingTransitionStore } from './ports.ts';

export class TransitionProfessionalBookingHandler {
  private readonly bookings: ProfessionalBookingTransitionStore;
  private readonly clock: Clock;

  constructor(bookings: ProfessionalBookingTransitionStore, clock: Clock) {
    this.bookings = bookings;
    this.clock = clock;
  }

  async execute(
    input: TransitionProfessionalBookingCommandInput,
  ): Promise<TransitionProfessionalBookingResult> {
    return await this.bookings.transitionBooking({
      ...input,
      occurredAt: this.clock.now().toISOString(),
    });
  }
}
