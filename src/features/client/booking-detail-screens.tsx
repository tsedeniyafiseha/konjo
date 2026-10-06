import { Image } from 'expo-image';
import type { Href } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view';
import { useAuthSession } from '@/features/auth/session-context';
import { ClientBackHeader } from '@/features/client/client-screen-components';
import { type ClientBooking, useClientData } from '@/features/client/client-data-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import type { ClientCopyKey } from '@/localization/client-copy';
import { useClientCopy } from '@/localization/use-client-copy';
import { safetyService } from '@/features/safety/safety-service';
import { distanceMeters, estimateArrivalMinutes, formatDistance, isRecentPoint } from '@/features/location/geo';
import { BookingMap, type MapMarker } from '@/features/location/booking-map';
import { useBookingTracking } from '@/features/location/use-booking-tracking';
import { fontFamilies, layout, palette, radii, spacing } from '@/theme/tokens';

async function openCheckout(url: string): Promise<void> {
  const target = new URL(url);
  if (target.protocol !== 'https:' && !(__DEV__ && target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname))) {
    throw new Error('The checkout address is not secure.');
  }
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url);
  }
}

const stageOrder: readonly ClientBooking['status'][] = [
  'requested',
  'accepted',
  'on_the_way',
  'in_progress',
  'completed',
];

