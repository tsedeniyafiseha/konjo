import type { ArchiveBookingCommandInput, ArchiveBookingResult } from './contracts.ts';
import type { BookingCancellationStore, Clock } from './ports.ts';

/**
 * "Remove from my history": the client hides a finished booking. The record,
 * its payments and its receipt stay intact for the professional, support and
 * accounting; only the client's list stops showing it.
 */
export class ArchiveBookingHandler {
  private readonly bookings: BookingCancellationStore;
  private readonly clock: Clock;

  constructor(bookings: BookingCancellationStore, clock: Clock) {
    this.bookings = bookings;
    this.clock = clock;
  }

  async execute(input: ArchiveBookingCommandInput): Promise<ArchiveBookingResult> {
    return await this.bookings.archiveBooking({ ...input, occurredAt: this.clock.now().toISOString() });
  }
}
