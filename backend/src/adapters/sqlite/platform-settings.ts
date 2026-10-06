import type { DatabaseSync } from 'node:sqlite';

import type { ApiAdminPlatformSettings } from '../../../../shared/api-contracts.ts';

export const platformSettingKeys = {
  commissionRateBps: 'commission_rate_bps',
  travelFeeCap: 'travel_fee_cap_etb',
  rewardDiscountRateBps: 'reward_discount_rate_bps',
  rewardEveryBookings: 'reward_every_bookings',
} as const;

/** Default maximum travel fee (ETB) seeded for new databases. Administrators change it at runtime. */
export const defaultTravelFeeCap = 500;
/** Rewards: 20% off the first booking and the booking after every 10th completed one. */
export const defaultRewardDiscountRateBps = 2000;
export const defaultRewardEveryBookings = 10;

export function readRewardSettings(database: DatabaseSync): { rateBps: number; everyBookings: number } {
  const read = (key: string, fallback: number) => (database.prepare('SELECT value_integer FROM platform_settings WHERE key = ?')
    .get(key) as unknown as { value_integer: number } | undefined)?.value_integer ?? fallback;
  return {
    rateBps: read(platformSettingKeys.rewardDiscountRateBps, defaultRewardDiscountRateBps),
    everyBookings: Math.max(1, read(platformSettingKeys.rewardEveryBookings, defaultRewardEveryBookings)),
  };
}

interface PlatformSettingRow {
  key: string;
  value_integer: number;
  updated_at: string;
}

/** Reads the platform-wide pricing rules as a single settings document. */
export function readPlatformSettings(database: DatabaseSync): ApiAdminPlatformSettings {
  const rows = database.prepare(`
    SELECT key, value_integer, updated_at
    FROM platform_settings
    WHERE key IN (?, ?)
  `).all(platformSettingKeys.commissionRateBps, platformSettingKeys.travelFeeCap) as unknown as PlatformSettingRow[];
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const commission = byKey.get(platformSettingKeys.commissionRateBps);
  if (!commission) throw new Error('The commission rate platform setting is missing.');
  const travelFeeCap = byKey.get(platformSettingKeys.travelFeeCap);
  const updatedAt = [commission.updated_at, travelFeeCap?.updated_at ?? '']
    .reduce((latest, value) => (value > latest ? value : latest));
  return {
    commissionRateBps: commission.value_integer,
    commissionRatePercent: commission.value_integer / 100,
    travelFeeCap: travelFeeCap?.value_integer ?? defaultTravelFeeCap,
    updatedAt,
  };
}

/** The current cap a professional's travel fee must not exceed. */
export function readTravelFeeCap(database: DatabaseSync): number {
  const row = database.prepare('SELECT value_integer FROM platform_settings WHERE key = ?')
    .get(platformSettingKeys.travelFeeCap) as unknown as { value_integer: number } | undefined;
  return row?.value_integer ?? defaultTravelFeeCap;
}

/** A travel fee is a whole, non-negative amount of ETB no greater than the cap. */
export function isValidTravelFee(travelFee: number, cap: number): boolean {
  return Number.isInteger(travelFee) && travelFee >= 0 && travelFee <= cap;
}
