import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import {
  BookingFooter,
  BookingHeader,
  BookingPrimaryButton,
  MissingBooking,
  PriceSummary,
  SelectionIndicator,
} from '@/features/booking/booking-components';
import { useBooking } from '@/features/booking/booking-context';
import { bookingPaymentMethods } from '@/features/booking/data';
import { bookingService, BookingServiceError } from '@/features/booking/booking-service';
import { parseLocalDateKey } from '@/features/booking/date-utils';
import { useClientData } from '@/features/client/client-data-context';
import { useClientAccount } from '@/features/client/account/client-account-context';
import { useClientIdentityDocuments } from '@/features/client/identity-documents/client-identity-document-context';
import { useAuthSession } from '@/features/auth/session-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import type { ClientCopyKey } from '@/localization/client-copy';
import { useClientCopy } from '@/localization/use-client-copy';
import { rewardDiscountFor, useClientRewards } from '@/features/rewards/use-client-rewards';
import { fontFamilies, layout, palette, spacing, radii } from '@/theme/tokens';

/**
 * Localized fallback messages for booking refusals. The API names the reason;
 * the client tells the person what happened and what to do next, in their
 * language, instead of surfacing a raw error.
 */
function bookingRefusalMessage(error: BookingServiceError, professionalName: string, t: (key: ClientCopyKey) => string): string {
  const withName = (key: ClientCopyKey) => t(key).replace('{name}', professionalName);
  switch (error.apiCode) {
    case 'PROFESSIONAL_BUSY': return withName('bookingRefusedBusy');
    case 'PROFESSIONAL_UNAVAILABLE': return withName('bookingRefusedUnavailable');
    case 'SERVICE_UNAVAILABLE': return withName('bookingRefusedService');
    case 'SERVICE_ZONE_UNAVAILABLE': return t('bookingRefusedZone');
    case 'TIME_UNAVAILABLE':
    case 'SLOT_UNAVAILABLE': return withName('bookingRefusedTime');
    case 'CLIENT_IDENTITY_REQUIRED': return error.message;
    default:
      if (error.status === 429) return t('bookingRefusedRateLimited');
      return error.status && error.status >= 500 ? t('bookingSubmitError') : error.message || t('bookingSubmitError');
  }
}

function PaymentMark({ label }: { label: string }) {
  const mark = label === 'Visa / Mastercard' ? 'CARD' : label.replace(' Birr', '').toUpperCase();
  return (
    <View style={styles.paymentMark}>
      <Text numberOfLines={1} style={styles.paymentMarkLabel}>{mark}</Text>
    </View>
  );
}

