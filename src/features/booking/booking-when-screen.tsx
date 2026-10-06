import type { Href } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BookingFooter,
  BookingHeader,
  BookingPrimaryButton,
  MissingBooking,
} from '@/features/booking/booking-components';
import { useBooking } from '@/features/booking/booking-context';
import { BookingCalendar, monthKeyFor } from '@/features/booking/booking-calendar';
import { loadCalendarPreference, saveCalendarPreference } from '@/features/booking/calendar-preference';
import { bookingTimeSlots } from '@/features/booking/data';
import { parseLocalDateKey, toLocalDateKey } from '@/features/booking/date-utils';
import { type CalendarSystem, ethiopianTimeLabel, formatEthiopianDate, isoToEthiopian } from '@/features/booking/ethiopian-calendar';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, layout, palette, radii, spacing } from '@/theme/tokens';

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Clients can book any day from today up to this many days ahead. */
const BOOKING_WINDOW_DAYS = 56;

function isoDaysFromToday(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

export function BookingWhenScreen() {
  const { getAvailableSlots, getProfessional, loading: discoveryLoading, refresh: refreshDiscovery } = useDiscovery();
  const params = useLocalSearchParams<{ professionalId?: string; serviceIndex?: string }>();
  const professionalId = getSingleParam(params.professionalId);
  const rawServiceIndex = Number(getSingleParam(params.serviceIndex));
  const serviceIndex = Number.isInteger(rawServiceIndex) && rawServiceIndex >= 0 ? rawServiceIndex : 0;
  const requestedProfessional = getProfessional(professionalId);
  const requestedService = requestedProfessional?.services[serviceIndex];
  const { draft, ready, selectDate, selectTime, startBooking } = useBooking();
  const { language, t } = useClientCopy();
  const todayIso = useMemo(() => isoDaysFromToday(0), []);
  const maxIso = useMemo(() => isoDaysFromToday(BOOKING_WINDOW_DAYS), []);
  const [calendar, setCalendar] = useState<CalendarSystem>(language === 'am' ? 'ethiopian' : 'gregorian');
  // The month on screen follows the chosen date (or today) unless the person paged elsewhere.
  const [monthOverride, setMonthOverride] = useState<string | null>(null);
  const monthKey = monthOverride ?? monthKeyFor(draft?.dateIso ?? todayIso, calendar);

  useEffect(() => {
    let active = true;
    void loadCalendarPreference(language === 'am' ? 'ethiopian' : 'gregorian').then((preferred) => {
      if (!active) return;
      setCalendar(preferred);
      setMonthOverride(null);
    });
    return () => { active = false; };
    // Only the first load reads the stored preference; later switches come from the toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseCalendar = (next: CalendarSystem) => {
    setCalendar(next);
    setMonthOverride(null);
    void saveCalendarPreference(next);
  };
  const [availableSlots, setAvailableSlots] = useState<ReadonlySet<string>>(new Set());
  const [loadingSlots, setLoadingSlots] = useState(false);
  // Only the times the professional actually has free on that day, in order.
  const freeSlots = useMemo(() => bookingTimeSlots.filter((time) => availableSlots.has(time)), [availableSlots]);

  useEffect(() => {
    if (ready && requestedProfessional && requestedService) {
      void startBooking(requestedProfessional.id, serviceIndex);
    }
  }, [ready, requestedProfessional, requestedService, serviceIndex, startBooking]);

  // Book again can arrive before the catalog loaded (or after a failed load);
  // ask for the catalog once more before declaring the professional missing.
  const retriedCatalog = useRef(false);
  useEffect(() => {
    if (requestedProfessional || discoveryLoading || retriedCatalog.current) return;
    retriedCatalog.current = true;
    void refreshDiscovery();
  }, [discoveryLoading, refreshDiscovery, requestedProfessional]);

  useEffect(() => {
    if (!requestedProfessional || !requestedService || !draft?.dateIso) {
      return;
    }
    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoadingSlots(true);
    });
    getAvailableSlots({
      professionalId: requestedProfessional.id,
      dateIso: draft.dateIso,
      serviceId: requestedService.id,
    }).then((slots) => {
      if (!active) return;
      const nextSlots = new Set(slots);
      setAvailableSlots(nextSlots);
      if (draft.time && !nextSlots.has(draft.time)) selectTime('');
    }).catch((error: unknown) => {
      if (__DEV__) console.error('Unable to load available booking times.', error);
      if (active) setAvailableSlots(new Set());
    }).finally(() => {
      if (active) setLoadingSlots(false);
    });
    return () => {
      active = false;
    };
  }, [draft?.dateIso, draft?.time, getAvailableSlots, requestedProfessional, requestedService, selectTime]);

  const activeDraft =
    draft &&
    draft.professionalId === requestedProfessional?.id &&
    draft.serviceIndex === serviceIndex
      ? draft
      : null;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/browse' as Href);
  };

  if (!ready || discoveryLoading) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.loadingScreen}>
        <ActivityIndicator color={palette.olive} size="large" />
        <Text accessibilityRole="header" style={styles.loadingTitle}>{t('preparingBooking')}</Text>
      </SafeAreaView>
    );
  }

  if (!requestedProfessional || !requestedService) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <MissingBooking onExit={() => router.replace('/browse' as Href)} />
      </SafeAreaView>
    );
  }

  if (!activeDraft) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.loadingScreen}>
        <ActivityIndicator color={palette.olive} size="large" />
        <Text accessibilityRole="header" style={styles.loadingTitle}>{t('preparingBooking')}</Text>
      </SafeAreaView>
    );
  }

  const canContinue = Boolean(activeDraft.dateIso && activeDraft.time);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.contentFrame}>
          <BookingHeader label="When" onBack={goBack} step={1} />
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" style={styles.title}>{t('chooseDateTime')}</Text>

            <View accessibilityRole="radiogroup" style={styles.calendarToggle}>
              {(['gregorian', 'ethiopian'] as const).map((system) => {
                const selected = calendar === system;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={system}
                    onPress={() => chooseCalendar(system)}
                    style={[styles.calendarChip, selected && styles.calendarChipSelected]}>
                    <Text style={[styles.calendarChipLabel, selected && styles.calendarChipLabelSelected]}>
                      {system === 'gregorian' ? t('gregorianCalendar') : t('ethiopianCalendar')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <BookingCalendar
              calendar={calendar}
              labels={{ previousMonth: t('previousMonth'), nextMonth: t('nextMonth'), today: t('today') }}
              language={language}
              maxIso={maxIso}
              minIso={todayIso}
              monthKey={monthKey}
              onMonthChange={setMonthOverride}
              onSelect={(iso) => { setMonthOverride(null); selectDate(iso); }}
              selectedIso={activeDraft.dateIso}
            />
            <Text style={styles.calendarNote}>{t('bookingWindowNote')}</Text>
            {activeDraft.dateIso ? (
              <Text style={styles.selectedDate}>
                {selectedDateLabel(activeDraft.dateIso, calendar, language)}
              </Text>
            ) : null}

            <Text style={styles.sectionLabel}>{loadingSlots ? t('checkingAvailableTimes') : t('availableTimes')}</Text>
            <Text style={styles.calendarNote}>{calendar === 'ethiopian' ? t('ethiopianTimeNote') : t('localTimeNote')}</Text>
            {!loadingSlots && freeSlots.length === 0 ? <Text style={styles.noTimes}>{t('noTimesThisDay')}</Text> : null}
            <View accessibilityRole="radiogroup" style={styles.timeGrid}>
              {freeSlots.map((time) => {
                const unavailable = false;
                const selected = activeDraft.time === time && !unavailable;
                return (
                  <Pressable
                    accessibilityLabel={`${time}${calendar === 'ethiopian' ? ` (${ethiopianTimeLabel(time, language) ?? time})` : ''}${unavailable ? `, ${t('unavailable')}` : ''}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: unavailable }}
                    disabled={unavailable}
                    key={time}
                    onPress={() => selectTime(time)}
                    style={({ pressed }) => [
                      styles.timeCard,
                      selected && styles.timeCardSelected,
                      unavailable && styles.timeCardUnavailable,
                      pressed && styles.pressed,
                    ]}>
                    <Text
                      style={[
                        styles.timeLabel,
                        selected && styles.timeLabelSelected,
                        unavailable && styles.timeLabelUnavailable,
                      ]}>
                      {calendar === 'ethiopian' ? ethiopianTimeLabel(time, language) ?? time : time}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.summaryCard}>
              <Text style={styles.summaryEyebrow}>{t('bookingSummary')}</Text>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryName}>{requestedProfessional.name}</Text>
                <Text style={styles.summaryPrice}>ETB {requestedService.price.toLocaleString()}</Text>
              </View>
              <Text style={styles.summaryMeta}>
                {requestedService.name} · {requestedService.duration}
              </Text>
              {activeDraft.dateIso && activeDraft.time ? (
                <Text style={styles.summaryMeta}>
                  {selectedDateLabel(activeDraft.dateIso, calendar, language)} · {calendar === 'ethiopian' ? ethiopianTimeLabel(activeDraft.time, language) ?? activeDraft.time : activeDraft.time}
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={styles.footerSafeArea}>
        <BookingFooter>
          <BookingPrimaryButton
            disabled={!canContinue}
            label={canContinue ? t('continue') : t('selectDateTime')}
            onPress={() => router.push('/booking/where' as Href)}
          />
        </BookingFooter>
      </SafeAreaView>
    </View>
  );
}

/** The chosen day in the calendar in use, with the other calendar's date alongside so nobody is confused. */
function selectedDateLabel(iso: string, calendar: CalendarSystem, language: 'en' | 'am'): string {
  const date = parseLocalDateKey(iso);
  const gregorian = date ? date.toLocaleDateString(language === 'am' ? 'am-ET' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : iso;
  const ethiopian = formatEthiopianDate(isoToEthiopian(iso), language);
  return calendar === 'ethiopian' ? `${ethiopian} · ${gregorian}` : `${gregorian} · ${ethiopian}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  calendarToggle: { flexDirection: 'row', gap: 8, marginBottom: spacing.sm },
  calendarChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
  calendarChipSelected: { borderColor: palette.oliveDark, backgroundColor: palette.oliveDark },
  calendarChipLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 12.5 },
  calendarChipLabelSelected: { color: palette.white },
  calendarNote: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 12, marginTop: 8 },
  selectedDate: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13.5, marginTop: 6 },
  noTimes: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13.5, lineHeight: 20, marginTop: 8, marginBottom: 4 },
  loadingScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, backgroundColor: palette.canvas },
  loadingTitle: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 15 },
  safeArea: { flex: 1, alignItems: 'center' },
  contentFrame: { flex: 1, width: '100%', maxWidth: layout.contentMaxWidth },
  scrollView: { paddingHorizontal: spacing.lg },
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  title: {
    color: palette.text,
    fontFamily: fontFamilies.display.medium,
    fontSize: 26,
    lineHeight: 33,
  },
  dateScroller: { width: '100%' },
  dateList: {
    gap: 10,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  dateCard: {
    width: 58,
    minHeight: 70,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  dateCardSelected: { borderColor: palette.oliveDark, backgroundColor: palette.oliveDark },
  dateDay: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11 },
  dateNumber: { color: palette.text, fontFamily: fontFamilies.body.bold, fontSize: 17, marginTop: 4 },
  dateTextSelected: { color: palette.white },
  sectionLabel: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 13,
    marginTop: 22,
    marginBottom: spacing.sm,
  },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeCard: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: '28%',
    minHeight: 48,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.sm,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  timeCardSelected: { borderColor: palette.sage, backgroundColor: palette.sage },
  timeCardUnavailable: { borderColor: palette.surfaceMuted, backgroundColor: palette.surfaceMuted },
  timeLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  timeLabelSelected: { color: palette.white },
  timeLabelUnavailable: { color: palette.textMuted, textDecorationLine: 'line-through' },
  summaryCard: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: palette.surface,
    marginTop: 26,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  summaryEyebrow: {
    color: palette.textMuted,
    fontFamily: fontFamilies.body.medium,
    fontSize: 11,
    letterSpacing: 0.45,
    marginBottom: spacing.xs,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  summaryName: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  summaryPrice: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  summaryMeta: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, marginTop: 3 },
  footerSafeArea: { backgroundColor: palette.canvas },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
