import { timeToMinutes } from '../../../shared/booking-time-slots.ts';

export { bookingTimeSlots, timeToMinutes } from '../../../shared/booking-time-slots.ts';

export function bookingStartTime(dateIso: string, time: string): number {
  const minutes = timeToMinutes(time);
  if (minutes < 0) return Number.NaN;
  const hours = Math.floor(minutes / 60).toString().padStart(2, '0');
  const remainder = (minutes % 60).toString().padStart(2, '0');
  return Date.parse(`${dateIso}T${hours}:${remainder}:00+03:00`);
}
