import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ProfessionalDocument } from '@/application/professional-documents/professional-document-contracts';
import { KonjoIcon } from '@/components/ui/konjo-icon';
import { ProfessionalBackHeader, ProfessionalDetailScreen, ProfessionalSwitch, proSharedStyles } from '@/features/professional/professional-components';
import { type ProfessionalService, useProfessionalData } from '@/features/professional/professional-data-context';
import { useProfessionalDocuments } from '@/features/professional/documents/professional-document-context';
import { useProfessionalRegistration } from '@/features/professional/registration/professional-registration-context';
import { PortfolioGrid } from '@/features/professional/documents/portfolio-grid';
import { professionalPortfolioCopy } from '@/features/professional/registration/professional-portfolio-copy';
import { fontFamilies, professionalPalette, spacing } from '@/theme/tokens';
import { useProfessionalPayouts } from '@/features/professional/use-professional-payouts';
import { openSupportEmail, openSupportPhone, supportEmail, supportPhone } from '@/features/support/support-links';
import { professionalDashboardService } from '@/features/professional/professional-dashboard-service';
import { useAuthSession } from '@/features/auth/session-context';
import { useProfessionalCopy } from '@/localization/use-professional-copy';
import type { ProfessionalCopyKey } from '@/localization/professional-copy';
import type { ApiProfessionalReview } from '../../../shared/api-contracts';
import { normalizePayoutMethod } from '../../../shared/payout-method';

function DetailShell({ title, children }: { title: string; children: React.ReactNode }) {
  return <ProfessionalDetailScreen><StatusBar style="dark" /><ProfessionalBackHeader title={title} />{children}</ProfessionalDetailScreen>;
}

type Translate = (key: ProfessionalCopyKey, params?: Record<string, string | number>) => string;

