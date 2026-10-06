const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value: number) {
  return String(value).padStart(2, '0');
}

export function toLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseLocalDateKey(dateKey: string) {
  if (!DATE_KEY_PATTERN.test(dateKey)) return null;

  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return toLocalDateKey(date) === dateKey ? date : null;
}

export function getBookingDays(count = 7, locale = 'en-US', todayLabel = 'Today') {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);

    return {
      iso: toLocalDateKey(date),
      dayNumber: date.getDate(),
      dayLabel:
        index === 0
          ? todayLabel
          : date.toLocaleDateString(locale, { weekday: 'short' }),
      fullLabel: date.toLocaleDateString(locale, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    };
  });
}
