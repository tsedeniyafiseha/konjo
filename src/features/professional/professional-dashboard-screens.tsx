import type { Href } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { HorizontalScrollView } from '@/components/ui/horizontal-scroll-view';
import { useAuthSession } from '@/features/auth/session-context';
import {
  proSharedStyles,
  ProfessionalBackHeader,
  ProfessionalDetailScreen,
  ProfessionalSwitch,
  ProfessionalTabScreen,
} from '@/features/professional/professional-components';
import { type ProfessionalJob, useProfessionalData } from '@/features/professional/professional-data-context';
import type { ProfessionalCheckoutExtras } from '@/application/professional-data/professional-data-controller';
import { useProfessionalRegistration } from '@/features/professional/registration/professional-registration-context';
import { safetyService } from '@/features/safety/safety-service';
import { distanceMeters, formatDistance, isRecentPoint } from '@/features/location/geo';
import { openExternalNavigation } from '@/features/location/external-navigation';
import { liveLocationReporter } from '@/features/location/live-location-reporter';
import { BookingMap, type MapMarker } from '@/features/location/booking-map';
import { useOptionalNotifications } from '@/features/notifications/notification-context';
import { fontFamilies, professionalPalette, radii, spacing } from '@/theme/tokens';
import { useProfessionalPayouts } from '@/features/professional/use-professional-payouts';
import { useProfessionalCopy } from '@/localization/use-professional-copy';
import type { ProfessionalCopyKey } from '@/localization/professional-copy';
import { normalizePayoutMethod } from '../../../shared/payout-method';

/** Another of this professional's jobs that is already on the way or on site; a second journey cannot start until it ends. */
function useOtherJourney(jobId: string | undefined): ProfessionalJob | null {
  const { activeJob, upcomingJobs } = useProfessionalData();
  const jobs = activeJob ? [activeJob, ...upcomingJobs] : upcomingJobs;
  return jobs.find((job) => job.id !== jobId && (job.status === 'traveling' || job.status === 'onsite')) ?? null;
}




function IconText({ icon, children }: { icon: 'time' | 'location' | 'payment'; children: React.ReactNode }) {
  const names = {
    time: { ios: 'clock', android: 'schedule', web: 'schedule' },
    location: { ios: 'mappin', android: 'location_on', web: 'location_on' },
    payment: { ios: 'creditcard', android: 'credit_card', web: 'credit_card' },
  } as const;
  return (
    <View style={styles.iconTextRow}>
      <KonjoIcon color={professionalPalette.olive} name={names[icon]} size={16} />
      <Text style={styles.iconText}>{children}</Text>
    </View>
  );
}

