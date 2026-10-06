import type {
  SubmitBookingReviewCommandInput,
  SubmitBookingReviewResult,
} from './contracts.ts';
import type { BookingReviewStore, Clock, IdGenerator } from './ports.ts';

export class SubmitBookingReviewHandler {
  private readonly reviews: BookingReviewStore;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;

  constructor(reviews: BookingReviewStore, ids: IdGenerator, clock: Clock) {
    this.reviews = reviews;
    this.ids = ids;
    this.clock = clock;
  }

  async execute(input: SubmitBookingReviewCommandInput): Promise<SubmitBookingReviewResult> {
    return await this.reviews.submitReview({
      ...input,
      tags: [...new Set(input.tags.map((tag) => tag.trim()))],
      reviewId: this.ids.next(),
      occurredAt: this.clock.now().toISOString(),
    });
  }
}
