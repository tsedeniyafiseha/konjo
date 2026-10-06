import { Image } from 'expo-image';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTabBar } from '@/components/navigation/app-tab-bar';
import { KonjoIcon } from '@/components/ui/konjo-icon';
import { type ClientBooking, useClientData } from '@/features/client/client-data-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, layout, palette, radii, spacing } from '@/theme/tokens';

type BookingTab = 'upcoming' | 'past';

function BookingCard({ booking, past, onRemove }: { booking: ClientBooking; past: boolean; onRemove?: () => void }) {
  const { t } = useClientCopy();
  const { getProfessional } = useDiscovery();
  const professional = getProfessional(booking.professionalId);
  if (!professional) return null;
  const isCancelled = booking.status === 'cancelled';
  const receiptReady = booking.status === 'completed' && booking.paymentSummary?.fullyPaid === true;

  const rebook = () => {
    router.push(
      `/booking/when?professionalId=${encodeURIComponent(professional.id)}&serviceIndex=0` as Href,
    );
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (isCancelled) {
          rebook();
          return;
        }
        router.push(
          receiptReady
            ? (`/receipt/${encodeURIComponent(booking.id)}` as Href)
            : (`/booking/${encodeURIComponent(booking.id)}` as Href),
        );
      }}
      style={({ pressed }) => [styles.bookingCard, pressed && styles.pressed]}>
      {!past || isCancelled ? (
        <View style={styles.bookingMetaRow}>
          <View style={styles.statusBadge}>
            <Text style={styles.statusLabel}>{booking.status === 'cancelled' && booking.cancelledBy === 'professional' ? t('declinedByProfessional') : t(booking.status === 'on_the_way' ? 'onTheWay' : booking.status === 'in_progress' ? 'inProgress' : booking.status)}</Text>
          </View>
          <Text style={styles.dateLabel}>{booking.dateLabel} · {booking.time}</Text>
        </View>
      ) : null}
      <View style={[styles.bookingIdentity, !past && styles.bookingIdentitySpaced]}>
        <View style={styles.avatar}>
          {professional.image ? (
            <Image contentFit="cover" source={professional.image} style={StyleSheet.absoluteFill} />
          ) : (
            <Text style={styles.avatarInitials}>{professional.initials}</Text>
          )}
        </View>
        <View style={styles.bookingCopy}>
          <Text style={styles.professionalName}>{professional.name}</Text>
          <Text style={styles.serviceName}>
            {booking.serviceName}{past ? ` · ${booking.dateLabel}` : ''}
          </Text>
        </View>
        <Text style={styles.price}>ETB {booking.total.toLocaleString()}</Text>
      </View>
      {past ? (
        <View style={styles.cardActions}>
          <Pressable accessibilityRole="button" onPress={rebook} style={styles.rebookButton}>
            <Text style={styles.rebookLabel}>{t('bookAgain')}</Text>
          </Pressable>
          {receiptReady ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/receipt/${encodeURIComponent(booking.id)}` as Href)}
              style={styles.receiptButton}>
              <Text style={styles.receiptLabel}>{t('receipt')}</Text>
            </Pressable>
          ) : null}
          {onRemove ? (
            <Pressable accessibilityLabel={t('removeBooking')} accessibilityRole="button" hitSlop={8} onPress={onRemove} style={({ pressed }) => [styles.removeButton, pressed && styles.removeButtonPressed]}>
              <KonjoIcon color={'#BA1A1A'} name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={18} />
              <Text style={styles.removeLabel}>{t('removeBooking')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

export function BookingsScreen() {
  const { t } = useClientCopy();
  const { bookings, archiveBooking } = useClientData();
  const [tab, setTab] = useState<BookingTab>('upcoming');
  const confirmRemove = (bookingId: string) => {
    Alert.alert(t('removeBookingTitle'), t('removeBookingBody'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('removeBooking'), style: 'destructive', onPress: () => { archiveBooking(bookingId).catch(() => Alert.alert(t('removeBookingFailed'))); } },
    ]);
  };
  const visibleBookings = useMemo(
    () => bookings.filter((booking) => (
      tab === 'past'
        ? (booking.status === 'completed' && booking.paymentSummary?.fullyPaid === true) || booking.status === 'cancelled'
        : booking.status !== 'cancelled' && (booking.status !== 'completed' || booking.paymentSummary?.fullyPaid !== true)
    )),
    [bookings, tab],
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Text accessibilityRole="header" style={styles.title}>{t('navBookings')}</Text>
            <View accessibilityRole="tablist" style={styles.segment}>
              {(['upcoming', 'past'] as const).map((option) => {
                const selected = tab === option;
                return (
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    key={option}
                    onPress={() => setTab(option)}
                    style={[styles.segmentButton, selected && styles.segmentButtonSelected]}>
                    <Text style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>
                      {t(option)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.bookingList}>
              {visibleBookings.map((booking) => (
                <BookingCard booking={booking} key={booking.id} onRemove={tab === 'past' ? () => confirmRemove(booking.id) : undefined} past={tab === 'past'} />
              ))}
              {!visibleBookings.length ? (
                <View style={styles.emptyState}>
                  <KonjoIcon
                    color={palette.textMuted}
                    name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }}
                    size={36}
                  />
                  <Text style={styles.emptyTitle}>{t(tab === 'upcoming' ? 'noUpcomingBookings' : 'noPastBookings')}</Text>
                  <Text style={styles.emptyCopy}>{t(tab === 'upcoming' ? 'nextServiceHere' : 'historyHere')}</Text>
                  <Pressable onPress={() => router.push('/browse' as Href)} style={styles.browseButton}>
                    <Text style={styles.browseLabel}>{t('browseSpecialists')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
      <AppTabBar activeTab="Bookings" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  safeArea: { flex: 1 },
  scrollContent: { alignItems: 'center', paddingBottom: spacing.xl },
  content: { width: '100%', maxWidth: layout.contentMaxWidth },
  title: {
    color: palette.text,
    fontFamily: fontFamilies.display.medium,
    fontSize: 26,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  segment: { flexDirection: 'row', gap: 6, borderRadius: radii.pill, backgroundColor: palette.surfaceMuted, marginHorizontal: spacing.lg, marginTop: spacing.lg, padding: 4 },
  segmentButton: { flex: 1, minHeight: 38, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  segmentButtonSelected: { backgroundColor: palette.surface },
  segmentLabel: { color: palette.textMuted, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  segmentLabelSelected: { color: palette.text },
  bookingList: { gap: 10, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  bookingCard: { borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, padding: 14 },
  bookingMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  statusBadge: { borderRadius: radii.pill, backgroundColor: palette.sageSoft, paddingHorizontal: 10, paddingVertical: 4 },
  statusLabel: { color: palette.olive, fontFamily: fontFamilies.body.bold, fontSize: 10.5 },
  dateLabel: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 12 },
  bookingIdentity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bookingIdentitySpaced: { marginTop: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden', backgroundColor: palette.sageSoft, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: palette.olive, fontFamily: fontFamilies.display.regular, fontSize: 14 },
  bookingCopy: { flex: 1 },
  professionalName: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  serviceName: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, marginTop: 2 },
  price: { color: palette.text, fontFamily: fontFamilies.body.bold, fontSize: 14 },
  cardActions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  rebookButton: { flex: 1, minHeight: 40, borderRadius: 6, backgroundColor: palette.olive, alignItems: 'center', justifyContent: 'center' },
  rebookLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 12.5 },
  receiptButton: { flex: 1, minHeight: 40, borderWidth: 1, borderColor: palette.border, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  removeButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: '#BA1A1A', borderRadius: 6 },
  removeButtonPressed: { opacity: 0.7 },
  removeLabel: { color: '#BA1A1A', fontFamily: fontFamilies.body.semibold, fontSize: 12.5 },
  receiptLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 12.5 },
  emptyState: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: 50 },
  emptyTitle: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 15, marginTop: spacing.sm },
  emptyCopy: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13, marginTop: 4, textAlign: 'center' },
  browseButton: { minHeight: 44, borderRadius: 6, backgroundColor: palette.sage, justifyContent: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.md },
  browseLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  pressed: { opacity: 0.75 },
});
