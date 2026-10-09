import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { ApiBookingReview } from '../../../../shared/api-contracts.ts';
import type {
  SubmitBookingReviewResult,
  SubmitBookingReviewStoreInput,
} from '../../application/contracts.ts';
import type { BookingReviewStore } from '../../application/ports.ts';
import { domainEventTypes } from '../../domain/events.ts';
import type { BookingRow } from './booking-records.ts';
import type { SqliteDomainEventOutbox } from './domain-event-outbox.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqliteBookingReviewRepository implements BookingReviewStore {
  private readonly database: DatabaseSync;
  private readonly domainEvents: SqliteDomainEventOutbox;
  private readonly unitOfWork: SqliteUnitOfWork;

  constructor(
    database: DatabaseSync,
    domainEvents: SqliteDomainEventOutbox,
    unitOfWork = new SqliteUnitOfWork(database),
  ) {
    this.database = database;
    this.domainEvents = domainEvents;
    this.unitOfWork = unitOfWork;
  }

  submitReview(input: SubmitBookingReviewStoreInput): SubmitBookingReviewResult {
    return this.unitOfWork.run(() => {
      const booking = this.database.prepare(
        'SELECT * FROM bookings WHERE id = ? AND client_id = ?',
      ).get(input.bookingId, input.clientId) as unknown as BookingRow | undefined;
      if (!booking) return { result: 'not_found' };
      if (booking.status !== 'completed') return { result: 'not_completed' };
      const existing = this.database.prepare('SELECT id FROM booking_reviews WHERE booking_id = ?')
        .get(input.bookingId) as unknown as { id: string } | undefined;
      if (existing) return { result: 'already_reviewed' };

      const review: ApiBookingReview = {
        id: input.reviewId,
        techniqueRating: input.techniqueRating,
        professionalismRating: input.professionalismRating,
        tags: input.tags,
        reviewText: input.reviewText,
        createdAt: input.occurredAt,
      };
      this.database.prepare(`
        INSERT INTO booking_reviews (
          id, booking_id, client_id, professional_id, technique_rating,
          professionalism_rating, tags_json, review_text, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        review.id,
        input.bookingId,
        input.clientId,
        booking.professional_id,
        review.techniqueRating,
        review.professionalismRating,
        JSON.stringify(review.tags),
        review.reviewText,
        review.createdAt,
      );
      const ratings = this.database.prepare(`
        SELECT COUNT(*) AS count,
          AVG((technique_rating + professionalism_rating) / 2.0) AS average_rating
        FROM booking_reviews WHERE professional_id = ? AND visible = 1
      `).get(booking.professional_id) as unknown as { count: number; average_rating: number };
      const professional = this.database.prepare(`
        SELECT rating_baseline, review_count_baseline FROM professionals WHERE id = ?
      `).get(booking.professional_id) as unknown as {
        rating_baseline: number;
        review_count_baseline: number;
      };
      const reviewCount = professional.review_count_baseline + ratings.count;
      const averageRating = reviewCount === 0
        ? 0
        : (
            professional.rating_baseline * professional.review_count_baseline +
            ratings.average_rating * ratings.count
          ) / reviewCount;
      this.domainEvents.enqueue({
        eventType: domainEventTypes.reviewSubmitted,
        schemaVersion: 1,
        aggregateType: 'review',
        aggregateId: review.id,
        aggregateVersion: 1,
        occurredAt: review.createdAt,
        correlationId: booking.client_request_id ?? input.bookingId,
        causationId: `booking:${input.bookingId}:review`,
        payload: {
          clientId: input.clientId,
          professionalId: booking.professional_id,
          bookingId: input.bookingId,
          reviewId: review.id,
          averageRating,
        },
      });
      if (averageRating < 3) {
        const qualityFlagId = randomUUID();
        const inserted = this.database.prepare(`
          INSERT OR IGNORE INTO professional_quality_flags (
            id, professional_id, booking_id, average_rating, status, resolution, created_at
          ) VALUES (?, ?, ?, ?, 'open', '', ?)
        `).run(qualityFlagId, booking.professional_id, input.bookingId, averageRating, review.createdAt);
        this.database.prepare('UPDATE professionals SET hidden = 1 WHERE id = ?').run(booking.professional_id);
        if (inserted.changes > 0) {
          this.domainEvents.enqueue({
            eventType: domainEventTypes.professionalRatingThresholdCrossed,
            schemaVersion: 1,
            aggregateType: 'professional_quality_flag',
            aggregateId: qualityFlagId,
            aggregateVersion: 1,
            occurredAt: review.createdAt,
            correlationId: booking.client_request_id ?? input.bookingId,
            causationId: review.id,
            payload: {
              professionalId: booking.professional_id,
              bookingId: input.bookingId,
              qualityFlagId,
              averageRating,
            },
          });
        }
      }
      return { result: 'created', review };
    });
  }
}
