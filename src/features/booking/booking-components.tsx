import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import type { ClientCopyKey } from '@/localization/client-copy';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, layout, palette, spacing } from '@/theme/tokens';

export function BookingHeader({
  step,
  totalSteps = 3,
  label,
  onBack,
}: {
  step: 1 | 2 | 3;
  totalSteps?: 1 | 3;
  label: 'When' | 'Where' | 'Pay' | 'Payment' | 'Reschedule';
  onBack: () => void;
}) {
  const { t } = useClientCopy();
  const labelKeys: Record<typeof label, ClientCopyKey> = {
    When: 'when',
    Where: 'where',
    Pay: 'pay',
    Payment: 'paymentMethod',
    Reschedule: 'reschedule',
  };
  const stepLabel = t('bookingStep')
    .replace('{step}', String(step))
    .replace('{total}', String(totalSteps))
    .replace('{label}', t(labelKeys[label]).toUpperCase());

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={t('goBack')}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
        <KonjoIcon
          color={palette.text}
          name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
          size={19}
        />
      </Pressable>
      <Text style={styles.stepLabel}>{stepLabel}</Text>
    </View>
  );
}

export function BookingPrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { t } = useClientCopy();
  const unavailable = disabled || loading;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        unavailable && styles.primaryButtonDisabled,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.primaryButtonLabel, unavailable && styles.primaryButtonLabelDisabled]}>
        {loading ? t('processing') : label}
      </Text>
    </Pressable>
  );
}

export function BookingFooter({ children }: { children: ReactNode }) {
  return (
    <View style={styles.footer}>
      <View style={styles.footerContent}>{children}</View>
    </View>
  );
}

export function SelectionIndicator({ selected }: { selected: boolean }) {
  return (
    <View style={[styles.radio, selected && styles.radioSelected]}>
      {selected ? (
        <KonjoIcon
          color={palette.white}
          name={{ ios: 'checkmark', android: 'check', web: 'check' }}
          size={11}
        />
      ) : null}
    </View>
  );
}

export function PriceSummary({
  serviceName,
  servicePrice,
  travelFee,
  serviceFee,
  zone,
  discount,
  emphasize = false,
}: {
  serviceName: string;
  servicePrice: number;
  travelFee: number;
  serviceFee?: number;
  zone?: string;
  /** Reward taken off the service price, when the client has one. */
  discount?: { amount: number; reason: 'first_booking' | 'loyalty'; percent: number } | null;
  emphasize?: boolean;
}) {
  const { t } = useClientCopy();
  const fee = serviceFee ?? Math.round(servicePrice * 0.18);
  const total = servicePrice + fee + travelFee - (discount?.amount ?? 0);
  return (
    <View style={styles.summaryCard}>
      {!emphasize ? <Text style={styles.summaryEyebrow}>{t('bookingSummary')}</Text> : null}
      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>{serviceName}</Text>
        <Text style={styles.summaryText}>ETB {servicePrice.toLocaleString()}</Text>
      </View>
      <View style={[styles.summaryRow, styles.summarySecondaryRow]}>
        <Text style={styles.summarySecondary}>{t('serviceFee')}</Text>
        <Text style={styles.summarySecondary}>ETB {fee.toLocaleString()}</Text>
      </View>
      <View style={[styles.summaryRow, styles.summarySecondaryRow]}>
        <Text style={styles.summarySecondary}>{t('travelFee')}{zone ? ` (${zone})` : ''}</Text>
        <Text style={styles.summarySecondary}>ETB {travelFee.toLocaleString()}</Text>
      </View>
      {discount && discount.amount > 0 ? (
        <View style={[styles.summaryRow, styles.summarySecondaryRow]}>
          <Text style={styles.summaryReward}>{t(discount.reason === 'first_booking' ? 'discountFirstBooking' : 'discountLoyalty').replace('{percent}', String(discount.percent))}</Text>
          <Text style={styles.summaryReward}>−ETB {discount.amount.toLocaleString()}</Text>
        </View>
      ) : null}
      <View style={styles.divider} />
      <View style={styles.summaryRow}>
        <Text style={styles.totalLabel}>{t('total')}</Text>
        <Text style={styles.totalValue}>ETB {total.toLocaleString()}</Text>
      </View>
    </View>
  );
}

export function MissingBooking({ onExit }: { onExit: () => void }) {
  const { t } = useClientCopy();
  return (
    <View style={styles.missing}>
      <Text accessibilityRole="header" style={styles.missingTitle}>{t('bookingUnavailableTitle')}</Text>
      <Text style={styles.missingCopy}>{t('bookingUnavailableBody')}</Text>
      <BookingPrimaryButton label={t('browseSpecialists')} onPress={onExit} />
    </View>
  );
}

const styles = StyleSheet.create({
  summaryReward: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    color: palette.textMuted,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 11,
    letterSpacing: 0.55,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  primaryButton: {
    minHeight: layout.controlHeight,
    borderRadius: 6,
    backgroundColor: palette.sage,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryButtonDisabled: {
    backgroundColor: palette.surfaceMuted,
  },
  primaryButtonLabel: {
    color: palette.white,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 15,
  },
  primaryButtonLabelDisabled: {
    color: palette.textMuted,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    backgroundColor: 'rgba(250, 249, 245, 0.98)',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  footerContent: {
    alignSelf: 'stretch',
    maxWidth: layout.contentMaxWidth,
  },
  radio: {
    width: 20,
    height: 20,
    flexShrink: 0,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: palette.sage,
    backgroundColor: palette.sage,
  },
  summaryCard: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: palette.surface,
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summarySecondaryRow: {
    marginTop: 6,
  },
  summaryText: {
    color: palette.text,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 14,
  },
  summarySecondary: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 13,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginVertical: 10,
  },
  totalLabel: {
    color: palette.text,
    fontFamily: fontFamilies.body.bold,
    fontSize: 15,
  },
  totalValue: {
    color: palette.text,
    fontFamily: fontFamilies.body.bold,
    fontSize: 16,
  },
  missing: {
    flex: 1,
    justifyContent: 'center',
    width: 'auto',
    alignSelf: 'stretch',
    maxWidth: layout.contentMaxWidth,
    marginHorizontal: layout.horizontalPadding,
  },
  missingTitle: {
    color: palette.text,
    fontFamily: fontFamilies.display.medium,
    fontSize: 28,
    textAlign: 'center',
  },
  missingCopy: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 14,
    lineHeight: 21,
    marginVertical: spacing.lg,
    textAlign: 'center',
  },
});