export function BookingPaymentScreen() {
  const { getProfessional } = useDiscovery();
  const { draft, selectPaymentMethod, setReceipt } = useBooking();
  const { addBooking } = useClientData();
  const { account } = useClientAccount();
  const { session } = useAuthSession();
  const { language, t } = useClientCopy();
  const { rewards } = useClientRewards();
  const identityDocuments = useClientIdentityDocuments();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [identityMethod, setIdentityMethod] = useState<'passport' | 'national_id'>('passport');
  const controllerRef = useRef<AbortController | null>(null);
  const professional = getProfessional(draft?.professionalId);
  const service = draft ? professional?.services[draft.serviceIndex] : undefined;
  const address = account?.addresses.find((item) => item.id === draft?.addressId);
  const bookingReady = Boolean(
    draft?.dateIso && draft.time && professional && service && address,
  );
  const massageBooking = professional?.category === 'massage';

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  if (!bookingReady || !draft || !professional || !service || !address) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <MissingBooking onExit={() => router.replace('/browse' as Href)} />
      </SafeAreaView>
    );
  }

  const serviceFee = Math.round(service.price * 0.18);
  // Travel fee is set by the professional when they accept — excluded from the initial request total.
  // A reward (welcome discount or loyalty coupon) is applied by the API; shown here so the client sees it before confirming.
  const discount = rewardDiscountFor(rewards, service.price);
  const total = service.price + serviceFee - (discount?.amount ?? 0);

  const submitBooking = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const receipt = await bookingService.createBooking(
        {
          requestId: draft.requestId,
          professionalId: professional.id,
          serviceId: service.id,
          serviceName: service.name,
          dateIso: draft.dateIso!,
          time: draft.time!,
          addressId: address.id,
          addressLabel: address.label,
          addressZone: address.zone,
          addressDetail: address.detail,
          paymentMethod: draft.paymentMethod,
          servicePrice: service.price,
          serviceFee,
          travelFee: 0, // Professional sets travel fee on acceptance
          total,
        },
        session?.accessToken,
        controller.signal,
      );
      const bookingDate = parseLocalDateKey(draft.dateIso!);
      addBooking({
        receipt,
        professionalId: professional.id,
        serviceId: service.id,
        serviceName: service.name,
        dateIso: draft.dateIso!,
        dateLabel: bookingDate
          ? bookingDate.toLocaleDateString(language === 'am' ? 'am-ET' : 'en-US', { month: 'short', day: 'numeric' })
          : draft.dateIso!,
        time: draft.time!,
        total: receipt.total,
        address: address.detail,
        paymentMethod: draft.paymentMethod,
      });
      setReceipt(receipt);
      router.replace('/booking/confirmation' as Href);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      // A refusal (4xx) is an expected outcome with a message for the client,
      // not a defect: log it quietly and show the localized fallback.
      const refusal = error instanceof BookingServiceError && typeof error.status === 'number' && error.status >= 400 && error.status < 500;
      if (__DEV__) (refusal ? console.warn : console.error)('Unable to submit booking request.', error);
      setErrorMessage(
        error instanceof BookingServiceError
          ? bookingRefusalMessage(error, professional.firstName, t)
          : t('bookingSubmitError'),
      );
    } finally {
      if (!controller.signal.aborted) setSubmitting(false);
      controllerRef.current = null;
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.contentFrame}>
          <BookingHeader label="Payment" onBack={() => router.back()} step={3} />
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" style={styles.title}>{t('paymentMethod')}</Text>

            {massageBooking ? (
              <View style={styles.identityCard}>
                <View style={styles.identityHeader}>
                  <KonjoIcon color={palette.olive} name={{ ios: 'person.badge.shield.checkmark', android: 'verified_user', web: 'verified_user' }} size={20} />
                  <View style={styles.identityCopy}>
                    <Text style={styles.identityTitle}>{language === 'am' ? 'የማንነት ሰነድ' : 'Identity document'}</Text>
                    <Text style={styles.identityBody}>{language === 'am' ? 'ፓስፖርትዎን ወይም የመታወቂያዎን ፊትና ጀርባ ይጫኑ። ፈቃድ ያለው የKonjo ገምጋሚ ብቻ ያየዋል።' : 'Upload a passport bio page, or the front and back of your ID. Only authorized Konjo reviewers can open it.'}</Text>
                  </View>
                </View>
                {identityDocuments.approved ? (
                  <Text style={styles.identityVerified}>✓ {language === 'am' ? 'ማንነትዎ ጸድቋል' : 'Identity approved'}</Text>
                ) : identityDocuments.pending ? (
                  <Text style={styles.identityPending}>{language === 'am' ? 'ሰነዶችዎ ለምርመራ ተልከዋል።' : 'Your documents are awaiting manual review.'}</Text>
                ) : (
                  <View style={styles.identityForm}>
                    <View style={styles.identityMethodRow}>
                      {(['passport', 'national_id'] as const).map((method) => (
                        <Pressable key={method} onPress={() => setIdentityMethod(method)} style={[styles.identityMethod, identityMethod === method && styles.identityMethodSelected]}>
                          <Text style={[styles.identityMethodLabel, identityMethod === method && styles.identityMethodLabelSelected]}>{method === 'passport' ? 'Passport' : 'National ID'}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {identityMethod === 'passport' ? (
                      <Pressable disabled={identityDocuments.busy} onPress={() => { void identityDocuments.uploadDocument('passport'); }} style={styles.identityButton}>
                        <Text style={styles.identityButtonLabel}>{identityDocuments.busy ? 'Uploading…' : 'Upload passport bio page'}</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.identityUploadRow}>
                        <Pressable disabled={identityDocuments.busy || Boolean(identityDocuments.front)} onPress={() => { void identityDocuments.uploadDocument('national_id_front'); }} style={[styles.identityButton, Boolean(identityDocuments.front) && styles.identityButtonComplete]}>
                          <Text style={styles.identityButtonLabel}>{identityDocuments.front ? '✓ Front added' : 'Upload ID front'}</Text>
                        </Pressable>
                        <Pressable disabled={identityDocuments.busy || Boolean(identityDocuments.back)} onPress={() => { void identityDocuments.uploadDocument('national_id_back'); }} style={[styles.identityButton, Boolean(identityDocuments.back) && styles.identityButtonComplete]}>
                          <Text style={styles.identityButtonLabel}>{identityDocuments.back ? '✓ Back added' : 'Upload ID back'}</Text>
                        </Pressable>
                      </View>
                    )}
                    {identityDocuments.error ? <Pressable onPress={identityDocuments.dismissError}><Text style={styles.errorText}>{identityDocuments.error}</Text></Pressable> : null}
                    {identityDocuments.rejectedReason ? <Text style={styles.errorText}>Document rejected: {identityDocuments.rejectedReason}</Text> : null}
                  </View>
                )}
              </View>
            ) : null}

            <View accessibilityRole="radiogroup" style={styles.paymentList}>
              {bookingPaymentMethods.filter((method) => method.id !== 'cash').map((method) => {
                const selected = method.id === draft.paymentMethod;
                const descriptionKeys: Record<typeof method.id, ClientCopyKey> = {
                  telebirr: 'mobileMoney',
                  cbe: 'bankTransfer',
                  card: 'diasporaCard',
                  cash: 'paySpecialist',
                };
                const description = t(descriptionKeys[method.id]);
                return (
                  <Pressable
                    accessibilityLabel={`${method.label}, ${description}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={method.id}
                    onPress={() => selectPaymentMethod(method.id)}
                    style={({ pressed }) => [
                      styles.paymentCard,
                      selected && styles.paymentCardSelected,
                      pressed && styles.pressed,
                    ]}>
                    <SelectionIndicator selected={selected} />
                    <PaymentMark label={method.label} />
                    <View style={styles.paymentCopy}>
                      <Text style={styles.paymentName}>{method.label}</Text>
                      <Text style={styles.paymentDescription}>{description}</Text>
                    </View>
                    {method.tag ? (
                      <View style={[styles.tag, selected && styles.tagSelected]}>
                        <Text style={[styles.tagLabel, selected && styles.tagLabelSelected]}>
                          {method.tag ? t('pilot') : null}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>

            {discount ? (
              <View style={styles.rewardNote}>
                <KonjoIcon color={palette.olive} name={{ ios: 'gift', android: 'card_giftcard', web: 'card_giftcard' }} size={16} />
                <Text style={styles.rewardNoteText}>{t(discount.reason === 'first_booking' ? 'rewardAppliedFirst' : 'rewardAppliedLoyalty').replace('{percent}', String(discount.percent))}</Text>
              </View>
            ) : null}
            <View style={styles.summaryWrapper}>
              <PriceSummary
                discount={discount}
                emphasize
                serviceName={service.name}
                servicePrice={service.price}
                serviceFee={serviceFee}
                travelFee={0}
              />
            </View>

            <View style={styles.securityNote}>
              <KonjoIcon
                color={palette.textMuted}
                name={{ ios: 'shield', android: 'shield', web: 'shield' }}
                size={16}
              />
              <Text style={styles.securityCopy}>
                {t('paymentSecurity')}
              </Text>
            </View>

            {__DEV__ ? (
              <Text style={styles.developmentNote}>
                {t('developmentPayment')}
              </Text>
            ) : null}

            {errorMessage ? (
              <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.errorText}>
                {errorMessage}
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={styles.footerSafeArea}>
        <BookingFooter>
          <BookingPrimaryButton
            disabled={massageBooking && !identityDocuments.approved}
            label={`${t('requestBooking')} · ETB ${total.toLocaleString()}`}
            loading={submitting}
            onPress={submitBooking}
          />
        </BookingFooter>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  rewardNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md, borderRadius: radii.md, backgroundColor: palette.sageSoft, paddingHorizontal: 14, paddingVertical: 10 },
  rewardNoteText: { flex: 1, color: palette.text, fontFamily: fontFamilies.body.medium, fontSize: 13, lineHeight: 18 },
  screen: { flex: 1, backgroundColor: palette.canvas },
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
  paymentList: { gap: 10, paddingTop: spacing.lg },
  identityCard: { borderWidth: 1, borderColor: palette.border, borderRadius: 10, backgroundColor: palette.surface, marginTop: spacing.lg, padding: spacing.md },
  identityHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  identityCopy: { flex: 1 },
  identityTitle: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  identityBody: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 17, marginTop: 3 },
  identityVerified: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 12.5, marginTop: spacing.md },
  identityPending: { color: palette.textSecondary, fontFamily: fontFamilies.body.semibold, fontSize: 12.5, marginTop: spacing.md },
  identityForm: { gap: spacing.sm, marginTop: spacing.md },
  identityMethodRow: { flexDirection: 'row', gap: spacing.sm },
  identityMethod: { borderColor: palette.border, borderRadius: 8, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 9 },
  identityMethodSelected: { backgroundColor: palette.sageSoft, borderColor: palette.sage },
  identityMethodLabel: { color: palette.textSecondary, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  identityMethodLabelSelected: { color: palette.oliveDark },
  identityUploadRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  identityButton: { minHeight: 44, borderRadius: 8, backgroundColor: palette.olive, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  identityButtonComplete: { backgroundColor: palette.sage },
  identityButtonLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  paymentCard: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  paymentCardSelected: { borderWidth: 1.5, borderColor: palette.sage, backgroundColor: '#F4FBF2' },
  paymentMark: {
    width: 42,
    height: 42,
    borderRadius: 9,
    backgroundColor: palette.sageSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  paymentMarkLabel: {
    color: palette.oliveDark,
    fontFamily: fontFamilies.body.bold,
    fontSize: 9,
    textAlign: 'center',
  },
  paymentCopy: { flex: 1, minWidth: 0 },
  paymentName: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14.5 },
  paymentDescription: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  tag: { borderRadius: 100, backgroundColor: palette.surfaceMuted, paddingHorizontal: 8, paddingVertical: 3 },
  tagSelected: { backgroundColor: 'rgba(200, 162, 82, 0.13)' },
  tagLabel: { color: palette.textMuted, fontFamily: fontFamilies.body.bold, fontSize: 10 },
  tagLabelSelected: { color: palette.gold },
  summaryWrapper: { marginTop: spacing.lg },
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  securityCopy: {
    flex: 1,
    color: palette.textMuted,
    fontFamily: fontFamilies.body.regular,
    fontSize: 11.5,
    lineHeight: 17,
  },
  developmentNote: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.medium,
    fontSize: 11,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  errorText: {
    color: palette.error,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.md,
  },
  footerSafeArea: { backgroundColor: palette.canvas },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
