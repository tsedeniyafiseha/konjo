import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { fontFamilies, palette, radii, spacing } from '@/theme/tokens';
import { parseLocalDateKey, toLocalDateKey } from './date-utils';
import {
  type CalendarSystem,
  type EthiopianDate,
  ethiopianMonthLength,
  ethiopianMonthName,
  ethiopianToIso,
  isoToEthiopian,
} from './ethiopian-calendar';

interface BookingCalendarProps {
  calendar: CalendarSystem;
  language: 'en' | 'am';
  /** First selectable day (local ISO). */
  minIso: string;
  /** Last selectable day (local ISO). */
  maxIso: string;
  selectedIso: string | null;
  /** The month currently shown; Gregorian "YYYY-MM" or Ethiopian "YYYY-MM" keyed by the calendar in use. */
  monthKey: string;
  onMonthChange(monthKey: string): void;
  onSelect(iso: string): void;
  labels: { previousMonth: string; nextMonth: string; today: string };
}

interface CalendarCell {
  iso: string;
  dayNumber: number;
  weekday: number;
  enabled: boolean;
}

const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_AM = ['ሰኞ', 'ማክ', 'ረቡ', 'ሐሙ', 'ዓር', 'ቅዳ', 'እሑ'];

/** Monday = 0 … Sunday = 6 for a local ISO date. */
function weekdayOf(iso: string): number {
  const date = parseLocalDateKey(iso) ?? new Date();
  return (date.getDay() + 6) % 7;
}

export function monthKeyFor(iso: string, calendar: CalendarSystem): string {
  if (calendar === 'ethiopian') {
    const date = isoToEthiopian(iso);
    return `${date.year}-${String(date.month).padStart(2, '0')}`;
  }
  return iso.slice(0, 7);
}

function shiftMonthKey(monthKey: string, calendar: CalendarSystem, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const monthsPerYear = calendar === 'ethiopian' ? 13 : 12;
  const index = year * monthsPerYear + (month - 1) + delta;
  const nextYear = Math.floor(index / monthsPerYear);
  const nextMonth = (index % monthsPerYear) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

function cellsFor(monthKey: string, calendar: CalendarSystem, minIso: string, maxIso: string): CalendarCell[] {
  const [year, month] = monthKey.split('-').map(Number);
  if (calendar === 'ethiopian') {
    const length = ethiopianMonthLength(year, month);
    return Array.from({ length }, (_, index) => {
      const date: EthiopianDate = { year, month, day: index + 1 };
      const iso = ethiopianToIso(date);
      return { iso, dayNumber: date.day, weekday: weekdayOf(iso), enabled: iso >= minIso && iso <= maxIso };
    });
  }
  const length = new Date(year, month, 0).getDate();
  return Array.from({ length }, (_, index) => {
    const iso = toLocalDateKey(new Date(year, month - 1, index + 1, 12));
    return { iso, dayNumber: index + 1, weekday: weekdayOf(iso), enabled: iso >= minIso && iso <= maxIso };
  });
}

function monthTitle(monthKey: string, calendar: CalendarSystem, language: 'en' | 'am'): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (calendar === 'ethiopian') {
    return language === 'am' ? `${ethiopianMonthName(month, 'am')} ${year} ዓ.ም.` : `${ethiopianMonthName(month, 'en')} ${year}`;
  }
  return new Date(year, month - 1, 1).toLocaleDateString(language === 'am' ? 'am-ET' : 'en-US', { month: 'long', year: 'numeric' });
}

/**
 * Month grid for picking a booking date, in the Gregorian or the Ethiopian
 * calendar. Selection always yields the Gregorian ISO key the API uses.
 */
export function BookingCalendar({ calendar, language, minIso, maxIso, selectedIso, monthKey, onMonthChange, onSelect, labels }: BookingCalendarProps) {
  const cells = useMemo(() => cellsFor(monthKey, calendar, minIso, maxIso), [calendar, maxIso, minIso, monthKey]);
  const firstMonth = monthKeyFor(minIso, calendar);
  const lastMonth = monthKeyFor(maxIso, calendar);
  const canGoBack = monthKey > firstMonth;
  const canGoForward = monthKey < lastMonth;
  const weekdays = language === 'am' ? WEEKDAYS_AM : WEEKDAYS_EN;
  const leadingBlanks = cells[0]?.weekday ?? 0;
  const todayIso = minIso;

  return (
    <View style={styles.calendar}>
      <View style={styles.monthRow}>
        <Pressable accessibilityLabel={labels.previousMonth} accessibilityRole="button" disabled={!canGoBack} hitSlop={8} onPress={() => onMonthChange(shiftMonthKey(monthKey, calendar, -1))} style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}>
          <KonjoIcon color={canGoBack ? palette.text : palette.textMuted} name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={18} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.monthTitle, language === 'am' && styles.ethiopic]}>{monthTitle(monthKey, calendar, language)}</Text>
        <Pressable accessibilityLabel={labels.nextMonth} accessibilityRole="button" disabled={!canGoForward} hitSlop={8} onPress={() => onMonthChange(shiftMonthKey(monthKey, calendar, 1))} style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}>
          <KonjoIcon color={canGoForward ? palette.text : palette.textMuted} name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={18} />
        </Pressable>
      </View>
      <View style={styles.weekRow}>
        {weekdays.map((day) => <Text key={day} style={[styles.weekday, language === 'am' && styles.ethiopic]}>{day}</Text>)}
      </View>
      <View accessibilityRole="radiogroup" style={styles.grid}>
        {Array.from({ length: leadingBlanks }, (_, index) => <View key={`blank-${index}`} style={styles.cell} />)}
        {cells.map((cell) => {
          const selected = cell.iso === selectedIso;
          const today = cell.iso === todayIso;
          return (
            <Pressable
              accessibilityLabel={`${cell.dayNumber}${today ? `, ${labels.today}` : ''}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: !cell.enabled }}
              disabled={!cell.enabled}
              key={cell.iso}
              onPress={() => onSelect(cell.iso)}
              style={({ pressed }) => [styles.cell, pressed && cell.enabled && styles.pressed]}>
              <View style={[styles.day, selected && styles.daySelected, today && !selected && styles.dayToday]}>
                <Text style={[styles.dayText, !cell.enabled && styles.dayTextDisabled, selected && styles.dayTextSelected]}>{cell.dayNumber}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  calendar: { borderWidth: 1, borderColor: palette.border, borderRadius: radii.lg, backgroundColor: palette.surface, padding: spacing.md },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  monthTitle: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 15 },
  navButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceMuted },
  navButtonDisabled: { opacity: 0.45 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', color: palette.textMuted, fontFamily: fontFamilies.body.medium, fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: palette.oliveDark },
  dayToday: { borderWidth: 1, borderColor: palette.olive },
  dayText: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  dayTextDisabled: { color: palette.textMuted, opacity: 0.55 },
  dayTextSelected: { color: palette.white },
  pressed: { opacity: 0.7 },
  ethiopic: { fontFamily: fontFamilies.ethiopic.regular },
});
