import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { BookingPrimaryButton, MissingBooking } from '@/features/booking/booking-components';
import { useBooking } from '@/features/booking/booking-context';
import { parseLocalDateKey } from '@/features/booking/date-utils';
import { useClientAccount } from '@/features/client/account/client-account-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, layout, palette, radii, spacing } from '@/theme/tokens';

export function BookingConfirmationScreen() {
  const { getProfessional } = useDiscovery();
  const { clearBooking, draft, receipt } = useBooking();
  const { account } = useClientAccount();
  const { language, t } = useClientCopy();
  const professional = getProfessional(draft?.professionalId);
  const service = draft ? professional?.services[draft.serviceIndex] : undefined;
  const address = account?.addresses.find((item) => item.id === draft?.addressId);
  const date = draft?.dateIso ? parseLocalDateKey(draft.dateIso) : null;

  if (!receipt || !draft || !professional || !service || !address || !date || !draft.time) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <MissingBooking onExit={() => router.replace('/browse' as Href)} />
      </SafeAreaView>
    );
  }

  const dateLabel = date.toLocaleDateString(language === 'am' ? 'am-ET' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const trackBooking = () => {
    const bookingId = receipt.bookingId;
    clearBooking();
    router.replace(`/booking/${encodeURIComponent(bookingId)}` as Href);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.successMark}>
            <KonjoIcon
              color={palette.white}
              name={{ ios: 'checkmark', android: 'check', web: 'check' }}
              size={28}
            />
          </View>
          <Text accessibilityRole="header" style={styles.title}>{t('bookingRequested')}</Text>
          <Text style={styles.description}>
            {t('professionalNotified').replace('{name}', professional.firstName)}
          </Text>

          <View style={styles.detailCard}>
            <Text style={styles.eyebrow}>{t('appointmentDetails')}</Text>
            <DetailRow label={t('specialist')} value={professional.name} />
            <DetailRow label={t('service')} value={service.name} />
            <DetailRow label={t('when')} value={`${dateLabel} · ${draft.time}`} />
            <DetailRow label={t('where')} value={address.detail} />
            <View style={styles.divider} />
            {receipt.discountAmount ? (
              <DetailRow
                label={t(receipt.discountReason === 'loyalty' ? 'discountLoyalty' : 'discountFirstBooking').replace('{percent}', String(Math.round(receipt.discountAmount / receipt.servicePrice * 100)))}
                value={`−ETB ${receipt.discountAmount.toLocaleString()}`}
              />
            ) : null}
            <DetailRow
              emphasized
              label={t('estimatedTotal')}
              value={`ETB ${receipt.total.toLocaleString()}`}
            />
            <DetailRow
              label={t('travelFee')}
              value={t('travelFeeSetByProfessional')}
            />
          </View>

          <View style={styles.paymentNotice}>
            <KonjoIcon
              color={palette.olive}
              name={{ ios: 'shield', android: 'shield', web: 'shield' }}
              size={18}
            />
            <Text style={styles.paymentNoticeText}>
              {t('paymentAfterAcceptance')}
            </Text>
          </View>

          {__DEV__ ? (
            <Text style={styles.reference}>{t('developmentRequest')} · {receipt.bookingId}</Text>
          ) : null}

          <View style={styles.buttonWrapper}>
            <BookingPrimaryButton label={t('trackBooking')} onPress={trackBooking} />
            <Pressable
              accessibilityRole="button"
              onPress={() => { clearBooking(); router.replace('/home' as Href); }}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
              <Text style={styles.secondaryButtonLabel}>{t('backToHome')}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function DetailRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, emphasized && styles.detailEmphasis]}>{label}</Text>
      <Text style={[styles.detailValue, emphasized && styles.detailEmphasis]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: layout.horizontalPadding,
  },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    paddingVertical: spacing.xl,
  },
  successMark: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    color: palette.text,
    fontFamily: fontFamilies.display.medium,
    fontSize: 31,
    lineHeight: 38,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  description: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  detailCard: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    gap: 9,
    marginTop: spacing.xl,
    padding: spacing.md,
  },
  eyebrow: {
    color: palette.textMuted,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 10,
    letterSpacing: 0.55,
    marginBottom: 2,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  detailLabel: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5 },
  detailValue: {
    flex: 1,
    color: palette.text,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'right',
  },
  detailEmphasis: { color: palette.text, fontFamily: fontFamilies.body.bold, fontSize: 14 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: 2 },
  paymentNotice: {
    borderRadius: radii.md,
    backgroundColor: palette.sageSoft,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
  },
  paymentNoticeText: {
    flex: 1,
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 11.5,
    lineHeight: 17,
  },
  reference: {
    color: palette.textMuted,
    fontFamily: fontFamilies.body.regular,
    fontSize: 10,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  buttonWrapper: { marginTop: spacing.xl, gap: spacing.sm },
  secondaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.sm, borderWidth: 1, borderColor: palette.border },
  secondaryButtonLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  pressed: { opacity: 0.7 },
});
