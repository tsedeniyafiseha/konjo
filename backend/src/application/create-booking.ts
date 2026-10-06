import type { BookingCreationResult, BookingQuoteFailureReason, CreateBookingCommandInput } from './contracts.ts';
import type { BookingCommandStore } from './ports.ts';

export class CreateBookingHandler {
  private readonly bookings: BookingCommandStore;

  constructor(bookings: BookingCommandStore) {
    this.bookings = bookings;
  }

  async execute(input: CreateBookingCommandInput): Promise<BookingCreationResult | null> {
    const existing = await this.bookings.findBookingByRequest(input.clientId, input.requestId);
    if (existing) return existing;

    const quote = await this.bookings.quoteBooking(input);
    if (!quote) return null;
    return this.bookings.commitBooking(input, quote);
  }

  /** After execute() answered null: the first reason the request cannot be fulfilled, or null if it now can. */
  async explainUnavailability(input: CreateBookingCommandInput): Promise<BookingQuoteFailureReason | null> {
    return await this.bookings.explainQuoteFailure(input);
  }
}
