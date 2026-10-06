/** A complete local day in 30-minute increments, displayed even when a slot is unavailable. */
export const bookingTimeSlots: readonly string[] = Array.from({ length: 48 }, (_, index) => {
  const hour24 = Math.floor(index / 2);
  const minute = index % 2 === 0 ? '00' : '30';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${hour24 < 12 ? 'AM' : 'PM'}`;
});

export function timeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})\s(AM|PM)$/.exec(value);
  if (!match) return -1;
  const rawHour = Number(match[1]);
  const minute = Number(match[2]);
  if (rawHour < 1 || rawHour > 12 || minute < 0 || minute > 59) return -1;
  const hour = (rawHour % 12) + (match[3] === 'PM' ? 12 : 0);
  return hour * 60 + minute;
}
