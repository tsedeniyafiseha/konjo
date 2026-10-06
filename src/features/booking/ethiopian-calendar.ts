/**
 * Ethiopian (Ge'ez) calendar support for the booking flow. Dates travel through
 * the app and the API as Gregorian ISO keys; this module only converts for
 * display and for laying out the calendar grid. Conversions go through the
 * Julian Day Number, the standard approach for the Ethiopic calendar.
 */
export type CalendarSystem = 'gregorian' | 'ethiopian';

export interface EthiopianDate {
  year: number;
  /** 1–13; 13 is Pagume (5 days, 6 in a leap year). */
  month: number;
  day: number;
}

const ETHIOPIC_EPOCH_JDN = 1723856;

const mod = (value: number, base: number) => ((value % base) + base) % base;

export function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

export function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

export function ethiopianToJdn(date: EthiopianDate): number {
  return ETHIOPIC_EPOCH_JDN + 365 * date.year + Math.floor(date.year / 4) + 30 * date.month + date.day - 31;
}

export function jdnToEthiopian(jdn: number): EthiopianDate {
  const offset = jdn - ETHIOPIC_EPOCH_JDN;
  const r = mod(offset, 1461);
  const n = mod(r, 365) + 365 * Math.floor(r / 1460);
  return {
    year: 4 * Math.floor(offset / 1461) + Math.floor(r / 365) - Math.floor(r / 1460),
    month: Math.floor(n / 30) + 1,
    day: mod(n, 30) + 1,
  };
}

/** "YYYY-MM-DD" (Gregorian, local) → Ethiopian date. */
export function isoToEthiopian(iso: string): EthiopianDate {
  const [year, month, day] = iso.split('-').map(Number);
  return jdnToEthiopian(gregorianToJdn(year, month, day));
}

/** Ethiopian date → "YYYY-MM-DD" (Gregorian). */
export function ethiopianToIso(date: EthiopianDate): string {
  const { year, month, day } = jdnToGregorian(ethiopianToJdn(date));
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isEthiopianLeapYear(year: number): boolean {
  return mod(year, 4) === 3;
}

export function ethiopianMonthLength(year: number, month: number): number {
  return month === 13 ? (isEthiopianLeapYear(year) ? 6 : 5) : 30;
}

const MONTHS_AM = ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'];
const MONTHS_EN = ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miyazya', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'];

export function ethiopianMonthName(month: number, language: 'en' | 'am'): string {
  return (language === 'am' ? MONTHS_AM : MONTHS_EN)[month - 1] ?? '';
}

/** "መስከረም 20 2019 ዓ.ም." or "Meskerem 20, 2019 E.C.". */
export function formatEthiopianDate(date: EthiopianDate, language: 'en' | 'am'): string {
  return language === 'am'
    ? `${ethiopianMonthName(date.month, 'am')} ${date.day} ${date.year} ዓ.ም.`
    : `${ethiopianMonthName(date.month, 'en')} ${date.day}, ${date.year} E.C.`;
}

/**
 * Ethiopian clock label for a 12-hour slot such as "2:30 PM". Ethiopian time
 * counts from sunrise: 7:00 AM is 1:00 in the morning, 2:30 PM is 8:30 in
 * the afternoon. Returns null when the slot cannot be parsed.
 */
export function ethiopianTimeLabel(slot: string, language: 'en' | 'am'): string | null {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(slot.trim());
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  const ethiopianHour = mod(hour - 6, 12) === 0 ? 12 : mod(hour - 6, 12);
  const period = hour >= 6 && hour < 12 ? 0 : hour >= 12 && hour < 18 ? 1 : hour >= 18 ? 2 : 3;
  const periods = language === 'am' ? ['ጠዋት', 'ከሰዓት', 'ማታ', 'ሌሊት'] : ['morning', 'afternoon', 'evening', 'night'];
  return `${ethiopianHour}:${match[2]} ${periods[period]}`;
}
