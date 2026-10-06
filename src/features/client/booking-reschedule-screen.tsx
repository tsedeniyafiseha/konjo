import type { Href } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookingFooter, BookingHeader, BookingPrimaryButton } from '@/features/booking/booking-components';
import { HorizontalScrollView } from '@/components/ui/horizontal-scroll-view';
import { bookingTimeSlots } from '@/features/booking/data';
import { getBookingDays } from '@/features/booking/date-utils';
import { useClientData } from '@/features/client/client-data-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, layout, palette, radii, spacing } from '@/theme/tokens';

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function BookingRescheduleScreen() {
  const { getAvailableSlots } = useDiscovery();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const bookingId = getParam(params.bookingId);
  const { bookings, rescheduleBooking } = useClientData();
  const { language, t } = useClientCopy();
  const booking = bookings.find((item) => item.id === bookingId);
  const days = useMemo(
    () => getBookingDays(14, language === 'am' ? 'am-ET' : 'en-US', t('today')),
    [language, t],
  );
  const currentDateIsAvailable = days.some((day) => day.iso === booking?.dateIso);
  const [dateIso, setDateIso] = useState(currentDateIsAvailable ? booking?.dateIso ?? '' : '');
  const [time, setTime] = useState(booking?.time ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<ReadonlySet<string>>(new Set());
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => {
    if (!booking || !dateIso) {
      return;
    }
    let active = true;
    Promise.resolve().then(() => {
      if (active) setLoadingSlots(true);
    });
    getAvailableSlots({
      professionalId: booking.professionalId,
      dateIso,
      serviceId: booking.serviceId,
      excludeBookingId: booking.id,
    }).then((slots) => {
      if (!active) return;
      const nextSlots = new Set(slots);
      setAvailableSlots(nextSlots);
      if (time && !nextSlots.has(time)) setTime('');
    }).catch((error: unknown) => {
      if (__DEV__) console.error('Unable to load rescheduling times.', error);
      if (active) setAvailableSlots(new Set());
    }).finally(() => {
      if (active) setLoadingSlots(false);
    });
    return () => {
      active = false;
    };
  }, [booking, dateIso, getAvailableSlots, time]);

  const canReschedule = booking?.status === 'requested' || booking?.status === 'accepted';
  const changed = Boolean(booking && (dateIso !== booking.dateIso || time !== booking.time));

  const submit = async () => {
    if (!booking || !dateIso || !time || !changed) return;
    setSubmitting(true);
    try {
      await rescheduleBooking(booking.id, dateIso, time);
      router.replace(`/booking/${encodeURIComponent(booking.id)}` as Href);
    } catch (error) {
      if (__DEV__) console.error('Unable to reschedule booking.', error);
      Alert.alert(t('bookingNotRescheduled'), error instanceof Error ? error.message : t('pleaseTryAgain'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!booking || !canReschedule) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.centered}>
        <Text accessibilityRole="header" style={styles.title}>{t('reschedulingUnavailable')}</Text>
        <Text style={styles.description}>{t('reschedulingUnavailableBody')}</Text>
        <Pressable onPress={() => router.replace('/bookings' as Href)} style={styles.backAction}>
          <Text style={styles.backActionLabel}>{t('viewBookings')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.contentFrame}>
          <BookingHeader label="Reschedule" onBack={() => router.back()} step={1} totalSteps={1} />
          <ScrollView contentContainerStyle={styles.scrollContent} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" style={styles.title}>{t('chooseNewTime')}</Text>
            <Text style={styles.description}>{t('currentBookingTime').replace('{service}', booking.serviceName).replace('{date}', booking.dateLabel).replace('{time}', booking.time)}</Text>

            <HorizontalScrollView contentContainerStyle={styles.dateList} showsHorizontalScrollIndicator={false}>
              {days.map((day) => {
                const selected = dateIso === day.iso;
                return (
                  <Pressable
                    accessibilityLabel={day.fullLabel}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={day.iso}
                    onPress={() => setDateIso(day.iso)}
                    style={[styles.dateCard, selected && styles.selectedCard]}>
                    <Text style={[styles.dateDay, selected && styles.selectedText]}>{day.dayLabel}</Text>
                    <Text style={[styles.dateNumber, selected && styles.selectedText]}>{day.dayNumber}</Text>
                  </Pressable>
                );
              })}
            </HorizontalScrollView>

            <Text style={styles.sectionLabel}>{loadingSlots ? t('checkingAvailableTimes') : t('availableTimes')}</Text>
            <View accessibilityRole="radiogroup" style={styles.timeGrid}>
              {bookingTimeSlots.map((slot) => {
                const unavailable = !availableSlots.has(slot);
                const selected = time === slot && !unavailable;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, disabled: unavailable }}
                    disabled={unavailable}
                    key={slot}
                    onPress={() => setTime(slot)}
                    style={[styles.timeCard, selected && styles.selectedCard, unavailable && styles.unavailableCard]}>
                    <Text style={[styles.timeLabel, selected && styles.selectedText, unavailable && styles.unavailableText]}>{slot}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.notice}>
              <Text style={styles.noticeText}>{t('rescheduleNotice')}</Text>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <BookingFooter>
          <BookingPrimaryButton
            disabled={!dateIso || !time || !changed || submitting}
            label={submitting ? t('saving') : changed ? t('saveNewTime') : t('chooseNewTime')}
            onPress={submit}
          />
        </BookingFooter>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  safeArea: { flex: 1, alignItems: 'center' },
  contentFrame: { flex: 1, width: '100%', maxWidth: layout.contentMaxWidth },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  title: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 27, lineHeight: 34 },
  description: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13, lineHeight: 20, marginTop: spacing.xs },
  dateList: { gap: 10, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  dateCard: { width: 58, minHeight: 70, borderWidth: 1, borderColor: palette.border, borderRadius: 10, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  dateDay: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11 },
  dateNumber: { color: palette.text, fontFamily: fontFamilies.body.bold, fontSize: 17, marginTop: 4 },
  selectedCard: { borderColor: palette.sage, backgroundColor: palette.sage },
  selectedText: { color: palette.white },
  sectionLabel: { color: palette.textSecondary, fontFamily: fontFamilies.body.semibold, fontSize: 13, marginTop: spacing.md, marginBottom: spacing.sm },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  timeCard: { flexBasis: 0, flexGrow: 1, minWidth: '28%', minHeight: 48, borderWidth: 1, borderColor: palette.border, borderRadius: radii.sm, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  timeLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  unavailableCard: { borderColor: palette.surfaceMuted, backgroundColor: palette.surfaceMuted },
  unavailableText: { color: palette.textMuted, textDecorationLine: 'line-through' },
  notice: { borderRadius: radii.sm, backgroundColor: palette.sageSoft, marginTop: spacing.xl, padding: spacing.md },
  noticeText: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18 },
  footer: { backgroundColor: palette.canvas },
  centered: { flex: 1, backgroundColor: palette.canvas, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl },
  backAction: { minHeight: 46, borderRadius: radii.sm, backgroundColor: palette.sage, justifyContent: 'center', marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  backActionLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
});