const paymentLabels: Record<ClientBooking['paymentMethod'], string> = {
  telebirr: 'Telebirr',
  cbe: 'CBE Birr',
  card: 'Visa / Mastercard',
  cash: 'Cash',
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function MissingDetail({ message }: { message: string }) {
  const { t } = useClientCopy();
  return (
    <View style={styles.missing}>
      <Text style={styles.missingTitle}>{t('bookingUnavailable')}</Text>
      <Text style={styles.missingCopy}>{message}</Text>
      <Pressable onPress={() => router.replace('/bookings' as Href)} style={styles.primaryButton}>
        <Text style={styles.primaryButtonLabel}>{t('viewBookings')}</Text>
      </Pressable>
    </View>
  );
}

export function BookingTrackingScreen() {
  const { getProfessional } = useDiscovery();
  const { t } = useClientCopy();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const bookingId = getParam(params.bookingId);
  const { bookings, cancelBooking, initiatePayment, updateBookingStatus, verifyPayment } = useClientData();
  const { session } = useAuthSession();
  const booking = bookings.find((item) => item.id === bookingId);
  const professional = getProfessional(booking?.professionalId) ?? (booking ? {
    id: booking.professionalId, name: t('specialist'), firstName: t('specialist'),
    initials: 'K', image: undefined, rating: null, category: '',
  } : undefined);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [clockNow, setClockNow] = useState<number | null>(() => Date.now());
  const [isPaying, setIsPaying] = useState(false);
  const [checkoutNotice, setCheckoutNotice] = useState(false);
  const tracking = useBookingTracking(booking);

  useEffect(() => {
    if (!__DEV__ || session?.source !== 'development' || !booking || booking.status !== 'requested') return;
    const accepted = setTimeout(() => updateBookingStatus(booking.id, 'accepted'), 2000);
    return () => clearTimeout(accepted);
  }, [booking, session?.source, updateBookingStatus]);

  useEffect(() => {
    if (!__DEV__ || session?.source !== 'development' || !booking) return;
    const nextStatus = booking.status === 'accepted' && booking.paymentIntentId
      ? 'on_the_way'
      : booking.status === 'on_the_way'
        ? 'in_progress'
        : booking.status === 'in_progress'
          ? 'completed'
          : null;
    if (!nextStatus) return;
    const delay = nextStatus === 'completed' ? 7000 : 3000;
    const timer = setTimeout(() => updateBookingStatus(booking.id, nextStatus), delay);
    return () => clearTimeout(timer);
  }, [booking, session?.source, updateBookingStatus]);

  useEffect(() => {
    if (booking?.status !== 'in_progress') return;
    const interval = setInterval(() => {
      setElapsedSeconds((value) => value + 1);
      setClockNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [booking?.status]);

  // While the professional is travelling, re-check point freshness periodically.
  useEffect(() => {
    if (booking?.status !== 'on_the_way') return;
    const interval = setInterval(() => setClockNow(Date.now()), 15_000);
    return () => clearInterval(interval);
  }, [booking?.status]);

  if (booking && professional && booking.status === 'cancelled' && booking.cancelledBy === 'professional') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>{t('declinedTitle')}</Text>
          <Text style={styles.missingCopy}>{t('declinedBody')}</Text>
          {booking.cancellationReason ? <Text style={styles.missingCopy}>{booking.cancellationReason}</Text> : null}
          <Pressable onPress={() => router.replace(`/browse?category=${encodeURIComponent(professional.category)}` as Href)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonLabel}>{t('bookAnotherProfessional')}</Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/bookings' as Href)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonLabel}>{t('viewBookings')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!booking || !professional || booking.status === 'cancelled') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <MissingDetail message={t('bookingCancelledOrRemoved')} />
      </SafeAreaView>
    );
  }

  const destination = typeof booking.latitude === 'number' && typeof booking.longitude === 'number'
    ? { latitude: booking.latitude, longitude: booking.longitude }
    : null;
  // Sharing runs only while the professional is travelling and has not tapped Arrived.
  const liveStage = booking.status === 'on_the_way' && !booking.arrivedAt;
  const trackingNow = clockNow ?? (tracking ? Date.parse(tracking.recordedAt) : 0);
  const livePoint = liveStage && tracking && isRecentPoint(tracking.recordedAt, trackingNow, 10 * 60_000) ? tracking : null;
  const markers: MapMarker[] = [
    ...(destination ? [{ id: 'destination', point: destination, kind: 'destination' as const, label: booking.address.split(/[·,]/)[0]?.trim() }] : []),
    ...(livePoint ? [{ id: 'professional', point: { latitude: livePoint.latitude, longitude: livePoint.longitude }, kind: 'professional' as const, label: professional.firstName }] : []),
  ];
  const approach = destination && livePoint ? distanceMeters(livePoint, destination) : null;
  const trackingLine = liveStage
    ? approach !== null
      ? t('professionalDistanceAway').replace('{name}', professional.firstName).replace('{distance}', formatDistance(approach)).replace('{minutes}', String(estimateArrivalMinutes(approach, livePoint?.speedMps)))
      : tracking && !livePoint
        ? t('locationStale').replace('{name}', professional.firstName)
        : t('waitingForLocation').replace('{name}', professional.firstName)
    : !destination && booking.status !== 'completed' ? t('noAddressPin') : null;
  // "Currently near Bole · Updated 4 s ago": the area comes from the professional's phone, throttled.
  const updatedSeconds = livePoint ? Math.max(0, Math.round((trackingNow - Date.parse(livePoint.recordedAt)) / 1000)) : null;
  const areaLine = livePoint && updatedSeconds !== null
    ? [
        livePoint.areaLabel ? t('currentlyNear').replace('{area}', livePoint.areaLabel) : null,
        updatedSeconds < 60 ? t('updatedSecondsAgo').replace('{seconds}', String(updatedSeconds)) : t('updatedMinutesAgo').replace('{minutes}', String(Math.round(updatedSeconds / 60))),
      ].filter(Boolean).join(' · ')
    : null;

  const stageIndex = stageOrder.indexOf(booking.status);
  const paymentSummary = booking.paymentSummary;
  const dueStage = paymentSummary?.dueStage ?? (booking.status === 'accepted' && !booking.paymentIntentId ? 'full' : null);
  const dueAmount = dueStage === 'deposit' ? paymentSummary?.depositAmount : paymentSummary?.outstandingAmount;
  const finalReceiptReady = booking.status === 'completed' && paymentSummary?.fullyPaid === true;
  const stageLabelKeys: readonly ClientCopyKey[] = ['requested', 'accepted', 'onTheWay', 'inProgress', 'completed'];
  const stageLabels = stageLabelKeys.map(t);
  const descriptions = [
    t('requestedDescription').replace('{name}', professional.firstName),
    t('acceptedDescription').replace('{name}', professional.firstName),
    t('onTheWayDescription').replace('{name}', professional.firstName),
    t('inProgressDescription').replace('{service}', booking.serviceName.toLowerCase()),
    t('completedDescription'),
  ];
  const startedAt = booking.startedAt ? Date.parse(booking.startedAt) : Number.NaN;
  const authoritativeElapsed = Number.isNaN(startedAt) || clockNow === null
    ? 0
    : Math.max(0, Math.floor((clockNow - startedAt) / 1000));
  const totalElapsed = Number.isNaN(startedAt) ? elapsedSeconds : authoritativeElapsed;
  const elapsed = `${String(Math.floor(totalElapsed / 60)).padStart(2, '0')}:${String(totalElapsed % 60).padStart(2, '0')}`;

  const confirmCancellation = () => {
    const depositPaid = booking.paymentSummary?.paidAmount ?? (
      booking.paymentSummary?.depositPaid ? (booking.paymentSummary.depositAmount || 0) : 0
    );
    const travelFee = booking.travelFee;
    const refundAmount = Math.max(0, depositPaid - travelFee);
    // Client can cancel for free at any time before travel starts (including after
    // acceptance if they disagree with the professional's travel fee).
    const alertMessage = booking.status === 'on_the_way'
      ? (depositPaid > 0
          ? t('travelFeeForfeitBreakdown')
              .replace('{travelFee}', travelFee.toLocaleString())
              .replace('{deposit}', depositPaid.toLocaleString())
              .replace('{refund}', refundAmount.toLocaleString())
          : t('travelFeeNonRefundable').replace('{fee}', travelFee.toLocaleString()))
      : booking.status === 'accepted' && travelFee > 0
        ? t('cancelFreeIfTravelFeeDisagreed').replace('{fee}', travelFee.toLocaleString())
        : t('freeCancellation');

    Alert.alert(
      t('cancelBookingTitle'),
      alertMessage,
      [
        { text: t('keepBooking'), style: 'cancel' },
        {
          text: t('cancelBooking'),
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelBooking(booking.id);
              router.replace('/bookings' as Href);
            } catch (error) {
              if (__DEV__) console.error('Unable to cancel booking.', error);
              Alert.alert(
                t('bookingNotCancelled'),
                error instanceof Error ? error.message : t('pleaseTryAgain'),
              );
            }
          },
        },
      ],
    );
  };

  const confirmSos = () => {
    Alert.alert(
      t('sendSosTitle'),
      t('sendSosBody'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('sendSos'),
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await safetyService.raiseAlert(booking.id, session?.accessToken);
              Alert.alert(
                t('sosSent'),
                result.locationShared
                  ? t('sosLocationSent')
                  : t('sosWithoutLocation'),
              );
            } catch (error) {
              Alert.alert(t('sosNotSent'), error instanceof Error ? error.message : t('emergencyFallback'));
            }
          },
        },
      ],
    );
  };

  // The hosted checkout has closed: ask the provider for the verdict rather than waiting for the webhook.
  const settleAfterCheckout = async () => {
    if (!booking) return;
    try {
      const status = await verifyPayment(booking.id);
      if (status === 'failed') Alert.alert(t('paymentNotStarted'), t('pleaseTryAgain'));
    } catch {
      // The next status poll will pick the payment up; nothing to alarm the client with.
    }
  };

  // The final payment is the remaining balance plus any extra services the
  // professional named at checkout; the amount due already includes them.
  const startPayment = () => { void payForAcceptedBooking(); };

  const payForAcceptedBooking = async () => {
    if (!booking || isPaying) return;
    setIsPaying(true);
    try {
      const intent = await initiatePayment(booking.id);
      if (intent.checkoutUrl) {
        setCheckoutNotice(true);
        await openCheckout(intent.checkoutUrl);
        await settleAfterCheckout();
      } else {
        Alert.alert(t('paymentStarted'), t('paymentStartedBody'));
      }
    } catch (error) {
      Alert.alert(t('paymentNotStarted'), error instanceof Error ? error.message : t('pleaseTryAgain'));
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.trackingHeader}>
              <Pressable accessibilityLabel={t('goBack')} accessibilityRole="button" onPress={() => router.replace('/bookings' as Href)} style={styles.backButton}>
                <KonjoIcon color={palette.text} name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={20} />
                <Text style={styles.backButtonLabel}>{t('back')}</Text>
              </Pressable>
              <Text accessibilityRole="header" style={styles.trackingTitle}>{t('yourBooking')}</Text>
              <Pressable accessibilityLabel={t('close')} accessibilityRole="button" onPress={() => router.replace('/bookings' as Href)} style={styles.closeButton}>
                <KonjoIcon color={palette.text} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} />
              </Pressable>
            </View>

            {markers.length ? (
              <BookingMap height={230} markers={markers} />
            ) : (
              <View style={styles.mapCard}>
                <View style={[styles.mapLine, styles.mapLineOne]} />
                <View style={[styles.mapLine, styles.mapLineTwo]} />
                <View style={[styles.mapLine, styles.mapLineThree]} />
                <View style={styles.mapPin}>
                  <KonjoIcon color={palette.white} name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }} size={22} />
                </View>
              </View>
            )}
            {areaLine ? <Text accessibilityLiveRegion="polite" style={styles.areaLine}>{areaLine}</Text> : null}
            {trackingLine ? <Text accessibilityLiveRegion="polite" style={styles.trackingLine}>{trackingLine}</Text> : null}

            <View style={styles.progressSection}>
              <View style={styles.stageLabels}>
                {stageLabels.map((label, index) => (
                  <Text key={label} style={[styles.stageLabel, index <= stageIndex && styles.stageLabelReached]}>{label}</Text>
                ))}
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round((stageIndex / 4) * 100)}%` }]} />
              </View>
            </View>

            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>{booking.status === 'on_the_way' && booking.arrivedAt ? t('arrived') : stageLabels[stageIndex]}</Text>
              <Text style={styles.statusDescription}>{booking.status === 'on_the_way' && booking.arrivedAt ? t('arrivedDescription') : booking.status === 'completed' && !finalReceiptReady ? t('finalPaymentRequired') : descriptions[stageIndex]}</Text>
              {booking.status === 'in_progress' ? (
                <View style={styles.timerRow}>
                  <Text style={styles.timerLabel}>{t('sessionTimer')}</Text>
                  <Text style={styles.timerValue}>{elapsed}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.professionalCard}>
              <View style={styles.professionalAvatar}>
                {professional.image ? <Image contentFit="cover" source={professional.image} style={StyleSheet.absoluteFill} /> : <Text style={styles.avatarInitials}>{professional.initials}</Text>}
              </View>
              <View style={styles.professionalCopy}>
                <Text style={styles.professionalName}>{professional.name}</Text>
                {professional.rating != null ? <Text style={styles.professionalRating}>★ {professional.rating}</Text> : null}
              </View>
              <View accessibilityState={{ disabled: true }} style={styles.contactButton}>
                <KonjoIcon color={palette.textMuted} name={{ ios: 'phone', android: 'call', web: 'call' }} size={17} />
              </View>
              <View accessibilityState={{ disabled: true }} style={styles.contactButton}>
                <KonjoIcon color={palette.textMuted} name={{ ios: 'message', android: 'chat_bubble_outline', web: 'chat_bubble_outline' }} size={17} />
              </View>
            </View>

            <View style={styles.appointmentCard}>
              <Text style={styles.appointmentAddress}>{booking.address}</Text>
              <Text style={styles.appointmentMeta}>{booking.time} · {booking.serviceName}</Text>
              {booking.proposedTime && booking.proposedDateIso ? (
                <Text style={styles.travelFeePending}>{t('rescheduleAwaiting').replace('{when}', `${booking.proposedDateIso} · ${booking.proposedTime}`)}</Text>
              ) : null}
              {booking.discountAmount ? (
                <Text style={styles.rewardLine}>{t('discountLine').replace('{amount}', booking.discountAmount.toLocaleString()).replace('{label}', t(booking.discountReason === 'loyalty' ? 'discountLoyaltyShort' : 'discountFirstBookingShort'))}</Text>
              ) : null}
              {booking.status === 'accepted' && booking.travelFee > 0 ? (
                <Text style={styles.travelFeeAccepted}>{t('travelFeeSetTo').replace('{fee}', booking.travelFee.toLocaleString())} · {t('cancelFreeLabel')}</Text>
              ) : booking.status === 'accepted' && booking.travelFee === 0 ? (
                <Text style={styles.travelFeePending}>{t('travelFeeSetByProfessional')}</Text>
              ) : null}
            </View>

            {paymentSummary ? <View style={styles.appointmentCard}>
              <Text style={styles.appointmentAddress}>{paymentSummary.fullyPaid ? t('paymentReceived') : t('splitPaymentExplanation')}</Text>
              <Text style={styles.appointmentMeta}>{t('totalPaid')}: ETB {paymentSummary.paidAmount.toLocaleString()} · {t('balanceDue')}: ETB {paymentSummary.outstandingAmount.toLocaleString()}</Text>
              {booking.extraAmount ? (
                <Text style={styles.appointmentMeta}>
                  {t('extrasLine').replace('{amount}', booking.extraAmount.toLocaleString()).replace('{fee}', (booking.extraFee ?? 0).toLocaleString())}
                  {booking.extraNote ? ` · ${t('extrasNoteLine').replace('{note}', booking.extraNote)}` : ''}
                </Text>
              ) : null}
            </View> : null}

            {dueStage && (!booking.paymentIntentId || booking.paymentStatus === 'failed') ? (
              <View style={styles.paymentActionCard}>
                <Text style={styles.paymentActionCopy}>{t('paymentAfterAcceptance')}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ busy: isPaying, disabled: isPaying }}
                  disabled={isPaying}
                  onPress={startPayment}
                  style={[styles.darkButton, isPaying && styles.buttonDisabled]}>
                  <Text style={styles.darkButtonLabel}>{isPaying ? t('startingPayment') : `${t(dueStage === 'deposit' ? 'payDeposit' : dueStage === 'balance' ? 'payBalance' : 'payNow')}${dueAmount !== undefined ? ` · ETB ${dueAmount.toLocaleString()}` : ''}`}</Text>
                </Pressable>
              </View>
            ) : null}

            {booking.paymentIntentId && booking.paymentStatus !== 'captured' ? (
              <Text style={styles.paymentStateText}>
                {booking.paymentStatus === 'cash_due' ? t('cashDueNotice') : booking.paymentStatus === 'pending' ? t('securePaymentPending') : t('paymentStarted')}
              </Text>
            ) : null}
            {booking.paymentIntentId && booking.paymentStatus === 'pending' && booking.checkoutUrl ? (
              <View style={styles.paymentActionCard}>
                {checkoutNotice ? <Text style={styles.paymentActionCopy}>{t('checkoutOpened')}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => { setCheckoutNotice(true); void openCheckout(booking.checkoutUrl!).then(settleAfterCheckout); }}
                  style={styles.darkButton}>
                  <Text style={styles.darkButtonLabel}>{t('openCheckout')}</Text>
                </Pressable>
              </View>
            ) : null}

            {booking.status === 'requested' || booking.status === 'accepted' || booking.status === 'on_the_way' ? (
              <View style={styles.actionRow}>
                {booking.status !== 'on_the_way' ? <Pressable
                  onPress={() => router.push(`/booking/${encodeURIComponent(booking.id)}/reschedule` as Href)}
                  style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonLabel}>{t('reschedule')}</Text>
                </Pressable> : null}
                <Pressable onPress={confirmCancellation} style={styles.cancelButton}>
                  <Text style={styles.cancelButtonLabel}>{t('cancelBooking')}</Text>
                </Pressable>
              </View>
            ) : booking.status !== 'completed' ? (
              <Text style={styles.cancellationNote}>{t('cancellationWindowPassed')}</Text>
            ) : null}

            {booking.status === 'accepted' || booking.status === 'on_the_way' || booking.status === 'in_progress' ? (
              <Pressable accessibilityRole="button" onPress={confirmSos} style={styles.sosButton}>
                <KonjoIcon color={palette.error} name={{ ios: 'exclamationmark.triangle', android: 'warning_amber', web: 'warning_amber' }} size={17} />
                <Text style={styles.sosLabel}>{t('sosSupport')}</Text>
              </Pressable>
            ) : null}

            {booking.status === 'completed' && !booking.rated ? (
              <Pressable onPress={() => router.push(`/booking/${booking.id}/rate` as Href)} style={styles.darkButton}>
                <Text style={styles.darkButtonLabel}>{t('rateExperience')}</Text>
              </Pressable>
            ) : null}
            {finalReceiptReady ? <Pressable onPress={() => router.push(`/receipt/${encodeURIComponent(booking.id)}` as Href)} style={styles.darkButton}>
              <Text style={styles.darkButtonLabel}>{t('receipt')}</Text>
            </Pressable> : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StarRating({ label, value, onChange }: { label: string; value: number; onChange: (rating: number) => void }) {
  const { t } = useClientCopy();
  return (
    <View style={styles.ratingSection}>
      <Text style={styles.ratingLabel}>{label}</Text>
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable
            accessibilityLabel={t('starsFor').replace('{stars}', String(star)).replace('{label}', label)}
            accessibilityRole="button"
            accessibilityState={{ selected: star <= value }}
            hitSlop={4}
            key={star}
            onPress={() => onChange(star)}>
            <Text style={[styles.ratingStar, star <= value && styles.ratingStarFilled]}>★</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export function BookingRatingScreen() {
  const { getProfessional } = useDiscovery();
  const { t } = useClientCopy();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const bookingId = getParam(params.bookingId);
  const { bookings, rateBooking } = useClientData();
  const { refresh: refreshDiscovery } = useDiscovery();
  const booking = bookings.find((item) => item.id === bookingId);
  const professional = getProfessional(booking?.professionalId);
  const [technique, setTechnique] = useState(0);
  const [professionalism, setProfessionalism] = useState(0);
  const [tags, setTags] = useState<ReadonlySet<string>>(new Set());
  const [review, setReview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const feedbackTags: readonly { id: string; label: string }[] = [
    { id: 'on-time', label: t('feedbackOnTime') },
    { id: 'gentle', label: t('feedbackGentle') },
    { id: 'value', label: t('feedbackValue') },
    { id: 'rebook', label: t('feedbackRebook') },
    { id: 'clean', label: t('feedbackClean') },
  ];

  if (!booking || !professional || booking.status !== 'completed' || booking.rated) {
    return <SafeAreaView edges={['top', 'bottom']} style={styles.screen}><MissingDetail message={t('reviewUnavailable')} /></SafeAreaView>;
  }

  const submit = async () => {
    if (!technique || !professionalism || submitting) return;
    setSubmitting(true);
    try {
      await rateBooking(booking.id, {
        techniqueRating: technique,
        professionalismRating: professionalism,
        tags: [...tags].map((tagId) => feedbackTags.find((tag) => tag.id === tagId)?.label ?? tagId),
        reviewText: review.trim(),
      });
      // The professional's public rating changed; make sure Browse and the profile show it.
      void refreshDiscovery();
      router.replace('/bookings' as Href);
    } catch (error) {
      if (__DEV__) console.error('Unable to submit booking review.', error);
      Alert.alert(t('reviewNotSubmitted'), error instanceof Error ? error.message : t('pleaseTryAgain'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.trackingHeader}>
              <Pressable accessibilityLabel={t('goBack')} accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/bookings' as Href))} style={styles.backButton}>
                <KonjoIcon color={palette.text} name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={20} />
                <Text style={styles.backButtonLabel}>{t('back')}</Text>
              </Pressable>
              <Text accessibilityRole="header" style={styles.trackingTitle}>{t('rateVisit')}</Text>
              <Pressable accessibilityLabel={t('close')} onPress={() => router.replace('/bookings' as Href)} style={styles.closeButton}>
                <KonjoIcon color={palette.text} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={18} />
              </Pressable>
            </View>
            <View style={styles.ratingIdentity}>
              <View style={styles.ratingAvatar}>{professional.image ? <Image contentFit="cover" source={professional.image} style={StyleSheet.absoluteFill} /> : <Text style={styles.avatarInitials}>{professional.initials}</Text>}</View>
              <View><Text style={styles.ratingName}>{professional.name}</Text><Text style={styles.ratingService}>{booking.serviceName} · {booking.dateLabel}</Text></View>
            </View>
            <StarRating label={t('technique')} onChange={setTechnique} value={technique} />
            <StarRating label={t('professionalism')} onChange={setProfessionalism} value={professionalism} />
            <View style={styles.feedbackSection}>
              <Text style={styles.ratingLabel}>{t('quickFeedback')}</Text>
              <View style={styles.feedbackTags}>
                {feedbackTags.map((tag) => {
                  const selected = tags.has(tag.id);
                  return (
                    <Pressable
                      key={tag.id}
                      onPress={() => setTags((current) => {
                        const next = new Set(current);
                        if (next.has(tag.id)) next.delete(tag.id); else next.add(tag.id);
                        return next;
                      })}
                      style={[styles.feedbackTag, selected && styles.feedbackTagSelected]}>
                      <Text style={[styles.feedbackTagLabel, selected && styles.feedbackTagLabelSelected]}>{tag.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <TextInput
              accessibilityLabel={t('optionalReview')}
              maxLength={600}
              multiline
              onChangeText={setReview}
              placeholder={t('reviewPlaceholder')}
              placeholderTextColor={palette.textMuted}
              style={styles.reviewInput}
              textAlignVertical="top"
              value={review}
            />
            <Pressable
              accessibilityState={{ disabled: !technique || !professionalism || submitting, busy: submitting }}
              disabled={!technique || !professionalism || submitting}
              onPress={submit}
              style={[styles.primaryButton, (!technique || !professionalism) && styles.buttonDisabled]}>
              <Text style={[styles.primaryButtonLabel, (!technique || !professionalism) && styles.buttonDisabledLabel]}>{submitting ? t('submitting') : t('submitReview')}</Text>
            </Pressable>
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </View>
  );
}

export function ReceiptScreen() {
  const { getProfessional } = useDiscovery();
  const { t } = useClientCopy();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const bookingId = getParam(params.bookingId);
  const { bookings } = useClientData();
  const booking = bookings.find((item) => item.id === bookingId);
  const professional = getProfessional(booking?.professionalId);

  if (!booking) {
    return <SafeAreaView edges={['top', 'bottom']} style={styles.screen}><MissingDetail message={t('receiptNotFound')} /></SafeAreaView>;
  }
  if (booking.status !== 'completed' || booking.paymentSummary?.fullyPaid !== true) {
    return <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <MissingDetail message={t('receiptNotPaid')} />
      <Pressable onPress={() => router.replace(`/booking/${encodeURIComponent(booking.id)}` as Href)} style={styles.darkButton}>
        <Text style={styles.darkButtonLabel}>{t('yourBooking')}</Text>
      </Pressable>
    </SafeAreaView>;
  }

  const shareReceipt = async () => {
    try {
      await Share.share({
        title: `Konjo ${t('receipt').toLowerCase()} ${booking.id}`,
        message: [
          `Konjo ${t('bookingReceipt')}`,
          `${professional?.name ?? t('specialist')} · ${booking.serviceName}`,
          `${booking.dateLabel} · ${booking.time}`,
          `ETB ${booking.total.toLocaleString()}`,
          `${t('reference')}: ${booking.id}`,
        ].join('\n'),
      });
    } catch (error) {
      if (__DEV__) console.error('Unable to share booking receipt.', error);
      Alert.alert(t('receiptNotShared'), t('receiptShareError'));
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.contentFrame}>
          <ClientBackHeader title={t('receipt')} onBack={() => router.back()} />
          <ScrollView contentContainerStyle={styles.receiptScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.receiptCard}>
              <Text style={styles.receiptWordmark}>Konjo<Text style={styles.receiptDot}>.</Text></Text>
              <Text style={styles.receiptSubtitle}>{t('bookingReceipt')}</Text>
              <View style={styles.dashedDivider} />
              <ReceiptRow label={t('specialist')} value={professional?.name ?? t('specialist')} />
              <ReceiptRow label={t('service')} value={booking.serviceName} />
              <ReceiptRow label={t('dateTime')} value={`${booking.dateLabel} · ${booking.time}`} />
              <ReceiptRow label={t('address')} value={booking.address} />
              <View style={styles.solidDivider} />
              <ReceiptRow emphasized label={t('totalPaid')} value={`ETB ${booking.total.toLocaleString()}`} />
              {booking.payments?.filter((payment) => payment.status === 'captured' || payment.status === 'cash_collected').map((payment) => (
                <ReceiptRow key={payment.id} label={`${payment.stage === 'deposit' ? t('depositPaid') : t('paymentReceived')} · ${payment.providerReference}`} value={`ETB ${payment.amount.toLocaleString()}`} />
              ))}
              <Text style={styles.paidVia}>{t('paymentMethodLabel')} · {paymentLabels[booking.paymentMethod]}</Text>
            </View>
            <View style={styles.receiptActions}>
              <Pressable accessibilityRole="button" onPress={shareReceipt} style={styles.shareReceiptButton}>
                <Text style={styles.shareReceiptLabel}>{t('shareReceipt')}</Text>
              </Pressable>
              {professional ? <Pressable
                onPress={() => router.push(`/booking/when?professionalId=${professional.id}&serviceIndex=0` as Href)}
                style={styles.rebookReceiptButton}>
                <Text style={styles.rebookReceiptLabel}>{t('bookAgain')}</Text>
              </Pressable> : null}
            </View>
            <Text style={styles.receiptNote}>{t('reference')}: {booking.id}</Text>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

function ReceiptRow({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={[styles.receiptRowLabel, emphasized && styles.receiptRowEmphasis]}>{label}</Text>
      <Text style={[styles.receiptRowValue, emphasized && styles.receiptRowEmphasis]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rewardLine: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 12.5, marginTop: 4 },
  screen: { flex: 1, backgroundColor: palette.canvas },
  safeArea: { flex: 1 },
  content: { width: '100%', maxWidth: layout.contentMaxWidth, paddingBottom: spacing.xl },
  contentFrame: { flex: 1, width: '100%', maxWidth: layout.contentMaxWidth },
  scrollContent: { alignItems: 'center' },
  trackingHeader: { minHeight: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  trackingTitle: { flex: 1, color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 17, marginHorizontal: spacing.sm, textAlign: 'center' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 60 },
  backButtonLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  closeButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  areaLine: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14, lineHeight: 20, marginTop: 10 },
  trackingLine: { color: palette.textSecondary, fontFamily: fontFamilies.body.medium, fontSize: 13, lineHeight: 19, marginTop: 10 },
  mapCard: { height: 140, overflow: 'hidden', borderRadius: radii.md, backgroundColor: palette.sageSoft, marginHorizontal: spacing.lg, marginTop: spacing.sm },
  mapLine: { position: 'absolute', height: 2, backgroundColor: '#C5C8BC' },
  mapLineOne: { width: '120%', top: 44, left: -20, transform: [{ rotate: '4deg' }] },
  mapLineTwo: { width: '115%', top: 93, left: -10, transform: [{ rotate: '-5deg' }] },
  mapLineThree: { width: 180, top: 65, left: 110, transform: [{ rotate: '72deg' }] },
  mapPin: { position: 'absolute', left: '44%', top: 48, width: 44, height: 44, borderRadius: 22, backgroundColor: palette.olive, alignItems: 'center', justifyContent: 'center' },
  progressSection: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  stageLabels: { flexDirection: 'row' },
  stageLabel: { flex: 1, color: palette.textMuted, fontFamily: fontFamilies.body.semibold, fontSize: 9.5, textAlign: 'center' },
  stageLabelReached: { color: palette.olive },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: palette.border, marginTop: 10 },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: palette.sage },
  statusCard: { borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, marginHorizontal: spacing.lg, marginTop: spacing.lg, padding: spacing.md },
  statusTitle: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 19 },
  statusDescription: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13, lineHeight: 20, marginTop: 4 },
  timerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: radii.sm, backgroundColor: palette.surfaceMuted, marginTop: spacing.sm, paddingHorizontal: 14, paddingVertical: 12 },
  timerLabel: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12 },
  timerValue: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 20 },
  professionalCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, marginHorizontal: spacing.lg, marginTop: 14, paddingHorizontal: spacing.md, paddingVertical: 14 },
  professionalAvatar: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', backgroundColor: palette.sageSoft, alignItems: 'center', justifyContent: 'center' },
  avatarInitials: { color: palette.olive, fontFamily: fontFamilies.display.regular, fontSize: 15 },
  professionalCopy: { flex: 1 },
  professionalName: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  professionalRating: { color: palette.gold, fontFamily: fontFamilies.body.semibold, fontSize: 12, marginTop: 2 },
  contactButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  appointmentCard: { borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, marginHorizontal: spacing.lg, marginTop: 14, paddingHorizontal: spacing.md, paddingVertical: 14 },
  appointmentAddress: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  appointmentMeta: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, marginTop: 4 },
  travelFeeAccepted: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 11.5, marginTop: 6 },
  travelFeePending: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11.5, marginTop: 6, fontStyle: 'italic' },
  actionRow: { flexDirection: 'row', gap: 10, marginHorizontal: spacing.lg, marginTop: 14 },
  paymentActionCard: { marginTop: 14 },
  paymentActionCopy: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18, marginHorizontal: spacing.lg },
  paymentStateText: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18, marginHorizontal: spacing.lg, marginTop: 14 },
  secondaryButton: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: palette.border, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  cancelButton: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: palette.border, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  cancelButtonLabel: { color: palette.error, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  cancellationNote: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 17, marginHorizontal: spacing.xl, marginTop: 14, textAlign: 'center' },
  sosButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1.5, borderColor: palette.error, borderRadius: radii.sm, marginHorizontal: spacing.lg, marginTop: spacing.sm },
  sosLabel: { color: palette.error, fontFamily: fontFamilies.body.bold, fontSize: 13.5 },
  darkButton: { minHeight: 50, borderRadius: radii.sm, backgroundColor: palette.oliveDark, alignItems: 'center', justifyContent: 'center', marginHorizontal: spacing.lg, marginTop: 14 },
  darkButtonLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 14.5 },
  ratingIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  ratingAvatar: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: palette.sageSoft, alignItems: 'center', justifyContent: 'center' },
  ratingName: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 15 },
  ratingService: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, marginTop: 2 },
  ratingSection: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  ratingLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13, marginBottom: 10 },
  starRow: { flexDirection: 'row', gap: spacing.xs },
  ratingStar: { color: palette.border, fontSize: 38, lineHeight: 42 },
  ratingStarFilled: { color: palette.gold },
  feedbackSection: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  feedbackTags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  feedbackTag: { minHeight: 38, borderWidth: 1, borderColor: palette.border, borderRadius: radii.pill, backgroundColor: palette.surface, justifyContent: 'center', paddingHorizontal: 14 },
  feedbackTagSelected: { borderColor: palette.olive, backgroundColor: palette.olive },
  feedbackTagLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 12.5 },
  feedbackTagLabelSelected: { color: palette.white },
  reviewInput: { minHeight: 96, borderWidth: 1, borderColor: palette.border, borderRadius: radii.sm, backgroundColor: palette.surface, color: palette.text, fontFamily: fontFamilies.body.regular, fontSize: 13.5, lineHeight: 20, marginHorizontal: spacing.lg, marginTop: spacing.lg, paddingHorizontal: 14, paddingVertical: 12 },
  primaryButton: { minHeight: 52, borderRadius: 6, backgroundColor: palette.sage, alignItems: 'center', justifyContent: 'center', marginHorizontal: spacing.lg, marginTop: spacing.lg, paddingHorizontal: spacing.md },
  primaryButtonLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 15 },
  buttonDisabled: { backgroundColor: palette.surfaceMuted },
  buttonDisabledLabel: { color: palette.textMuted },
  missing: { flex: 1, justifyContent: 'center', paddingHorizontal: layout.horizontalPadding },
  missingTitle: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 27, textAlign: 'center' },
  missingCopy: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 14, lineHeight: 21, marginTop: spacing.xs, textAlign: 'center' },
  receiptScroll: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  receiptCard: { borderWidth: 1, borderColor: palette.border, borderRadius: 14, backgroundColor: palette.surface, padding: 24 },
  receiptWordmark: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 22, textAlign: 'center' },
  receiptDot: { color: palette.gold },
  receiptSubtitle: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11, marginTop: 4, textAlign: 'center' },
  dashedDivider: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: palette.border, marginVertical: spacing.lg },
  solidDivider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border, marginVertical: 14 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.xs },
  receiptRowLabel: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13 },
  receiptRowValue: { flex: 1, color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13, lineHeight: 19, textAlign: 'right' },
  receiptRowEmphasis: { color: palette.text, fontFamily: fontFamilies.body.bold, fontSize: 16 },
  paidVia: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11.5, marginTop: 4 },
  receiptActions: { flexDirection: 'row', gap: 10, marginTop: spacing.lg },
  shareReceiptButton: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: palette.border, borderRadius: radii.sm, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  shareReceiptLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  rebookReceiptButton: { flex: 1, minHeight: 48, borderRadius: radii.sm, backgroundColor: palette.olive, alignItems: 'center', justifyContent: 'center' },
  rebookReceiptLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  receiptNote: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 10.5, lineHeight: 16, marginTop: spacing.sm, textAlign: 'center' },
});
