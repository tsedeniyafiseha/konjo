import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { ApiClientRewards, ApiRewardReason } from '../../../../shared/api-contracts.ts';
import { readRewardSettings } from './platform-settings.ts';

interface CouponRow {
  id: string;
  client_id: string;
  milestone: number;
  rate_bps: number;
}

export interface RewardOffer {
  reason: ApiRewardReason;
  rateBps: number;
  couponId?: string;
}

/**
 * Client rewards (mirrors the Postgres functions): the first booking is
 * discounted, and every N completed bookings earn a coupon for the next one.
 * A coupon is free again when the booking that redeemed it was cancelled.
 */
export function availableRewardCoupon(database: DatabaseSync, clientId: string): CouponRow | null {
  return (database.prepare(`
    SELECT coupon.id, coupon.client_id, coupon.milestone, coupon.rate_bps
    FROM client_reward_coupons coupon
    LEFT JOIN bookings redeemed ON redeemed.id = coupon.redeemed_booking_id
    WHERE coupon.client_id = ? AND (coupon.redeemed_booking_id IS NULL OR redeemed.status = 'cancelled')
    ORDER BY coupon.milestone
    LIMIT 1
  `).get(clientId) as unknown as CouponRow | undefined) ?? null;
}

export function rewardOffer(database: DatabaseSync, clientId: string): RewardOffer | null {
  const settings = readRewardSettings(database);
  const hasBooking = database.prepare("SELECT 1 FROM bookings WHERE client_id = ? AND status <> 'cancelled' LIMIT 1").get(clientId);
  if (!hasBooking) return { reason: 'first_booking', rateBps: settings.rateBps };
  const coupon = availableRewardCoupon(database, clientId);
  return coupon ? { reason: 'loyalty', rateBps: coupon.rate_bps, couponId: coupon.id } : null;
}

export function rewardDiscount(servicePrice: number, offer: RewardOffer | null): number {
  return offer ? Math.round(servicePrice * offer.rateBps / 10_000) : 0;
}

export function redeemRewardCoupon(database: DatabaseSync, clientId: string, bookingId: string, occurredAt: string): void {
  const coupon = availableRewardCoupon(database, clientId);
  if (!coupon) return;
  database.prepare('UPDATE client_reward_coupons SET redeemed_booking_id = ?, redeemed_at = ? WHERE id = ?')
    .run(bookingId, occurredAt, coupon.id);
}

/** Called when a booking has just been completed: a coupon is earned on every Nth completed booking. */
export function awardRewardCoupon(database: DatabaseSync, bookingId: string, occurredAt: string): void {
  const booking = database.prepare("SELECT client_id FROM bookings WHERE id = ? AND status = 'completed'")
    .get(bookingId) as unknown as { client_id: string } | undefined;
  if (!booking) return;
  const settings = readRewardSettings(database);
  const completed = (database.prepare("SELECT COUNT(*) AS n FROM bookings WHERE client_id = ? AND status = 'completed'")
    .get(booking.client_id) as unknown as { n: number }).n;
  if (completed > 0 && completed % settings.everyBookings === 0) {
    database.prepare(`
      INSERT OR IGNORE INTO client_reward_coupons (id, client_id, milestone, rate_bps, earned_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(randomUUID(), booking.client_id, completed, settings.rateBps, occurredAt);
  }
}

export function clientRewards(database: DatabaseSync, clientId: string): ApiClientRewards {
  const settings = readRewardSettings(database);
  const completed = (database.prepare("SELECT COUNT(*) AS n FROM bookings WHERE client_id = ? AND status = 'completed'")
    .get(clientId) as unknown as { n: number }).n;
  const available = (database.prepare(`
    SELECT COUNT(*) AS n FROM client_reward_coupons coupon
    LEFT JOIN bookings redeemed ON redeemed.id = coupon.redeemed_booking_id
    WHERE coupon.client_id = ? AND (coupon.redeemed_booking_id IS NULL OR redeemed.status = 'cancelled')
  `).get(clientId) as unknown as { n: number }).n;
  const offer = rewardOffer(database, clientId);
  return {
    discountRateBps: settings.rateBps,
    everyBookings: settings.everyBookings,
    completedBookings: completed,
    bookingsUntilNextCoupon: settings.everyBookings - (completed % settings.everyBookings),
    availableCoupons: available,
    offer: offer ? { reason: offer.reason, rateBps: offer.rateBps } : null,
  };
}