function JobActionButton({ label, onPress, primary = false, disabled = false }: { label: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.jobAction, primary && styles.jobActionPrimary, (pressed || disabled) && styles.pressed]}>
      <Text style={[styles.jobActionLabel, primary && styles.jobActionPrimaryLabel]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The professional names the travel fee for this trip while accepting. The
 * allowed range comes from the administrator-managed platform cap, and the
 * server rejects anything outside it, so the form only lets valid fees through.
 */
type Translate = (key: ProfessionalCopyKey, params?: Record<string, string | number>) => string;

function TravelFeeAcceptForm({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (travelFee: number) => void }) {
  const { travelFeeCap } = useProfessionalData();
  const { t } = useProfessionalCopy();
  const [input, setInput] = useState('0');
  const trimmed = input.trim();
  const parsed = /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= travelFeeCap;
  return (
    <>
      <View style={styles.travelFeeRow}>
        <Text style={styles.travelFeeLabel}>{t('travelFeeLabel', { cap: travelFeeCap })}</Text>
        <TextInput
          accessibilityLabel={t('travelFeeAccessibility')}
          keyboardType="number-pad"
          maxLength={Math.max(1, String(travelFeeCap).length)}
          onChangeText={setInput}
          placeholder="0"
          style={[styles.travelFeeField, !valid && styles.travelFeeFieldInvalid]}
          value={input}
        />
        <Text style={styles.travelFeeCurrency}>ETB</Text>
      </View>
      <Text style={[styles.travelFeeHint, !valid && styles.travelFeeHintInvalid]}>
        {valid
          ? parsed === 0
            ? t('travelFeeNone')
            : t('travelFeeAdded', { fee: parsed })
          : t('travelFeeInvalid', { cap: travelFeeCap })}
      </Text>
      <View style={styles.jobActions}>
        <JobActionButton label={t('back')} onPress={onCancel} />
        <JobActionButton disabled={!valid} label={t('confirmAccept')} onPress={() => { if (valid) onConfirm(parsed); }} primary />
      </View>
    </>
  );
}

/**
 * Checkout: the professional names what the client owes for services beyond
 * the booking. The extra, plus Konjo's service fee on it, is added to the
 * client's final payment so the client settles everything in one go. Prices
 * for the booked service itself are only changed on the profile.
 */
function CheckoutExtrasForm({ job, onCancel, onConfirm }: { job: ProfessionalJob; onCancel: () => void; onConfirm: (extras: ProfessionalCheckoutExtras | undefined) => void }) {
  const { t } = useProfessionalCopy();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const trimmed = amount.trim();
  const parsed = trimmed === '' ? 0 : /^\d{1,6}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 100_000;
  const fee = valid ? Math.round(parsed * (job.commissionRateBps ?? 1800) / 10_000) : 0;
  const outstanding = job.paymentSummary?.outstandingAmount ?? 0;
  const confirm = () => {
    if (!valid) return;
    onConfirm(parsed > 0 ? { amount: parsed, ...(note.trim() ? { note: note.trim() } : {}) } : undefined);
  };
  return (
    <>
      <Text style={styles.checkoutTitle}>{t('checkoutQuestion', { name: job.name.split(' ')[0] })}</Text>
      <View style={styles.travelFeeRow}>
        <Text style={styles.travelFeeLabel}>{t('extrasLabel')}</Text>
        <TextInput
          accessibilityLabel={t('extrasAccessibility')}
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={setAmount}
          placeholder="0"
          style={[styles.travelFeeField, !valid && styles.travelFeeFieldInvalid]}
          value={amount}
        />
        <Text style={styles.travelFeeCurrency}>ETB</Text>
      </View>
      {valid && parsed > 0 ? (
        <TextInput
          accessibilityLabel={t('extrasNoteAccessibility')}
          maxLength={200}
          onChangeText={setNote}
          placeholder={t('extrasNotePlaceholder')}
          placeholderTextColor={professionalPalette.textMuted}
          style={styles.checkoutNoteField}
          value={note}
        />
      ) : null}
      <Text style={[styles.travelFeeHint, !valid && styles.travelFeeHintInvalid]}>
        {!valid
          ? t('extrasInvalid')
          : parsed === 0
            ? t('extrasNone', { amount: outstanding.toLocaleString() })
            : t('extrasAdded', { amount: parsed.toLocaleString(), fee: fee.toLocaleString(), total: (outstanding + parsed + fee).toLocaleString() })}
      </Text>
      <View style={styles.jobActions}>
        <JobActionButton label={t('back')} onPress={onCancel} />
        <JobActionButton disabled={!valid} label={t('checkOut')} onPress={confirm} primary />
      </View>
    </>
  );
}

/** The client asked for a new time on an accepted booking: the professional accepts or keeps the current time. */
function RescheduleRequest({ job }: { job: ProfessionalJob }) {
  const { approveReschedule, declineReschedule } = useProfessionalData();
  const { t } = useProfessionalCopy();
  if (!job.proposedDateIso || !job.proposedTime) return null;
  return (
    <View style={styles.rescheduleCard}>
      <Text style={styles.rescheduleTitle}>{t('rescheduleTitle')}</Text>
      <Text style={styles.rescheduleBody}>{t('rescheduleBody', { name: job.name, when: `${job.proposedDateIso} · ${job.proposedTime}` })}</Text>
      <View style={styles.jobActions}>
        <JobActionButton label={t('declineReschedule')} onPress={() => declineReschedule(job.id)} />
        <JobActionButton label={t('approveReschedule')} onPress={() => approveReschedule(job.id)} primary />
      </View>
    </View>
  );
}

function ActiveJobCard({ job }: { job: ProfessionalJob }) {
  const { acceptJob, declineJob, startTravel, arrive, checkIn, completeJob } = useProfessionalData();
  const { t } = useProfessionalCopy();
  const sessionStartedAt = job.startedAt ? Date.parse(job.startedAt) : null;
  const [elapsed, setElapsed] = useState(0);
  const [showTravelFeeInput, setShowTravelFeeInput] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);


  useEffect(() => {
    if (job.status !== 'onsite' || !sessionStartedAt) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [job.status, sessionStartedAt]);

  const timer = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const isOffer = job.status === 'offer';
  const isOnsite = job.status === 'onsite';
  const statusLabel = { offer: t('statusNewRequest'), accepted: t('statusConfirmed'), traveling: t('statusOnTheWay'), onsite: t('statusInProgress') }[job.status];

  const confirmAccept = (travelFee: number) => {
    acceptJob(job.id, travelFee);
    setShowTravelFeeInput(false);
  };

  const progressAction = () => {
    if (job.status === 'accepted') startTravel(job.id);
    else if (job.status === 'traveling') { if (job.arrivedAt) checkIn(job.id); else arrive(job.id); }
    else setShowCheckout(true);
  };
  const waitingForDeposit = job.status === 'accepted' && job.paymentSummary?.depositPaid === false;
  // Accepted bookings can set off at any time: nothing waits for the appointment hour.
  const waitingForStart = false;
  const otherJourney = useOtherJourney(job.id);
  const blockedByJourney = job.status === 'accepted' && Boolean(otherJourney);
  const progressLabel = waitingForStart ? t('onMyWayUnlocks', { time: job.time }) : waitingForDeposit ? t('awaitingDeposit') : blockedByJourney ? t('finishOtherVisit', { name: otherJourney?.name ?? '' }) : job.status === 'accepted' ? t('onMyWay') : job.status === 'traveling' ? job.arrivedAt ? t('startWork') : t('arrived') : t('checkOut');
  const openJob = () => router.push(`/pro/job?bookingId=${encodeURIComponent(job.id)}` as Href);

  return (
    <View style={[styles.jobCard, isOffer && styles.jobCardOffer, isOnsite && styles.jobCardDark]}>
      <View style={styles.jobStatusRow}>
        <View style={styles.jobStatusGroup}><View style={[styles.statusDot, !isOffer && styles.statusDotGreen]} /><Text style={[styles.statusLabel, isOnsite && styles.onDarkMuted]}>{statusLabel}</Text></View>
        {isOnsite ? <Text style={styles.cardTimer}>{timer}</Text> : null}
      </View>
      <View style={styles.jobTitleRow}>
        <View style={styles.jobTitleCopy}><Text style={[styles.jobName, isOnsite && styles.onDark]}>{job.name}</Text><Text style={[styles.jobService, isOnsite && styles.onDarkMuted]}>{job.service} · {job.description}</Text></View>
        <Text style={[styles.jobPrice, isOnsite && styles.onDark]}>ETB {job.price}</Text>
      </View>
      {isOffer ? (
        <View style={styles.jobDetails}><IconText icon="time">{job.time}</IconText><IconText icon="location">{job.address} · {job.addressDetail}</IconText></View>
      ) : null}
      <RescheduleRequest job={job} />
      {isOffer && showTravelFeeInput ? (
        <TravelFeeAcceptForm onCancel={() => setShowTravelFeeInput(false)} onConfirm={confirmAccept} />
      ) : isOnsite && showCheckout ? (
        <CheckoutExtrasForm job={job} onCancel={() => setShowCheckout(false)} onConfirm={(extras) => { completeJob(job.id, extras); setShowCheckout(false); }} />
      ) : (
        <View style={styles.jobActions}>
          {isOffer ? (
            <><JobActionButton label={t('decline')} onPress={() => declineJob(job.id)} /><JobActionButton label={t('accept')} onPress={() => setShowTravelFeeInput(true)} primary /></>
          ) : (
            <><JobActionButton disabled={waitingForStart || waitingForDeposit || blockedByJourney} label={progressLabel} onPress={progressAction} primary /><JobActionButton label={t('view')} onPress={openJob} /></>
          )}
        </View>
      )}
    </View>
  );
}

function Metric({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
  const content = <><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></>;
  if (!onPress) return <View style={styles.metric}>{content}</View>;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.metric, pressed && styles.pressed]}>{content}</Pressable>;
}