function relativeDay(iso: string, t: Translate): string {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
  if (days === 0) return t('today');
  if (days === 1) return t('yesterday');
  if (days < 7) return t('daysAgo', { days });
  if (days < 14) return t('weekAgo');
  if (days < 30) return t('weeksAgo', { weeks: Math.floor(days / 7) });
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ProfessionalRatingsScreen() {
  const { rating, reviewCount, dashboardLoaded } = useProfessionalData();
  const { session } = useAuthSession();
  const { t } = useProfessionalCopy();
  const [loaded, setLoaded] = useState<readonly ApiProfessionalReview[] | null>(null);
  const professionalId = session?.source === 'api' ? session.userId ?? null : null;
  useEffect(() => {
    if (!professionalId) return;
    let cancelled = false;
    professionalDashboardService.listReviews(professionalId)
      .then((list) => { if (!cancelled) setLoaded(list); })
      .catch(() => { if (!cancelled) setLoaded([]); });
    return () => { cancelled = true; };
  }, [professionalId]);
  // Without an API session there is nothing to fetch; show an empty list rather than a spinner.
  const reviews: readonly ApiProfessionalReview[] | null = professionalId ? loaded : [];
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const technique = average((reviews ?? []).map((review) => review.techniqueRating));
  const professionalism = average((reviews ?? []).map((review) => review.professionalismRating));
  const breakdown: readonly (readonly [string, number])[] = reviews?.length
    ? [[t('techniqueResults'), Math.round((technique / 5) * 100)], [t('professionalismPunctuality'), Math.round((professionalism / 5) * 100)]]
    : [];
  const stars = reviewCount ? '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating)) : '☆☆☆☆☆';
  return (
    <DetailShell title={t('ratingsTitle')}>
      <Text style={styles.intro}>{reviewCount ? (reviewCount === 1 ? t('basedOnOne') : t('basedOnMany', { count: reviewCount })) : t('ratingAppears')}</Text>
      <View style={[proSharedStyles.card, styles.ratingsCard]}>
        <View style={styles.scoreRow}>
          <View><Text style={styles.scoreEyebrow}>{t('overallScore')}</Text><Text style={styles.score}>{reviewCount ? rating.toFixed(1) : '—'}<Text style={styles.scoreOutOf}> / 5.0</Text></Text><Text style={styles.stars}>{stars}</Text></View>
          <View style={styles.scoreBadges}><Text style={styles.verifiedBadge}>{t('verifiedOnly')}</Text></View>
        </View>
        {breakdown.length ? <View style={styles.breakdown}>{breakdown.map(([label, percent]) => <View key={label}><View style={styles.breakdownLabelRow}><Text style={styles.breakdownLabel}>{label}</Text><Text style={styles.breakdownPercent}>{percent}%</Text></View><View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${percent}%` }]} /></View></View>)}</View> : null}
      </View>
      <Text style={styles.sectionEyebrow}>{t('clientReviews')}</Text>
      {reviews === null || !dashboardLoaded ? <ActivityIndicator color={professionalPalette.olive} /> : null}
      {reviews && !reviews.length ? <Text style={styles.intro}>{t('noReviews')}</Text> : null}
      <View style={styles.reviewStack}>{(reviews ?? []).map((review) => <View key={review.id} style={[proSharedStyles.card, styles.reviewCard]}><View style={styles.reviewHeader}><View><Text style={styles.reviewName}>{review.clientName}</Text><Text style={styles.reviewZone}>{t('reviewBreakdown', { technique: review.techniqueRating, professionalism: review.professionalismRating })}</Text></View><View style={styles.reviewRight}><Text style={styles.reviewRating}>★ {review.averageRating.toFixed(1)}</Text><Text style={styles.reviewTime}>{relativeDay(review.createdAt, t)}</Text></View></View>{review.tags.length ? <View style={styles.tags}>{review.tags.map((tag) => <Text key={tag} style={styles.tag}>{tag}</Text>)}</View> : null}{review.reviewText ? <Text style={styles.reviewText}>{review.reviewText}</Text> : null}</View>)}</View>
    </DetailShell>
  );
}

function ServiceCard({ service, onRemove, onEditPrice }: { service: ProfessionalService; onRemove: () => void; onEditPrice: () => void }) {
  const { t } = useProfessionalCopy();
  const hours = (service.durationMinutes / 60).toFixed(1);
  return (
    <View style={[proSharedStyles.card, styles.serviceCard]}>
      <View style={styles.serviceTop}><View style={styles.serviceMeta}><Text style={styles.categoryBadge}>{service.category}</Text>{service.popular ? <Text style={styles.popular}>{t('popular')}</Text> : null}</View><Pressable accessibilityLabel={t('removeService', { name: service.name })} onPress={onRemove} style={styles.deleteButton}><KonjoIcon color={professionalPalette.danger} name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={19} /></Pressable></View>
      <Text style={styles.serviceName}>{service.name}</Text>
      <View style={styles.serviceStats}><View style={styles.serviceStat}><Text style={styles.serviceStatLabel}>{t('durationLabel')}</Text><Text style={styles.serviceStatValue}>{t('hoursValue', { hours })}</Text></View><Pressable accessibilityLabel={t('changePriceAccessibility', { name: service.name })} accessibilityRole="button" onPress={onEditPrice} style={styles.serviceStat}><Text style={styles.serviceStatLabel}>{t('yourPrice')}</Text><Text style={styles.servicePrice}>{service.price}</Text><Text style={styles.editPriceLabel}>{t('changePrice')}</Text></Pressable></View>
      <Text style={styles.serviceNote}>{service.note}</Text>
    </View>
  );
}

export function ProfessionalServicesScreen() {
  const { services, removeService, addService, updateServicePrice } = useProfessionalData();
  const { t } = useProfessionalCopy();
  const [editing, setEditing] = useState<{ service: ProfessionalService; value: string } | null>(null);
  const editingPrice = editing && /^\d{1,6}$/.test(editing.value.trim()) ? Number(editing.value.trim()) : Number.NaN;
  const editingValid = Number.isInteger(editingPrice) && editingPrice >= 50 && editingPrice <= 100_000;
  const confirmRemove = (service: ProfessionalService) => Alert.alert(t('removeServiceTitle'), t('removeServiceBody', { name: service.name }), [{ text: t('keepService'), style: 'cancel' }, { text: t('remove'), style: 'destructive', onPress: () => removeService(service.id) }]);
  return (
    <DetailShell title={t('servicesTitle')}>
      <View style={styles.serviceStack}>{services.map((service) => <ServiceCard key={service.id} onEditPrice={() => setEditing({ service, value: String(service.price) })} onRemove={() => confirmRemove(service)} service={service} />)}</View>
      <Pressable onPress={addService} style={({ pressed }) => [styles.dashedButton, pressed && styles.pressed]}><Text style={styles.dashedButtonLabel}>{t('addNewService')}</Text></Pressable>
      <View style={styles.infoBanner}><Text style={styles.infoText}>{t('servicesInfo')}</Text></View>
      <Modal animationType="fade" onRequestClose={() => setEditing(null)} transparent visible={editing !== null}>
        <View style={styles.priceBackdrop}>
          <View style={styles.priceCard}>
            <Text style={styles.priceTitle}>{editing?.service.name}</Text>
            <Text style={styles.priceBody}>{t('newPriceBody')}</Text>
            <TextInput
              accessibilityLabel={t('newPriceAccessibility')}
              autoFocus
              inputMode="numeric"
              keyboardType="number-pad"
              onChangeText={(value) => setEditing((current) => (current ? { ...current, value } : current))}
              style={[styles.priceInput, editing && !editingValid && styles.priceInputInvalid]}
              value={editing?.value ?? ''}
            />
            {editing && !editingValid ? <Text style={styles.priceHint}>{t('priceInvalid')}</Text> : null}
            <View style={styles.priceActions}>
              <Pressable accessibilityRole="button" onPress={() => setEditing(null)} style={styles.priceCancel}><Text style={styles.priceCancelLabel}>{t('cancel')}</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityState={{ disabled: !editingValid }} disabled={!editingValid} onPress={() => { if (editing && editingValid) { updateServicePrice(editing.service.id, editingPrice); setEditing(null); } }} style={[styles.priceSave, !editingValid && styles.priceSaveDisabled]}><Text style={styles.priceSaveLabel}>{t('savePrice')}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </DetailShell>
  );
}

export function ProfessionalZonesScreen() {
  const { travelZones, sameDayBookings, toggleTravelZone, toggleSameDayBookings } = useProfessionalData();
  const { t } = useProfessionalCopy();
  const activeCount = travelZones.filter((zone) => zone.active).length;
  return (
    <DetailShell title={t('zonesTitle')}>
      <Text style={styles.sectionEyebrow}>{t('zonesYouTravelTo')}</Text>
      <Text style={styles.zoneIntro}>{t('zonesIntro')}</Text>
      <View style={styles.zoneChips}>{travelZones.map((zone) => <Pressable key={zone.id} accessibilityRole="checkbox" accessibilityState={{ checked: zone.active }} onPress={() => toggleTravelZone(zone.id)} style={[styles.zoneChip, zone.active && styles.zoneChipActive]}><Text style={[styles.zoneChipLabel, zone.active && styles.zoneChipLabelActive]}>{zone.active ? '✓ ' : ''}{zone.label}</Text></Pressable>)}</View>
      <View style={styles.infoBanner}><Text style={styles.infoText}>{t('zonesSelectedNote', { count: activeCount })}</Text></View>
      <Text style={styles.sectionEyebrow}>{t('instantBooking')}</Text>
      <View style={[proSharedStyles.card, styles.sameDayCard]}><View style={styles.sameDayCopy}><Text style={styles.sameDayTitle}>{t('sameDay')}</Text><Text style={styles.sameDayDescription}>{t('sameDayHelp')}</Text></View><ProfessionalSwitch label={t('sameDay')} onChange={toggleSameDayBookings} value={sameDayBookings} /></View>
    </DetailShell>
  );
}

function VerificationRow({ icon, label, status, last = false }: { icon: 'id' | 'certificate'; label: string; status: ProfessionalCopyKey; last?: boolean }) {
  const { t } = useProfessionalCopy();
  const icons = { id: { ios: 'person.text.rectangle', android: 'badge', web: 'badge' }, certificate: { ios: 'shield', android: 'shield', web: 'shield' } } as const;
  return <View style={[styles.verificationRow, !last && styles.rowBorder]}><KonjoIcon color={professionalPalette.olive} name={icons[icon]} size={20} /><Text style={styles.verificationLabel}>{label}</Text><Text style={status === 'docApproved' ? styles.verifiedBadge : styles.repeatBadge}>{t(status)}</Text></View>;
}

function ProfessionalDocumentRow({
  document,
  disabled,
  onDelete,
}: {
  document: ProfessionalDocument;
  disabled: boolean;
  onDelete(): void;
}) {
  const { t } = useProfessionalCopy();
  const fileName = document.storagePath.split('/').pop() ?? t('certificateFallback');
  const uploaded = new Date(document.createdAt).toLocaleDateString();
  const statusStyle = document.status === 'approved'
    ? styles.documentApproved
    : document.status === 'rejected' ? styles.documentRejected : styles.documentPending;
  return (
    <View style={styles.documentRow}>
      <View style={styles.documentIcon}>
        <KonjoIcon color={professionalPalette.olive} name={{ ios: 'doc', android: 'description', web: 'description' }} size={20} />
      </View>
      <View style={styles.documentCopy}>
        <Text numberOfLines={1} style={styles.documentName}>{fileName}</Text>
        <Text style={styles.documentDate}>{t('uploaded', { date: uploaded })}</Text>
        {document.rejectionReason ? <Text style={styles.rejectionReason}>{document.rejectionReason}</Text> : null}
      </View>
      <View style={styles.documentActions}>
        <Text style={[styles.documentStatus, statusStyle]}>{t(document.status === 'approved' ? 'docApproved' : document.status === 'rejected' ? 'docRejected' : 'docPending')}</Text>
        {document.status === 'approved' ? (
          <KonjoIcon color={professionalPalette.textMuted} name={{ ios: 'lock', android: 'lock_outline', web: 'lock_outline' }} size={17} />
        ) : (
          <Pressable accessibilityLabel={t('deleteFile', { name: fileName })} disabled={disabled} onPress={onDelete} hitSlop={8}>
            <KonjoIcon color={professionalPalette.danger} name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={18} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function ProfessionalDocumentsScreen() {
  const { application } = useProfessionalRegistration();
  const { t } = useProfessionalCopy();
  const {
    documents,
    loading,
    mutationStatus,
    error,
    uploadDocument,
    deleteDocument,
    dismissError,
  } = useProfessionalDocuments();
  const certificates = documents.filter((document) => document.kind === 'certificate');
  const identityFront = documents.filter((document) => document.kind === 'national_id_front');
  const identityBack = documents.filter((document) => document.kind === 'national_id_back');
  const reviewableDocuments = certificates;
  const approved = certificates.some((document) => document.status === 'approved');
  const pending = certificates.some((document) => document.status === 'pending');
  const credentialStatus: ProfessionalCopyKey = approved
    ? 'docApproved'
    : pending ? 'docInReview' : application?.identity.credentialAdded ? 'docAdded' : 'docRequiredOnboarding';
  const evidenceStatus = (evidence: readonly ProfessionalDocument[]): ProfessionalCopyKey => {
    if (evidence.some((document) => document.status === 'approved')) return 'docApproved';
    if (evidence.some((document) => document.status === 'pending')) return 'docInReview';
    if (evidence.some((document) => document.status === 'rejected')) return 'docRejected';
    return 'docRequired';
  };
  const busy = mutationStatus !== 'idle';
  const uploadLabel = mutationStatus === 'picking'
    ? t('chooseDocument')
    : mutationStatus === 'uploading' ? t('uploadingSecurely') : t('uploadCertificate');
  const confirmDelete = (document: ProfessionalDocument) => {
    Alert.alert(
      t('deleteDocTitle'),
      t('deleteDocBody'),
      [
        { text: t('keep'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => { void deleteDocument(document.id); } },
      ],
    );
  };
  return (
    <DetailShell title={t('documentsTitle')}>
      <View style={styles.documentsBanner}><KonjoIcon color={professionalPalette.olive} name={{ ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' }} size={21} /><Text style={styles.documentsBannerText}>{t('documentsBanner')}</Text></View>
      <View style={[proSharedStyles.card, styles.verificationList]}><VerificationRow icon="id" label={t('idFront')} status={evidenceStatus(identityFront)} /><VerificationRow icon="id" label={t('idBack')} status={evidenceStatus(identityBack)} /><VerificationRow icon="certificate" label={t('diplomas')} last status={credentialStatus} /></View>
      {loading ? <ActivityIndicator color={professionalPalette.olive} style={styles.documentLoader} /> : null}
      {reviewableDocuments.length ? (
        <View style={[proSharedStyles.card, styles.documentList]}>
          {reviewableDocuments.map((document, index) => (
            <View key={document.id} style={index < reviewableDocuments.length - 1 && styles.rowBorder}>
              <ProfessionalDocumentRow document={document} disabled={busy} onDelete={() => confirmDelete(document)} />
            </View>
          ))}
        </View>
      ) : null}
      {error ? <Pressable accessibilityRole="alert" onPress={dismissError} style={styles.documentError}><Text style={styles.documentErrorText}>{error}</Text><Text style={styles.documentErrorDismiss}>{t('dismiss')}</Text></Pressable> : null}
      <Pressable disabled={busy || loading} onPress={() => { void uploadDocument('certificate', 'course'); }} style={({ pressed }) => [styles.dashedButton, (busy || loading) && styles.disabled, pressed && styles.pressed]}>
        {mutationStatus === 'uploading' ? <ActivityIndicator color={professionalPalette.olive} size="small" /> : null}
        <Text style={styles.dashedButtonLabel}>{uploadLabel}</Text>
      </Pressable>
      <Text style={styles.privacyText}>{t('documentsPrivacy')}</Text>
    </DetailShell>
  );
}

export function ProfessionalPortfolioScreen() {
  const { language } = useProfessionalCopy();
  const copy = professionalPortfolioCopy[language];
  return (
    <DetailShell title={copy.manageTitle}>
      <Text style={styles.intro}>{copy.manageBody}</Text>
      <View style={proSharedStyles.card}>
        <PortfolioGrid language={language} />
      </View>
    </DetailShell>
  );
}

export function ProfessionalPayoutScreen() {
  const { application } = useProfessionalRegistration();
  const { payouts, loading, error } = useProfessionalPayouts();
  const { t } = useProfessionalCopy();
  const method = normalizePayoutMethod(application?.profile.payoutMethod);
  const methodTitle = !method
    ? t('notSetYet')
    : method.type === 'bank'
      ? `${method.bankName} ····${method.accountNumber.slice(-4)}`
      : `${method.type === 'telebirr' ? 'Telebirr' : 'CBE Birr'} · ${method.accountNumber}`;
  return (
    <DetailShell title={t('payoutTitle')}>
      <View style={styles.payoutHero}>
        <Text style={styles.payoutHeroLabel}>{t('payoutMethodEyebrow')}</Text>
        <View style={styles.payoutMethod}>
          <KonjoIcon color={professionalPalette.white} name={{ ios: 'creditcard', android: 'credit_card', web: 'credit_card' }} size={22} />
          <Text style={styles.payoutMethodText}>{methodTitle}</Text>
        </View>
        <Text style={styles.payoutDescription}>
          {method ? `${method.accountName}. ` : ''}{t('payoutDescription')}
        </Text>
      </View>
      <Pressable onPress={() => router.push('/pro/edit-profile' as Href)} style={({ pressed }) => [styles.changePayout, pressed && styles.pressed]}><Text style={styles.changePayoutLabel}>{method ? t('changePayout') : t('addPayout')}</Text></Pressable>
      <Text style={styles.sectionEyebrow}>{t('payoutHistoryEyebrow')}</Text>
      <View style={[proSharedStyles.card, styles.payoutList]}>
        {loading ? <View style={styles.payoutRow}><ActivityIndicator color={professionalPalette.olive} /></View> : null}
        {!loading && error ? <View style={styles.payoutRow}><Text style={styles.paid}>{error}</Text></View> : null}
        {!loading && !error && !payouts.length ? <View style={styles.payoutRow}><Text style={styles.paid}>{t('noPayouts')}</Text></View> : null}
        {payouts.map((payout, index) => (
          <View key={payout.id} style={[styles.payoutRow, index < payouts.length - 1 && styles.rowBorder]}>
            <View style={styles.payoutRowCopy}>
              <Text style={styles.payoutWeek}>{payoutLabel(payout, t)}</Text>
              <Text style={styles.paid}>
                {payout.status === 'paid'
                  ? `${t('payoutPaid')}${payout.paidReference ? t('payoutRef', { reference: payout.paidReference }) : ''}`
                  : payout.status === 'queued' ? t('payoutQueued') : t('payoutFailed')}
              </Text>
            </View>
            <Text style={styles.payoutAmount}>ETB {payout.amount.toLocaleString()}</Text>
          </View>
        ))}
      </View>
    </DetailShell>
  );
}

function payoutLabel(payout: { createdAt: string; bookingCount: number }, t: Translate): string {
  const date = new Date(payout.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${date} · ${payout.bookingCount} ${payout.bookingCount === 1 ? t('visitOne') : t('visitMany')}`;
}

export function ProfessionalHelpScreen() {
  const { t } = useProfessionalCopy();
  const professionalFaq: readonly (readonly [string, string])[] = [
    [t('faq1Q'), t('faq1A')],
    [t('faq2Q'), t('faq2A')],
    [t('faq3Q'), t('faq3A')],
  ];
  const reportSafetyIssue = () => { void openSupportEmail(t('safetyEmailSubject'), t('safetyEmailBody')); };
  return (
    <DetailShell title={t('helpTitle')}>
      <View style={styles.emergencyCard}><KonjoIcon color={professionalPalette.danger} name={{ ios: 'exclamationmark.triangle', android: 'warning_amber', web: 'warning_amber' }} size={25} /><View style={styles.emergencyCopy}><Text style={styles.emergencyTitle}>{t('emergencyTitle')}</Text><Text style={styles.emergencyText}>{t('emergencyText')}</Text></View></View>
      <View style={[proSharedStyles.card, styles.supportList]}>
        {supportPhone ? <SupportRow icon="phone" label={t('callSupport', { phone: supportPhone })} onPress={() => { void openSupportPhone(); }} /> : null}
        <SupportRow icon="chat" label={t('emailSupport', { email: supportEmail })} onPress={() => { void openSupportEmail(t('supportEmailSubject')); }} />
        <SupportRow icon="warning" label={t('reportSafety')} last onPress={reportSafetyIssue} />
      </View>
      <Text style={styles.sectionEyebrow}>{t('faqEyebrow')}</Text>
      <View style={[proSharedStyles.card, styles.faqList]}>{professionalFaq.map(([question, answer], index, list) => <View key={question} style={[styles.faqRow, index < list.length - 1 && styles.rowBorder]}><Text style={styles.faqText}>{question}</Text><Text style={styles.faqAnswer}>{answer}</Text></View>)}</View>
    </DetailShell>
  );
}

function SupportRow({ icon, label, onPress, last = false }: { icon: 'phone' | 'chat' | 'warning'; label: string; onPress: () => void; last?: boolean }) {
  const icons = { phone: { ios: 'phone', android: 'call', web: 'call' }, chat: { ios: 'message', android: 'chat_bubble_outline', web: 'chat_bubble_outline' }, warning: { ios: 'exclamationmark.triangle', android: 'warning_amber', web: 'warning_amber' } } as const;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.supportRow, !last && styles.rowBorder, pressed && styles.pressed]}><KonjoIcon color={professionalPalette.olive} name={icons[icon]} size={20} /><Text style={styles.supportLabel}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  intro: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, marginHorizontal: spacing.lg, marginTop: 16 },
  ratingsCard: { marginHorizontal: spacing.lg, marginTop: 12, padding: 18 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  scoreEyebrow: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11, letterSpacing: 0.4 },
  score: { color: professionalPalette.text, fontFamily: fontFamilies.display.regular, fontSize: 37, marginTop: 2 },
  scoreOutOf: { color: professionalPalette.textMuted, fontSize: 16 },
  stars: { color: professionalPalette.gold, fontSize: 15, marginTop: 2 },
  scoreBadges: { alignItems: 'flex-end', gap: 6 },
  verifiedBadge: { color: professionalPalette.olive, fontFamily: fontFamilies.body.bold, fontSize: 11, borderRadius: 99, backgroundColor: professionalPalette.greenSoft, paddingHorizontal: 10, paddingVertical: 5 },
  repeatBadge: { color: professionalPalette.goldText, fontFamily: fontFamilies.body.bold, fontSize: 11, borderRadius: 99, backgroundColor: professionalPalette.goldSoft, paddingHorizontal: 10, paddingVertical: 5 },
  breakdown: { gap: 12, marginTop: 20 },
  breakdownLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  breakdownLabel: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5 },
  breakdownPercent: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 12.5 },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: professionalPalette.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3, backgroundColor: professionalPalette.olive },
  sectionEyebrow: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.bold, fontSize: 12, letterSpacing: 0.45, marginHorizontal: spacing.lg, marginTop: 22, marginBottom: 10 },
  reviewStack: { gap: 12, paddingHorizontal: spacing.lg },
  reviewCard: { paddingHorizontal: 16, paddingVertical: 14 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  reviewName: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  reviewZone: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11.5, marginTop: 1 },
  reviewRight: { alignItems: 'flex-end' },
  reviewRating: { color: professionalPalette.gold, fontFamily: fontFamilies.body.bold, fontSize: 11.5 },
  reviewTime: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 10.5, marginTop: 2 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: { color: professionalPalette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 10.5, borderRadius: 99, backgroundColor: professionalPalette.greenSoft, paddingHorizontal: 9, paddingVertical: 4 },
  reviewText: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13, lineHeight: 20, marginTop: 10 },
  serviceStack: { gap: 12, paddingHorizontal: spacing.lg, paddingTop: 16 },
  serviceCard: { padding: 16 },
  serviceTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  serviceMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryBadge: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.semibold, fontSize: 11, borderRadius: 99, backgroundColor: professionalPalette.surfaceMuted, paddingHorizontal: 10, paddingVertical: 5 },
  popular: { color: professionalPalette.gold, fontFamily: fontFamilies.body.semibold, fontSize: 11 },
  deleteButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: professionalPalette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  serviceName: { color: professionalPalette.text, fontFamily: fontFamilies.display.regular, fontSize: 21, marginTop: 8 },
  serviceStats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  serviceStat: { flex: 1, borderRadius: 8, backgroundColor: professionalPalette.surfaceMuted, padding: 12 },
  serviceStatLabel: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 10.5 },
  serviceStatValue: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 15, marginTop: 3 },
  servicePrice: { color: professionalPalette.gold, fontFamily: fontFamilies.body.bold, fontSize: 16, marginTop: 3 },
  editPriceLabel: { color: professionalPalette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 11.5, marginTop: 4 },
  priceBackdrop: { flex: 1, backgroundColor: 'rgba(14, 21, 15, 0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  priceCard: { width: '100%', maxWidth: 420, borderRadius: 16, backgroundColor: professionalPalette.canvas, padding: spacing.lg },
  priceTitle: { color: professionalPalette.text, fontFamily: fontFamilies.display.medium, fontSize: 20 },
  priceBody: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13, lineHeight: 19, marginTop: 6 },
  priceInput: { minHeight: 50, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 10, backgroundColor: professionalPalette.white, color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 18, paddingHorizontal: 14, marginTop: 14 },
  priceInputInvalid: { borderColor: professionalPalette.danger },
  priceHint: { color: professionalPalette.danger, fontFamily: fontFamilies.body.regular, fontSize: 12, marginTop: 6 },
  priceActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 18 },
  priceCancel: { paddingHorizontal: 14, paddingVertical: 10 },
  priceCancelLabel: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  priceSave: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10, backgroundColor: professionalPalette.olive },
  priceSaveDisabled: { opacity: 0.5 },
  priceSaveLabel: { color: professionalPalette.white, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  serviceNote: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  dashedButton: { minHeight: 54, flexDirection: 'row', gap: 9, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C5C8BC', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginHorizontal: spacing.lg, marginTop: 14, paddingHorizontal: 16 },
  dashedButtonLabel: { color: professionalPalette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 13.5, textAlign: 'center' },
  infoBanner: { borderRadius: 10, backgroundColor: professionalPalette.greenSoft, marginHorizontal: spacing.lg, marginTop: 18, padding: 16 },
  infoText: { color: '#33422D', fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 18 },
  settingsCard: { overflow: 'hidden', marginHorizontal: spacing.lg },
  workingRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: professionalPalette.surfaceMuted },
  workingDay: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  workingHours: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, marginTop: 2 },
  zoneIntro: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 19, marginHorizontal: spacing.lg },
  zoneChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: spacing.lg, marginTop: 14 },
  zoneChip: { minHeight: 42, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 99, backgroundColor: professionalPalette.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  zoneChipActive: { borderColor: professionalPalette.text, backgroundColor: professionalPalette.text },
  zoneChipLabel: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.semibold, fontSize: 12.5 },
  zoneChipLabelActive: { color: professionalPalette.white },
  sameDayCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: spacing.lg, padding: 16 },
  sameDayCopy: { flex: 1 },
  sameDayTitle: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  sameDayDescription: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 17, marginTop: 2 },
  documentsBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 10, backgroundColor: professionalPalette.greenSoft, marginHorizontal: spacing.lg, marginTop: 16, padding: 16 },
  documentsBannerText: { flex: 1, color: '#33422D', fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 19 },
  verificationList: { overflow: 'hidden', marginHorizontal: spacing.lg, marginTop: 16 },
  verificationRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  verificationLabel: { flex: 1, color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  documentLoader: { marginTop: 20 },
  documentList: { overflow: 'hidden', marginHorizontal: spacing.lg, marginTop: 16 },
  documentRow: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  documentIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: professionalPalette.greenSoft, alignItems: 'center', justifyContent: 'center' },
  documentCopy: { flex: 1, minWidth: 0 },
  documentName: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 12.5 },
  documentDate: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 10.5, marginTop: 3 },
  documentActions: { alignItems: 'flex-end', gap: 10 },
  documentStatus: { overflow: 'hidden', borderRadius: 99, fontFamily: fontFamilies.body.bold, fontSize: 9.5, textTransform: 'capitalize', paddingHorizontal: 8, paddingVertical: 4 },
  documentApproved: { color: professionalPalette.olive, backgroundColor: professionalPalette.greenSoft },
  documentPending: { color: professionalPalette.goldText, backgroundColor: professionalPalette.goldSoft },
  documentRejected: { color: professionalPalette.danger, backgroundColor: '#FDECE9' },
  rejectionReason: { color: professionalPalette.danger, fontFamily: fontFamilies.body.regular, fontSize: 10.5, lineHeight: 15, marginTop: 4 },
  documentError: { borderRadius: 10, backgroundColor: '#FDECE9', marginHorizontal: spacing.lg, marginTop: 14, padding: 14 },
  documentErrorText: { color: professionalPalette.danger, fontFamily: fontFamilies.body.medium, fontSize: 12, lineHeight: 18 },
  documentErrorDismiss: { color: professionalPalette.danger, fontFamily: fontFamilies.body.bold, fontSize: 11, marginTop: 5 },
  privacyText: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 18, marginHorizontal: spacing.lg, marginTop: 18 },
  payoutHero: { borderRadius: 14, backgroundColor: professionalPalette.text, marginHorizontal: spacing.lg, marginTop: 16, padding: 20 },
  payoutHeroLabel: { color: 'rgba(255,255,255,0.60)', fontFamily: fontFamilies.body.regular, fontSize: 11.5 },
  payoutMethod: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  payoutMethodText: { color: professionalPalette.white, fontFamily: fontFamilies.display.regular, fontSize: 23 },
  payoutDescription: { color: 'rgba(255,255,255,0.60)', fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 18, marginTop: 12 },
  changePayout: { minHeight: 52, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 10, backgroundColor: professionalPalette.white, alignItems: 'center', justifyContent: 'center', marginHorizontal: spacing.lg, marginTop: 14 },
  changePayoutLabel: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  payoutList: { overflow: 'hidden', marginHorizontal: spacing.lg },
  payoutRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  payoutRowCopy: { flex: 1 },
  payoutWeek: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  paid: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11.5, marginTop: 2 },
  payoutAmount: { color: professionalPalette.text, fontFamily: fontFamilies.body.bold, fontSize: 14.5 },
  emergencyCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1.5, borderColor: professionalPalette.danger, borderRadius: 12, marginHorizontal: spacing.lg, marginTop: 16, padding: 16 },
  emergencyCopy: { flex: 1 },
  emergencyTitle: { color: professionalPalette.danger, fontFamily: fontFamilies.body.bold, fontSize: 14 },
  emergencyText: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 17, marginTop: 2 },
  supportList: { overflow: 'hidden', marginHorizontal: spacing.lg, marginTop: 16 },
  supportRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16 },
  supportLabel: { color: professionalPalette.text, fontFamily: fontFamilies.body.medium, fontSize: 14 },
  faqList: { overflow: 'hidden', marginHorizontal: spacing.lg },
  faqRow: { minHeight: 60, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  faqAnswer: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  faqText: { color: professionalPalette.text, fontFamily: fontFamilies.body.medium, fontSize: 13.5, lineHeight: 20 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.55 },
});