/** What the professional needs to know about the money on a finished visit. */
export function jobPaymentStatus(job: ProfessionalJob, t: Translate): { label: string; settled: boolean } {
  if (job.outcome === 'cancelled') return { label: t('cancelled'), settled: true };
  const summary = job.paymentSummary;
  const cash = job.payment === 'Cash' || job.payment === 'ጥሬ ገንዘብ' || job.payment === 'Maallaqa harkaa';
  if (!summary) return { label: cash ? t('paidInCash') : t('paymentPending'), settled: cash };
  if (summary.fullyPaid) return { label: t('paidInFull', { amount: summary.paidAmount.toLocaleString() }), settled: true };
  return { label: t('awaitingFinalPayment', { amount: summary.outstandingAmount.toLocaleString() }), settled: false };
}

function RecentJob({ job }: { job: ProfessionalJob }) {
  const { t } = useProfessionalCopy();
  const payment = jobPaymentStatus(job, t);
  const when = job.completedAt ? new Date(job.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : job.time.split(' at ')[0];
  return (
    <Pressable onPress={() => router.push(`/pro/job?bookingId=${encodeURIComponent(job.id)}` as Href)} style={({ pressed }) => [styles.upcomingCard, job.outcome === 'cancelled' && styles.upcomingMuted, pressed && styles.pressed]}>
      <View style={styles.timeBlock}><Text style={styles.timeEyebrow}>{job.outcome === 'cancelled' ? t('eyebrowCancelled') : t('eyebrowDone')}</Text><Text style={styles.timeValue}>{when}</Text></View>
      <View style={styles.upcomingCopy}><Text style={styles.upcomingName}>{job.name}</Text><Text style={styles.upcomingService}>{job.service} · ETB {job.price.toLocaleString()}</Text></View>
      <Text style={[styles.confirmedBadge, !payment.settled && styles.offerBadge]}>{payment.settled ? (job.outcome === 'cancelled' ? t('cancelled') : t('paid')) : t('awaitingPayment')}</Text>
    </Pressable>
  );
}

function UpcomingJob({ job, muted = false }: { job: ProfessionalJob; muted?: boolean }) {
  const { t } = useProfessionalCopy();
  const badge = muted ? null : job.status === 'offer' ? t('badgeAwaitingReply') : job.status === 'traveling' ? t('badgeOnTheWay') : job.status === 'onsite' ? t('badgeInProgress') : t('badgeConfirmed');
  return (
    <Pressable disabled={muted} onPress={() => router.push(`/pro/job?bookingId=${encodeURIComponent(job.id)}` as Href)} style={({ pressed }) => [styles.upcomingCard, muted && styles.upcomingMuted, pressed && !muted && styles.pressed]}>
      <View style={styles.timeBlock}><Text style={styles.timeEyebrow}>{muted ? t('eyebrowDone') : t('eyebrowStarts')}</Text><Text style={styles.timeValue}>{muted ? '9:00' : job.time.replace('Today at ', '')}</Text></View>
      <View style={styles.upcomingCopy}><Text style={styles.upcomingName}>{job.name}</Text><Text style={styles.upcomingService}>{job.service} · {muted ? t('completed') : job.description}</Text></View>
      {badge ? <Text style={[styles.confirmedBadge, job.status === 'offer' && styles.offerBadge]}>{badge}</Text> : null}
    </Pressable>
  );
}

export function ProfessionalHomeScreen() {
  const { activeJob, available, completedCount, rating, recentJobs, reviewCount, toggleAvailable, upcomingJobs, weekEarnings } = useProfessionalData();
  const { application } = useProfessionalRegistration();
  const { t } = useProfessionalCopy();
  const unreadNotifications = useOptionalNotifications()?.unreadCount ?? 0;
  // Every open request gets its own accept/decline card, not only the first job.
  const allJobs = activeJob ? [activeJob, ...upcomingJobs] : upcomingJobs;
  const requests = allJobs.filter((job) => job.status === 'offer');
  const current = allJobs.find((job) => job.status !== 'offer') ?? null;
  const later = allJobs.filter((job) => job.status !== 'offer' && job.id !== current?.id);
  const displayName = application?.profile.displayName ?? t('professionalFallbackName');
  const initials = displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const zoneLabels = application?.travelZones.filter((zone) => zone.active).map((zone) => zone.label).join(', ') ?? '';
  return (
    <ProfessionalTabScreen activeTab="Home">
      <StatusBar style="dark" />
      <View style={styles.brandHeader}>
        <View><Text style={styles.brand}>Konjo</Text><Text style={styles.brandTagline}>{t('brandTagline')}</Text></View>
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel={t('notifications')} accessibilityRole="button" onPress={() => router.push('/pro/notifications' as Href)} style={styles.headerCircle}>
            <KonjoIcon color={professionalPalette.text} name={{ ios: 'bell', android: 'notifications_none', web: 'notifications_none' }} size={19} />
            {unreadNotifications ? <View style={styles.headerDot} /> : null}
          </Pressable>
          <View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{initials}</Text></View>
        </View>
      </View>
      <View style={styles.availabilityRow}>
        <View style={styles.verifiedName}><Text style={styles.providerName}>{displayName}</Text><KonjoIcon color={professionalPalette.olive} name={{ ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' }} size={17} /></View>
        <View style={styles.availabilityControl}><Text style={styles.availabilityLabel}>{available ? t('availableBadge') : t('offlineBadge')}</Text><ProfessionalSwitch label={t('availableForBookings')} onChange={toggleAvailable} value={available} /></View>
      </View>
      {requests.map((job) => <ActiveJobCard job={job} key={job.id} />)}
      {current ? <ActiveJobCard job={current} /> : null}
      {!requests.length && !current ? <View style={styles.emptyJob}><Text style={styles.emptyJobText}>{t('noActiveRequests')}</Text></View> : null}
      <View style={styles.metricsRow}>
        <Metric label={t('metricThisWeek')} value={`ETB ${weekEarnings}`} />
        <Metric label={t('metricCompleted')} value={`${completedCount}`} />
        <Metric label={reviewCount ? (reviewCount === 1 ? t('metricRatingOne') : t('metricRatingMany', { count: reviewCount })) : t('metricRating')} onPress={() => router.push('/pro/ratings' as Href)} value={reviewCount ? rating.toFixed(1) : t('ratingNew')} />
      </View>
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{t('upcomingBookings')}</Text><Pressable onPress={() => router.replace('/pro/calendar' as Href)}><Text style={styles.sectionLink}>{t('calendarLink')}</Text></Pressable></View>
      <View style={styles.upcomingStack}>{later.map((job) => <UpcomingJob job={job} key={job.id} />)}</View>
      {recentJobs.length ? (
        <>
          <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{t('recentVisits')}</Text><Text style={styles.sectionLink}>{t('last30Days')}</Text></View>
          <View style={styles.upcomingStack}>{recentJobs.slice(0, 5).map((job) => <RecentJob job={job} key={job.id} />)}</View>
        </>
      ) : null}
      <View style={styles.verificationBanner}><KonjoIcon color={professionalPalette.olive} name={{ ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' }} size={19} /><Text style={styles.verificationText}><Text style={styles.verificationStrong}>{t('identityReviewed')}</Text>{t('zonesActiveIn', { zones: zoneLabels || t('addisAbaba') })}</Text></View>
    </ProfessionalTabScreen>
  );
}

export function ProfessionalCalendarScreen() {
  const { activeJob, recentJobs, upcomingJobs } = useProfessionalData();
  const { shortDayNames, t } = useProfessionalCopy();
  const days = shortDayNames.map((name, index) => (index === 3 ? t('today') : name));
  const [day, setDay] = useState(days[3]);
  const completed = recentJobs.filter((job) => job.outcome === 'completed').slice(0, 3);
  const scheduled = activeJob ? [activeJob, ...upcomingJobs] : upcomingJobs;
  return (
    <ProfessionalTabScreen activeTab="Calendar">
      <StatusBar style="dark" />
      <Text accessibilityRole="header" style={proSharedStyles.pageTitle}>{t('calendarTitle')}</Text>
      <HorizontalScrollView contentContainerStyle={styles.daysRow} showsHorizontalScrollIndicator={false}>
        {days.map((item) => <Pressable key={item} onPress={() => setDay(item)} style={[styles.dayButton, item === day && styles.dayButtonActive]}><Text style={[styles.dayLabel, item === day && styles.dayLabelActive]}>{item}</Text></Pressable>)}
      </HorizontalScrollView>
      <View style={styles.calendarStack}>{completed.map((job) => <RecentJob job={job} key={job.id} />)}{scheduled.map((job) => <UpcomingJob job={job} key={job.id} />)}{!completed.length && !scheduled.length ? <Text style={styles.emptyJobText}>{t('nothingScheduled')}</Text> : null}</View>
    </ProfessionalTabScreen>
  );
}

export function ProfessionalEarningsScreen() {
  const { weekEarnings } = useProfessionalData();
  const { application } = useProfessionalRegistration();
  const { payouts, loading } = useProfessionalPayouts();
  const { t } = useProfessionalCopy();
  const payoutMethod = normalizePayoutMethod(application?.profile.payoutMethod);
  const payoutMethodLabel = !payoutMethod
    ? t('addPayoutInProfile')
    : payoutMethod.type === 'bank'
      ? `${payoutMethod.bankName} ····${payoutMethod.accountNumber.slice(-4)}`
      : `${payoutMethod.type === 'telebirr' ? 'Telebirr' : 'CBE Birr'} ${payoutMethod.accountNumber}`;
  const owed = payouts.filter((payout) => payout.status === 'queued').reduce((sum, payout) => sum + payout.amount, 0);
  return (
    <ProfessionalTabScreen activeTab="Earnings">
      <StatusBar style="dark" />
      <Text accessibilityRole="header" style={proSharedStyles.pageTitle}>{t('earningsTitle')}</Text>
      <View style={styles.earningsHero}><Text style={styles.earningsEyebrow}>{t('thisWeekEyebrow')}</Text><Text style={styles.earningsValue}>ETB {weekEarnings}</Text></View>
      <View style={styles.nextPayout}><View style={styles.nextPayoutCopy}><Text style={styles.nextPayoutTitle}>{owed > 0 ? t('payoutProcessing') : t('payoutsGoTo')}</Text><Text style={styles.nextPayoutMeta}>{payoutMethodLabel}</Text></View><Text style={styles.nextPayoutAmount}>ETB {owed > 0 ? owed.toLocaleString() : weekEarnings.toLocaleString()}</Text></View>
      <Text style={styles.commission}>{t('commissionNote')}</Text>
      <Text style={styles.payoutTitle}>{t('payoutHistory')}</Text>
      <View style={styles.payoutStack}>
        {loading ? <Text style={styles.paid}>{t('loadingPayouts')}</Text> : null}
        {!loading && !payouts.length ? <Text style={styles.paid}>{t('noPayouts')}</Text> : null}
        {payouts.map((payout) => (
          <View key={payout.id} style={styles.payoutRow}>
            <View style={styles.nextPayoutCopy}>
              <Text style={styles.payoutWeek}>{new Date(payout.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {payout.bookingCount} {payout.bookingCount === 1 ? t('visitOne') : t('visitMany')}</Text>
              <Text style={styles.paid}>{payout.status === 'paid' ? `${t('payoutPaid')}${payout.paidReference ? t('payoutRef', { reference: payout.paidReference }) : ''}` : payout.status === 'queued' ? t('payoutQueued') : t('payoutFailed')}</Text>
            </View>
            <Text style={styles.payoutAmount}>ETB {payout.amount.toLocaleString()}</Text>
          </View>
        ))}
      </View>
    </ProfessionalTabScreen>
  );
}

function FinishedJobDetail({ job }: { job: ProfessionalJob }) {
  const { t } = useProfessionalCopy();
  const payment = jobPaymentStatus(job, t);
  const summary = job.paymentSummary;
  const finishedOn = job.completedAt ? new Date(job.completedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <View style={styles.jobDetail}>
      <View style={styles.jobDetailTitleRow}><View style={styles.jobTitleCopy}><Text style={styles.detailClientName}>{job.name}</Text><Text style={styles.detailService}>{job.service} · {job.outcome === 'cancelled' ? t('cancelled') : t('completed')}</Text></View><Text style={styles.detailPrice}>ETB {job.price.toLocaleString()}</Text></View>
      <View style={styles.detailInfoCard}>
        <IconText icon="time">{finishedOn ? t('finishedAt', { when: finishedOn }) : job.time}</IconText>
        <IconText icon="location">{job.address}{job.addressDetail ? ` · ${job.addressDetail}` : ''}</IconText>
        <IconText icon="payment">{job.payment}{job.travelFee ? t('travelSuffix', { fee: job.travelFee }) : ''}{job.extraAmount ? `${t('extrasSuffix', { amount: job.extraAmount.toLocaleString() })}${job.extraNote ? ` (${job.extraNote})` : ''}` : ''}</IconText>
      </View>
      <View style={[styles.paymentStatusCard, payment.settled ? styles.paymentSettledCard : styles.paymentDueCard]}>
        <Text style={styles.paymentStatusLabel}>{job.outcome === 'cancelled' ? t('bookingCancelled') : payment.settled ? t('paymentComplete') : t('finalPaymentOutstanding')}</Text>
        <Text style={styles.paymentStatusValue}>{payment.label}</Text>
        {summary && job.outcome !== 'cancelled' ? (
          <Text style={styles.mapNote}>{t('depositBalanceLine', { deposit: summary.depositAmount.toLocaleString(), depositMark: summary.depositPaid ? '✓' : t('unpaidMark'), balance: summary.balanceAmount.toLocaleString(), balanceMark: summary.fullyPaid ? '✓' : t('pendingMark') })}</Text>
        ) : null}
        {!payment.settled && job.outcome !== 'cancelled' ? <Text style={styles.mapNote}>{t('balanceNote')}</Text> : null}
      </View>
    </View>
  );
}

export function ProfessionalJobScreen() {
  const { activeJob, dashboardLoaded, recentJobs, upcomingJobs, acceptJob, declineJob, startTravel, arrive, checkIn, completeJob, reportClientNoShow } = useProfessionalData();
  const { session } = useAuthSession();
  const { t } = useProfessionalCopy();
  const params = useLocalSearchParams<{ bookingId?: string | string[] }>();
  const requestedId = Array.isArray(params.bookingId) ? params.bookingId[0] : params.bookingId;
  const allJobs = [...(activeJob ? [activeJob, ...upcomingJobs] : upcomingJobs), ...recentJobs];
  const job = requestedId ? allJobs.find((item) => item.id === requestedId) : activeJob;
  const finished = job?.outcome !== undefined;
  const sessionStartedAt = job?.startedAt ? Date.parse(job.startedAt) : null;
  const [elapsed, setElapsed] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [showTravelFeeInput, setShowTravelFeeInput] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (job?.status !== 'onsite' || !sessionStartedAt) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [job?.status, sessionStartedAt]);
  const timer = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const performAction = () => {
    if (!job) return;
    if (job.status === 'offer') setShowTravelFeeInput(true);
    else if (job.status === 'accepted') startTravel(job.id);
    else if (job.status === 'traveling') { if (job.arrivedAt) checkIn(job.id); else arrive(job.id); }
    else setShowCheckout(true);
  };
  const sharing = job ? liveLocationReporter.isActiveFor(job.id) : false;
  const ownPoint = job?.lastReported && isRecentPoint(job.lastReported.recordedAt, now, 10 * 60_000) ? job.lastReported : null;
  const markers: MapMarker[] = job ? [
    ...(job.destination ? [{ id: 'destination', point: job.destination, kind: 'destination' as const, label: job.address.split('·')[0]?.trim() }] : []),
    ...(ownPoint ? [{ id: 'self', point: ownPoint, kind: 'self' as const, label: t('you') }] : []),
  ] : [];
  const remaining = job?.destination && ownPoint ? distanceMeters(ownPoint, job.destination) : null;
  const waitingForDeposit = job?.status === 'accepted' && job.paymentSummary?.depositPaid === false;
  const waitingForStart = false;
  const otherJourney = useOtherJourney(job?.id);
  const blockedByJourney = job?.status === 'accepted' && Boolean(otherJourney);
  const actionLabel = !job ? '' : waitingForStart ? t('onMyWayUnlocks', { time: job.time }) : waitingForDeposit ? t('awaitingDeposit') : blockedByJourney ? t('finishOtherVisit', { name: otherJourney?.name ?? '' }) : job.status === 'offer' ? t('accept') : job.status === 'accepted' ? t('onMyWay') : job.status === 'traveling' ? job.arrivedAt ? t('startWorkTimer') : t('arrived') : t('checkOutRequest');
  const confirmSos = () => {
    if (!job) return;
    Alert.alert(
      t('sosTitle'),
      t('sosBody'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('sosSend'),
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await safetyService.raiseAlert(job.id, session?.accessToken);
              Alert.alert(t('sosSentTitle'), result.locationShared ? t('sosSentWithLocation') : t('sosSentNoLocation'));
            } catch (error) {
              Alert.alert(t('sosFailedTitle'), error instanceof Error ? error.message : t('sosFailedBody'));
            }
          },
        },
      ],
    );
  };
  const confirmNoShow = () => {
    if (!job) return;
    Alert.alert(
      t('noShowTitle'),
      t('noShowBody', { rate: ((job.commissionRateBps ?? 1800) / 100).toLocaleString() }),
      [
        { text: t('keepBooking'), style: 'cancel' },
        {
          text: t('recordNoShow'),
          style: 'destructive',
          onPress: () => {
            reportClientNoShow(job.id);
            router.replace('/pro/home' as Href);
          },
        },
      ],
    );
  };
  return (
    <ProfessionalDetailScreen>
      <StatusBar style="dark" />
      <ProfessionalBackHeader title={t('jobDetails')} />
      {!job ? <Text style={styles.noJob}>{!dashboardLoaded ? t('loadingBookings') : requestedId ? t('bookingNotInList') : t('noActiveJob')}</Text> : finished ? <FinishedJobDetail job={job} /> : <View style={styles.jobDetail}>
        <View style={styles.jobDetailTitleRow}><View style={styles.jobTitleCopy}><Text style={styles.detailClientName}>{job.name}</Text><Text style={styles.detailService}>{job.service} · {job.description}</Text></View><Text style={styles.detailPrice}>ETB {job.price}</Text></View>
        <View style={styles.detailInfoCard}><IconText icon="time">{job.time}</IconText><IconText icon="location">{job.address} · {job.addressDetail}</IconText><IconText icon="payment">{job.payment}{job.travelFee ? t('travelSuffix', { fee: job.travelFee }) : ''}{job.extraAmount ? `${t('extrasSuffix', { amount: job.extraAmount.toLocaleString() })}${job.extraNote ? ` (${job.extraNote})` : ''}` : ''}</IconText></View>
        {markers.length ? <View style={styles.mapWrap}><BookingMap height={200} markers={markers} /></View> : (
          <View style={styles.mapCard}><View style={styles.mapPin}><KonjoIcon color={professionalPalette.white} name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }} size={21} /></View></View>
        )}
        <View style={styles.navigationRow}>
          <Pressable accessibilityRole="button" onPress={() => { void openExternalNavigation(job); }} style={styles.navigateButton}>
            <KonjoIcon color={professionalPalette.white} name={{ ios: 'arrow.triangle.turn.up.right.diamond', android: 'navigation', web: 'navigation' }} size={16} />
            <Text style={styles.navigateLabel}>{job.destination ? `${t('navigate')}${remaining !== null ? t('navigateLeft', { distance: formatDistance(remaining) }) : ''}` : t('navigateWritten')}</Text>
          </Pressable>
        </View>
        {!job.destination ? <Text style={styles.mapNote}>{t('noPinNote')}</Text> : null}
        {job.status === 'traveling' && !job.arrivedAt ? (
          <Text style={[styles.sharingNote, sharing && styles.sharingNoteActive]}>
            {sharing ? t('sharingOn') : t('sharingOff')}
          </Text>
        ) : job.status === 'traveling' || job.status === 'onsite' ? (
          <Text style={styles.sharingNote}>{t('sharingStopped')}</Text>
        ) : null}
        {job.status === 'onsite' ? <View style={styles.timerCard}><Text style={styles.timerLabel}>{t('sessionTimer')}</Text><Text style={styles.timerValue}>{timer}</Text></View> : null}
        {job.paymentSummary ? <Text style={styles.mapNote}>{t('paidRemaining', { paid: job.paymentSummary.paidAmount.toLocaleString(), remaining: job.paymentSummary.outstandingAmount.toLocaleString() })}</Text> : null}
        <RescheduleRequest job={job} />
        {job.status === 'offer' && showTravelFeeInput ? (
          <View style={styles.detailTravelFee}>
            <TravelFeeAcceptForm
              onCancel={() => setShowTravelFeeInput(false)}
              onConfirm={(travelFee) => { acceptJob(job.id, travelFee); setShowTravelFeeInput(false); }}
            />
          </View>
        ) : job.status === 'onsite' && showCheckout ? (
          <View style={styles.detailTravelFee}>
            <CheckoutExtrasForm job={job} onCancel={() => setShowCheckout(false)} onConfirm={(extras) => { completeJob(job.id, extras); setShowCheckout(false); }} />
          </View>
        ) : job.status === 'offer' ? <View style={styles.detailActionRow}><JobActionButton label={t('decline')} onPress={() => declineJob(job.id)} /><JobActionButton label={t('accept')} onPress={performAction} primary /></View> : <Pressable accessibilityRole="button" accessibilityState={{ disabled: waitingForStart || waitingForDeposit || blockedByJourney }} disabled={waitingForStart || waitingForDeposit || blockedByJourney} onPress={performAction} style={[styles.fullAction, (waitingForStart || waitingForDeposit || blockedByJourney) && styles.pressed]}><Text style={styles.fullActionLabel}>{actionLabel}</Text></Pressable>}
        {job.status === 'traveling' ? <Pressable onPress={confirmNoShow} style={styles.noShowButton}><Text style={styles.noShowLabel}>{t('noShowButton')}</Text></Pressable> : null}
        {job.status !== 'offer' ? <Pressable onPress={confirmSos} style={styles.sosButton}><KonjoIcon color={professionalPalette.danger} name={{ ios: 'exclamationmark.triangle', android: 'warning_amber', web: 'warning_amber' }} size={17} /><Text style={styles.sosLabel}>{t('sosButton')}</Text></Pressable> : null}
      </View>}
    </ProfessionalDetailScreen>
  );
}

const styles = StyleSheet.create({
  brandHeader: { minHeight: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: professionalPalette.border, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  brand: { color: professionalPalette.text, fontFamily: fontFamilies.display.medium, fontSize: 22 },
  brandTagline: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 10, letterSpacing: 1, marginTop: 2 },
  paymentSettledCard: { borderWidth: 1, borderColor: professionalPalette.olive },
  paymentDueCard: { borderWidth: 1, borderColor: '#D4A017' },
  paymentStatusCard: { borderRadius: 12, backgroundColor: professionalPalette.surfaceMuted, marginTop: 16, padding: 16 },
  paymentStatusLabel: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 12.5 },
  paymentStatusValue: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 15, marginTop: 4 },
  noShowButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: professionalPalette.danger, borderRadius: radii.sm, marginTop: spacing.sm, paddingHorizontal: spacing.md },
  noShowLabel: { color: professionalPalette.danger, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCircle: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: professionalPalette.border, backgroundColor: professionalPalette.white, alignItems: 'center', justifyContent: 'center' },
  smallAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: professionalPalette.sage, backgroundColor: professionalPalette.olive, alignItems: 'center', justifyContent: 'center' },
  smallAvatarText: { color: professionalPalette.white, fontFamily: fontFamilies.body.bold, fontSize: 11 },
  availabilityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  verifiedName: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  providerName: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 18 },
  availabilityControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  availabilityLabel: { color: professionalPalette.olive, fontFamily: fontFamilies.body.bold, fontSize: 11, letterSpacing: 0.55 },
  jobCard: { marginHorizontal: spacing.lg, marginTop: 18, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 14, backgroundColor: professionalPalette.white, padding: 18 },
  jobCardOffer: { borderWidth: 1.5, borderColor: professionalPalette.gold },
  jobCardDark: { backgroundColor: professionalPalette.text, borderColor: professionalPalette.text },
  jobStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  jobStatusGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: professionalPalette.gold },
  statusDotGreen: { backgroundColor: professionalPalette.sage },
  statusLabel: { color: professionalPalette.goldText, fontFamily: fontFamilies.body.bold, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase' },
  cardTimer: { color: professionalPalette.white, fontFamily: fontFamilies.display.medium, fontSize: 16 },
  jobTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginTop: 10 },
  jobTitleCopy: { flex: 1, minWidth: 0 },
  jobName: { color: professionalPalette.text, fontFamily: fontFamilies.display.regular, fontSize: 20 },
  jobService: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  jobPrice: { color: professionalPalette.text, fontFamily: fontFamilies.body.bold, fontSize: 17 },
  onDark: { color: professionalPalette.white },
  onDarkMuted: { color: 'rgba(255,255,255,0.65)' },
  jobDetails: { gap: 8, borderRadius: 8, backgroundColor: professionalPalette.surfaceMuted, paddingHorizontal: 14, paddingVertical: 12, marginTop: 14 },
  iconTextRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconText: { flex: 1, color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 19 },
  jobActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  rescheduleCard: { borderRadius: 10, borderWidth: 1, borderColor: '#D4A017', backgroundColor: professionalPalette.goldSoft, padding: 14, marginTop: 12 },
  rescheduleTitle: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  rescheduleBody: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  checkoutTitle: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14, marginTop: 12 },
  checkoutNoteField: { borderWidth: 1, borderColor: professionalPalette.sage, borderRadius: 8, backgroundColor: professionalPalette.white, color: professionalPalette.text, fontFamily: fontFamilies.body.regular, fontSize: 13.5, paddingHorizontal: 12, paddingVertical: 10, marginTop: 8 },
  travelFeeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, backgroundColor: professionalPalette.surfaceMuted, paddingHorizontal: 14, paddingVertical: 10, marginTop: 12 },
  travelFeeLabel: { flex: 1, color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 12.5 },
  travelFeeField: { width: 64, borderWidth: 1, borderColor: professionalPalette.sage, borderRadius: 6, backgroundColor: professionalPalette.white, color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14, paddingHorizontal: 10, paddingVertical: 6, textAlign: 'right' },
  travelFeeCurrency: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 12 },
  travelFeeFieldInvalid: { borderColor: professionalPalette.danger },
  travelFeeHint: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 16, marginTop: 8 },
  travelFeeHintInvalid: { color: professionalPalette.danger },
  detailTravelFee: { marginTop: 20 },
  jobAction: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 8, backgroundColor: professionalPalette.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  jobActionPrimary: { flex: 2, borderColor: professionalPalette.sage, backgroundColor: professionalPalette.sage },
  jobActionLabel: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  jobActionPrimaryLabel: { color: professionalPalette.white, fontFamily: fontFamilies.body.bold },
  emptyJob: { marginHorizontal: spacing.lg, marginTop: 18, borderWidth: 1, borderStyle: 'dashed', borderColor: '#C5C8BC', borderRadius: 14, backgroundColor: professionalPalette.white, padding: 26 },
  emptyJobText: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13.5, textAlign: 'center' },
  metricsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  metric: { flex: 1, minHeight: 74, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 10, backgroundColor: professionalPalette.white, alignItems: 'center', justifyContent: 'center', padding: 8 },
  metricValue: { color: professionalPalette.text, fontFamily: fontFamilies.display.regular, fontSize: 17, textAlign: 'center' },
  metricLabel: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 10, marginTop: 3 },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginHorizontal: spacing.lg, marginTop: 24 },
  sectionTitle: { color: professionalPalette.text, fontFamily: fontFamilies.display.medium, fontSize: 19 },
  sectionLink: { color: professionalPalette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  upcomingStack: { gap: 10, paddingHorizontal: spacing.lg, marginTop: 12 },
  upcomingCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 10, backgroundColor: professionalPalette.white, padding: 12 },
  upcomingMuted: { borderWidth: 0, backgroundColor: professionalPalette.surfaceMuted, opacity: 0.72 },
  timeBlock: { minWidth: 74, borderRadius: 8, backgroundColor: professionalPalette.surfaceMuted, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8 },
  timeEyebrow: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 9 },
  timeValue: { color: professionalPalette.text, fontFamily: fontFamilies.body.bold, fontSize: 13, marginTop: 1 },
  upcomingCopy: { flex: 1, minWidth: 0 },
  upcomingName: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  upcomingService: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 16 },
  confirmedBadge: { color: professionalPalette.olive, fontFamily: fontFamilies.body.bold, fontSize: 10, borderRadius: 99, backgroundColor: professionalPalette.greenSoft, paddingHorizontal: 9, paddingVertical: 5 },
  verificationBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 10, backgroundColor: professionalPalette.greenSoft, marginHorizontal: spacing.lg, marginTop: 24, padding: 16 },
  verificationText: { flex: 1, color: '#33422D', fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 18 },
  verificationStrong: { fontFamily: fontFamilies.body.bold },
  daysRow: { gap: 8, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  dayButton: { minWidth: 62, minHeight: 48, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 10, backgroundColor: professionalPalette.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  dayButtonActive: { backgroundColor: professionalPalette.text, borderColor: professionalPalette.text },
  dayLabel: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  dayLabelActive: { color: professionalPalette.white },
  calendarStack: { gap: 10, paddingHorizontal: spacing.lg, paddingTop: 8 },
  earningsHero: { marginHorizontal: spacing.lg, marginTop: 14, borderRadius: 14, backgroundColor: professionalPalette.text, padding: 20 },
  earningsEyebrow: { color: 'rgba(255,255,255,0.60)', fontFamily: fontFamilies.body.regular, fontSize: 11, letterSpacing: 0.55 },
  earningsValue: { color: professionalPalette.white, fontFamily: fontFamilies.display.regular, fontSize: 34, marginTop: 6 },
  nextPayout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: spacing.lg, marginTop: 14, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 12, backgroundColor: professionalPalette.white, padding: 16 },
  nextPayoutCopy: { flex: 1, marginRight: 12 },
  nextPayoutTitle: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  nextPayoutMeta: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, marginTop: 2 },
  nextPayoutAmount: { color: professionalPalette.gold, fontFamily: fontFamilies.body.bold, fontSize: 17 },
  commission: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 18, marginHorizontal: spacing.lg, marginTop: 10 },
  payoutTitle: { color: professionalPalette.text, fontFamily: fontFamilies.display.medium, fontSize: 19, marginHorizontal: spacing.lg, marginTop: 22 },
  payoutStack: { gap: 10, paddingHorizontal: spacing.lg, marginTop: 12 },
  payoutRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 10, backgroundColor: professionalPalette.white, paddingHorizontal: 14, paddingVertical: 13 },
  payoutWeek: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  paid: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11.5, marginTop: 1 },
  payoutAmount: { color: professionalPalette.text, fontFamily: fontFamilies.body.bold, fontSize: 14.5 },
  noJob: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13.5, textAlign: 'center', paddingTop: 60 },
  jobDetail: { paddingHorizontal: spacing.lg, paddingTop: 18 },
  jobDetailTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  detailClientName: { color: professionalPalette.text, fontFamily: fontFamilies.display.regular, fontSize: 25 },
  detailService: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13, marginTop: 4 },
  detailPrice: { color: professionalPalette.text, fontFamily: fontFamilies.body.bold, fontSize: 19 },
  detailInfoCard: { gap: 12, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 12, backgroundColor: professionalPalette.white, marginTop: 18, padding: 16 },
  mapCard: { height: 140, borderRadius: 12, backgroundColor: '#E3EAE0', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  mapWrap: { marginTop: 16 },
  mapNote: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 17, marginTop: 10 },
  navigationRow: { marginTop: 10 },
  navigateButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 8, backgroundColor: professionalPalette.text },
  navigateLabel: { color: professionalPalette.white, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  sharingNote: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 17, marginTop: 10 },
  sharingNoteActive: { color: professionalPalette.olive },
  headerDot: { position: 'absolute', top: 7, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: professionalPalette.gold },
  offerBadge: { color: professionalPalette.goldText, backgroundColor: '#FFF4DE' },
  mapPin: { width: 42, height: 42, borderRadius: 21, backgroundColor: professionalPalette.olive, alignItems: 'center', justifyContent: 'center' },
  timerCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, backgroundColor: professionalPalette.text, marginTop: 16, padding: 16 },
  timerLabel: { color: 'rgba(255,255,255,0.70)', fontFamily: fontFamilies.body.regular, fontSize: 12.5 },
  timerValue: { color: professionalPalette.white, fontFamily: fontFamilies.display.regular, fontSize: 24 },
  detailActionRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  fullAction: { minHeight: 52, borderRadius: 8, backgroundColor: professionalPalette.olive, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  fullActionLabel: { color: professionalPalette.white, fontFamily: fontFamilies.body.bold, fontSize: 14.5 },
  sosButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: professionalPalette.danger, borderRadius: 8, marginTop: 12, padding: 12 },
  sosLabel: { color: professionalPalette.danger, fontFamily: fontFamilies.body.bold, fontSize: 13 },
  pressed: { opacity: 0.7 },
});
