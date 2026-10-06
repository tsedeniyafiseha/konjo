import { recordLegalAcceptance } from '@/features/support/legal-acceptance';
import { LegalConsentSheet } from '@/features/support/legal-consent-sheet';
import { legalLabels } from '@/features/support/legal-content';
import { LegalLinks } from '@/features/support/legal-links';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KonjoButton } from '@/components/ui/konjo-button';
import { KonjoIcon } from '@/components/ui/konjo-icon';
import { ProfessionalSwitch } from '@/features/professional/professional-components';
import { useAuthSession } from '@/features/auth/session-context';
import { useProfessionalDocuments } from '@/features/professional/documents/professional-document-context';
import { PORTFOLIO_MINIMUM, professionalPortfolioCopy } from './professional-portfolio-copy';
import {
  ChoiceChip,
  MissingFieldList,
  OnboardingCard,
  OnboardingIntro,
  OnboardingScreen,
  onboardingStyles,
} from './professional-onboarding-components';
import { professionalOnboardingCopy } from './professional-onboarding-copy';
import {
  localizedEducationLevelName,
  localizedLanguageProficiencyName,
  localizedSpecialtyName,
  localizedSpokenLanguageName,
} from './professional-onboarding-labels';
import { useProfessionalRegistration } from './professional-registration-context';
import { ProfessionalRegistrationError } from './professional-registration-service';
import {
  isAvailabilityComplete,
  isProfessionalRegistrationComplete,
  isServicesComplete,
} from './professional-registration-types';
import { fontFamilies, professionalPalette, radii, spacing } from '@/theme/tokens';

export function ProfessionalServicesOnboardingScreen() {
  const { draft, updateService } = useProfessionalRegistration();
  const [showErrors, setShowErrors] = useState(false);
  const language = draft.preferredLanguage ?? 'en';
  const copy = professionalOnboardingCopy[language];
  const complete = isServicesComplete(draft.services);
  const next = () => {
    setShowErrors(true);
    if (!complete) return;
    router.push('/pro/onboarding/availability' as Href);
  };

  return (
    <OnboardingScreen currentStep={5} fallback={'/pro/onboarding/portfolio' as Href}>
      <StatusBar style="dark" />
      <OnboardingIntro
        body={copy.servicesBody}
        eyebrow={copy.servicesEyebrow}
        title={copy.servicesTitle}
      />
      <View style={styles.serviceStack}>
        {draft.services.map((service) => (
          <OnboardingCard key={service.id}>
            <View style={styles.serviceHeader}>
              <Text style={styles.categoryBadge}>{localizedSpecialtyName(draft.profile.specialty, language)}</Text>
            </View>
            <View style={styles.serviceControls}>
              <View style={styles.serviceControl}>
                <Text style={styles.controlLabel}>{copy.duration}</Text>
                <View style={styles.stepperRow}>
                  <Pressable accessibilityLabel={copy.reduceDuration} accessibilityRole="button" onPress={() => updateService(service.id, { durationMinutes: Math.max(30, service.durationMinutes - 30) })} style={styles.stepperButton}><Text style={styles.stepperSymbol}>−</Text></Pressable>
                  <Text style={styles.durationValue}>{service.durationMinutes} {copy.minutes}</Text>
                  <Pressable accessibilityLabel={copy.increaseDuration} accessibilityRole="button" onPress={() => updateService(service.id, { durationMinutes: Math.min(480, service.durationMinutes + 30) })} style={styles.stepperButton}><Text style={styles.stepperSymbol}>+</Text></Pressable>
                </View>
              </View>
              <View style={styles.serviceControl}>
                <Text style={styles.controlLabel}>{copy.price}</Text>
                <TextInput
                  accessibilityLabel={copy.servicePriceAccessibility.replace('{service}', service.name || copy.serviceFallback)}
                  inputMode="numeric"
                  keyboardType="number-pad"
                  onChangeText={(value) => updateService(service.id, { price: Number(value.replace(/\D/g, '')) || 0 })}
                  style={[styles.priceInput, showErrors && service.price <= 0 && styles.serviceNameError]}
                  value={service.price ? String(service.price) : ''}
                />
                {showErrors && service.price <= 0 ? (
                  <Text accessibilityLiveRegion="polite" style={styles.fieldError}>{copy.servicePriceRequired}</Text>
                ) : null}
              </View>
            </View>
            <TextInput
              accessibilityLabel={copy.serviceNotesAccessibility.replace('{service}', service.name || copy.serviceFallback)}
              onChangeText={(note) => updateService(service.id, { note })}
              placeholder={copy.included}
              placeholderTextColor={professionalPalette.textMuted}
              style={styles.noteInput}
              value={service.note}
            />
          </OnboardingCard>
        ))}
      </View>
      <View style={styles.infoCard}>
        <KonjoIcon color={professionalPalette.olive} name={{ ios: 'info.circle', android: 'info_outline', web: 'info_outline' }} size={20} />
        <Text style={styles.infoText}>{copy.travelFeeInfo}</Text>
      </View>
      <View style={onboardingStyles.footer}>
        <KonjoButton label={copy.continueAvailability} onPress={next} trailingLabel="→" variant="dark" />
      </View>
    </OnboardingScreen>
  );
}

export function ProfessionalAvailabilityOnboardingScreen() {
  const { draft, toggleSameDayBookings, toggleTravelZone } = useProfessionalRegistration();
  const [showErrors, setShowErrors] = useState(false);
  const language = draft.preferredLanguage ?? 'en';
  const copy = professionalOnboardingCopy[language];
  const complete = isAvailabilityComplete(draft);
  const selectedZoneCount = draft.travelZones.filter((zone) => zone.active).length;
  const issues = showErrors ? [
    selectedZoneCount === 0 && copy.fieldTravelZone,
  ].filter((issue): issue is string => typeof issue === 'string') : [];
  const next = () => {
    setShowErrors(true);
    if (!complete) return;
    router.push('/pro/onboarding/review' as Href);
  };

  return (
    <OnboardingScreen currentStep={6} fallback={'/pro/onboarding/services' as Href}>
      <StatusBar style="dark" />
      <OnboardingIntro
        body={copy.availabilityBody}
        eyebrow={copy.availabilityEyebrow}
        title={copy.availabilityTitle}
      />

      <Text style={styles.sectionTitle}>{copy.travelZones}</Text>
      <Text style={styles.sectionBody}>{copy.travelZonesBody}</Text>
      <View accessibilityLabel={copy.mapAccessibility} style={styles.mapCard}>
        <View style={[styles.mapRoad, styles.mapRoadOne]} /><View style={[styles.mapRoad, styles.mapRoadTwo]} /><View style={[styles.mapRoad, styles.mapRoadThree]} />
        {draft.travelZones.filter((zone) => zone.active).slice(0, 3).map((zone, index) => <View key={zone.id} style={[styles.mapPin, { left: `${24 + index * 25}%`, top: `${36 + (index % 2) * 24}%` }]}><View style={styles.mapPinDot} /><Text style={styles.mapPinLabel}>{zone.label}</Text></View>)}
        <View style={styles.mapCaption}><View style={styles.mapCaptionDot} /><Text style={styles.mapCaptionText}>{copy.mapCaption}</Text></View>
      </View>
      <View style={styles.zoneGrid}>
        {draft.travelZones.map((zone) => <ChoiceChip key={zone.id} label={zone.label} onPress={() => toggleTravelZone(zone.id)} selected={zone.active} />)}
      </View>
      <View style={styles.infoCard}><KonjoIcon color={professionalPalette.olive} name={{ ios: 'info.circle', android: 'info_outline', web: 'info_outline' }} size={20} /><Text style={styles.infoText}>{selectedZoneCount} {copy.zonesSelected}</Text></View>

      <Text style={[styles.sectionTitle, styles.zonesTitle]}>{copy.bookingPreference}</Text>
      <OnboardingCard>
        <View style={styles.preferenceRow}><View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>{copy.sameDay}</Text><Text style={styles.preferenceBody}>{copy.sameDayHelp}</Text></View><ProfessionalSwitch label={copy.sameDay} onChange={toggleSameDayBookings} value={draft.sameDayBookings} /></View>
      </OnboardingCard>
      <MissingFieldList issues={issues} title={copy.missingFields} />
      <View style={onboardingStyles.footer}><KonjoButton label={copy.reviewApplication} onPress={next} trailingLabel="→" variant="dark" /></View>
    </OnboardingScreen>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

export function ProfessionalReviewOnboardingScreen() {
  const { draft, setTermsAccepted, submit } = useProfessionalRegistration();
  const { documents } = useProfessionalDocuments();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const language = draft.preferredLanguage ?? 'en';
  const copy = professionalOnboardingCopy[language];
  const portfolioCopy = professionalPortfolioCopy[language];
  const activeDocuments = documents.filter((document) => document.status !== 'rejected');
  const portfolioCount = activeDocuments.filter((document) => document.kind === 'portfolio').length;
  const evidenceComplete = (['national_id_front', 'national_id_back', 'government_id'] as const)
    .every((kind) => activeDocuments.some((document) => document.kind === kind)) &&
    portfolioCount >= PORTFOLIO_MINIMUM &&
    activeDocuments.some((document) => document.kind === 'certificate' && document.credentialType !== 'course');
  const complete = evidenceComplete && isProfessionalRegistrationComplete({ ...draft, termsAccepted: true });
  const activeZones = draft.travelZones.filter((zone) => zone.active).map((zone) => zone.label).join(', ');
  const identitySubmitted = language === 'am'
    ? 'የማንነት ሰነዶች ተልከዋል'
    : language === 'om' ? 'Galmeewwan eenyummaa ergamaniiru' : 'Identity documents submitted';

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!evidenceComplete) {
      setError(portfolioCopy.reviewMissing);
      return;
    }
    if (!complete || !draft.termsAccepted) {
      setError(copy.reviewError);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await submit();
      // The professional layout redirects the now-pending application.
      // Avoid competing navigation actions when the registration state changes.
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '';
      // The screen shows a friendly line; the console keeps the real reason for debugging.
      if (__DEV__) console.error('Unable to submit the professional application.', submitError);
      const friendly = /portfolio|national ID/i.test(message)
        ? portfolioCopy.reviewMissing
        : language === 'en' && submitError instanceof ProfessionalRegistrationError ? submitError.message : copy.submissionError;
      // Development builds append the underlying reason so testers can report it.
      setError(__DEV__ && message && friendly !== message ? `${friendly}\n(${message})` : friendly);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <OnboardingScreen currentStep={7} fallback={'/pro/onboarding/availability' as Href}>
      <StatusBar style="dark" />
      <OnboardingIntro body={copy.readyBody} eyebrow={copy.finalReview} title={copy.readyTitle} />
      <OnboardingCard>
        <View style={styles.reviewIdentity}><View style={styles.initials}><Text style={styles.initialsText}>{draft.profile.displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Text></View><View style={styles.reviewIdentityCopy}><Text style={styles.reviewName}>{draft.profile.displayName}</Text><Text style={styles.reviewSpecialty}>{localizedSpecialtyName(draft.profile.specialty, language)}</Text><View style={styles.verifiedRow}><KonjoIcon color={professionalPalette.olive} name={{ ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' }} size={15} /><Text style={styles.verifiedText}>{identitySubmitted}</Text></View></View></View>
        <View style={styles.summaryDivider} />
        <SummaryRow label={copy.experience} value={`${draft.profile.yearsExperience} ${copy.yearsUnit}`} />
        <SummaryRow label={copy.education} value={draft.profile.educationLevel ? localizedEducationLevelName(draft.profile.educationLevel, language) : '—'} />
        <SummaryRow label={copy.baseZone} value={draft.profile.baseZone} />
        <SummaryRow label={copy.languages} value={draft.profile.languageSkills.map((skill) => `${localizedSpokenLanguageName(skill.language, language)} — ${localizedLanguageProficiencyName(skill.proficiency, language)}`).join(', ')} />
        <SummaryRow label={copy.services} value={`${draft.services.length} ${copy.listed}`} />
        <SummaryRow label={portfolioCopy.step} value={String(portfolioCount)} />
        <SummaryRow label={copy.zones} value={activeZones} />
      </OnboardingCard>
      <Pressable accessibilityRole="button" accessibilityState={{ checked: draft.termsAccepted }} onPress={() => setConsentOpen(true)} style={styles.termsRow}>
        <View style={[styles.checkbox, draft.termsAccepted && styles.checkboxChecked]}>{draft.termsAccepted ? <Text style={styles.checkmark}>✓</Text> : null}</View>
        <Text style={styles.termsText}>{draft.termsAccepted ? `${legalLabels[language].accepted} ${copy.agreement}` : legalLabels[language].readPrompt}</Text>
      </Pressable>
      <LegalConsentSheet language={language} onAccept={() => { setTermsAccepted(true); setConsentOpen(false); void recordLegalAcceptance(); }} onClose={() => setConsentOpen(false)} visible={consentOpen} />
      <LegalLinks align="left" color={professionalPalette.olive} language={language} />
      <View style={styles.reviewNotice}><KonjoIcon color={professionalPalette.goldText} name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} size={20} /><Text style={styles.reviewNoticeText}>{copy.approvalNotice}</Text></View>
      {error ? <Text accessibilityLiveRegion="polite" style={onboardingStyles.error}>{error}</Text> : null}
      {!evidenceComplete ? <Text style={onboardingStyles.error}>{portfolioCopy.reviewMissing}</Text> : null}
      <View style={onboardingStyles.footer}><KonjoButton disabled={!complete || !draft.termsAccepted} label={copy.submit} loading={isSubmitting} onPress={handleSubmit} trailingLabel="→" variant="dark" /></View>
    </OnboardingScreen>
  );
}

/** How often the pending screen asks the server whether the admin has decided. */
const PENDING_REVIEW_POLL_MS = 15_000;

export function ProfessionalPendingScreen() {
  const { application, refreshApplication } = useProfessionalRegistration();
  const { signOut } = useAuthSession();
  const awaitingDecision = application?.status === 'pending';

  // Approval is decided by an administrator elsewhere. Poll while the decision is
  // pending and whenever the app returns to the foreground, so an approved
  // professional is moved into the app without having to tap anything; the
  // layout redirects to the dashboard as soon as the status becomes approved.
  useEffect(() => {
    if (!awaitingDecision) return;
    let active = true;
    const check = () => { void refreshApplication().catch(() => undefined); };
    const timer = setInterval(() => { if (active) check(); }, PENDING_REVIEW_POLL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (active && state === 'active') check();
    });
    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, [awaitingDecision, refreshApplication]);

  if (!application) return null;
  const language = application.preferredLanguage ?? 'en';
  const copy = professionalOnboardingCopy[language];
  const blockedTitle = application.status === 'pending'
    ? copy.underReview
    : application.status === 'rejected'
    ? copy.applicationRejectedTitle
    : application.status === 'changes_requested'
    ? copy.statusChangesRequested
    : application.status === 'suspended'
      ? copy.accountSuspendedTitle
      : copy.pendingTitle;
  const blockedBody = application.status === 'pending'
    ? copy.reviewAccessNotice
    : application.status === 'rejected' || application.status === 'changes_requested'
    ? copy.applicationRejectedBody
    : application.status === 'suspended'
      ? copy.accountSuspendedBody
      : copy.reviewAccessNotice;
  const logout = async () => {
    await signOut();
    router.replace('/welcome' as Href);
  };
  const portfolioCopy = professionalPortfolioCopy[language];
  const canResubmit = application.status === 'rejected' || application.status === 'changes_requested';

  return (
    <View style={styles.pendingScreen}>
      <StatusBar style="dark" />
      <View style={styles.pendingContent}>
        <View style={styles.pendingIcon}><KonjoIcon color={professionalPalette.olive} name={{ ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' }} size={42} /></View>
        <Text accessibilityRole="header" style={styles.pendingTitle}>{blockedTitle}</Text>
        <Text style={styles.pendingBody}>{blockedBody}</Text>
        {canResubmit && application.reviewNote ? (
          <View style={styles.reviewNoteCard}>
            <Text style={styles.reviewNoteLabel}>{portfolioCopy.reviewNote}</Text>
            <Text style={styles.reviewNoteText}>{application.reviewNote}</Text>
          </View>
        ) : null}
        {canResubmit ? (
          <KonjoButton label={portfolioCopy.resubmit} onPress={() => router.replace('/pro/onboarding/profile' as Href)} variant="dark" />
        ) : null}
        <Pressable accessibilityRole="button" onPress={logout} style={styles.signOutButton}><Text style={styles.signOutText}>{copy.signOut}</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  serviceStack: { gap: spacing.sm },
  serviceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  categoryBadge: { alignSelf: 'flex-start', color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.medium, fontSize: 10.5, borderRadius: radii.pill, backgroundColor: professionalPalette.greenSoft, paddingHorizontal: 9, paddingVertical: 4 },
  fieldMiniLabel: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.medium, fontSize: 10.5, marginTop: 8, marginBottom: 6 },
  serviceNameInput: { minHeight: 42, color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 17, borderBottomWidth: 1, borderBottomColor: 'transparent', paddingVertical: 6 },
  serviceNameError: { borderColor: professionalPalette.danger },
  fieldError: { color: professionalPalette.danger, fontFamily: fontFamilies.body.medium, fontSize: 11, marginTop: 4 },
  serviceControls: { flexDirection: 'row', gap: 8, marginTop: 9 },
  serviceControl: { flex: 1, minHeight: 78, borderRadius: radii.sm, backgroundColor: professionalPalette.greenSoft, padding: 10 },
  controlLabel: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 10.5 },
  stepperRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: professionalPalette.white, alignItems: 'center', justifyContent: 'center' },
  stepperSymbol: { color: professionalPalette.olive, fontFamily: fontFamilies.body.medium, fontSize: 19 },
  durationValue: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 12.5 },
  priceInput: { flex: 1, color: professionalPalette.goldText, fontFamily: fontFamilies.body.bold, fontSize: 21, paddingVertical: 2 },
  noteInput: { minHeight: 42, borderRadius: radii.sm, backgroundColor: professionalPalette.surfaceMuted, color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 11.5, paddingHorizontal: 11, marginTop: 10 },
  addService: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radii.md, backgroundColor: professionalPalette.greenSoft, marginTop: spacing.sm },
  addServiceText: { color: professionalPalette.text, fontFamily: fontFamilies.body.medium, fontSize: 13 },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radii.md, backgroundColor: professionalPalette.greenSoft, padding: spacing.md, marginTop: spacing.lg },
  infoText: { flex: 1, color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 19 },
  sectionTitle: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 18, marginBottom: 4 },
  sectionBody: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13, lineHeight: 19, marginBottom: 10 },
  scheduleCard: { paddingVertical: 0 },
  dayRow: { minHeight: 67, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: professionalPalette.border },
  dayCopy: { flex: 1 },
  dayName: { color: professionalPalette.text, fontFamily: fontFamilies.body.medium, fontSize: 13.5 },
  dayHours: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, marginTop: 2 },
  dayHoursDisabled: { color: professionalPalette.textMuted },
  zonesTitle: { marginTop: spacing.xl },
  mapCard: { position: 'relative', overflow: 'hidden', height: 188, borderRadius: radii.md, backgroundColor: '#E5EFE9', marginBottom: 10 },
  mapRoad: { position: 'absolute', height: 9, borderRadius: 5, backgroundColor: professionalPalette.white, opacity: 0.9 },
  mapRoadOne: { width: '130%', top: 54, left: -30, transform: [{ rotate: '-13deg' }] },
  mapRoadTwo: { width: '120%', top: 112, left: -22, transform: [{ rotate: '15deg' }] },
  mapRoadThree: { width: '90%', top: 93, left: 20, transform: [{ rotate: '-38deg' }] },
  mapPin: { position: 'absolute', alignItems: 'center' },
  mapPinDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: professionalPalette.white, backgroundColor: professionalPalette.olive },
  mapPinLabel: { color: professionalPalette.text, fontFamily: fontFamilies.body.bold, fontSize: 9, marginTop: 2 },
  mapCaption: { position: 'absolute', left: 12, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: radii.pill, backgroundColor: 'rgba(255,255,255,0.94)', paddingHorizontal: 11, paddingVertical: 7 },
  mapCaptionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F7B548' },
  mapCaptionText: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.medium, fontSize: 10.5 },
  zoneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preferenceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preferenceCopy: { flex: 1 },
  preferenceTitle: { color: professionalPalette.text, fontFamily: fontFamilies.body.medium, fontSize: 14 },
  preferenceBody: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 17, marginTop: 2 },
  reviewIdentity: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  initials: { width: 58, height: 58, borderRadius: 16, backgroundColor: professionalPalette.olive, alignItems: 'center', justifyContent: 'center' },
  initialsText: { color: professionalPalette.white, fontFamily: fontFamilies.body.bold, fontSize: 19 },
  reviewIdentityCopy: { flex: 1 },
  reviewName: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 18 },
  reviewSpecialty: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, marginTop: 2 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  verifiedText: { color: professionalPalette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 10.5 },
  summaryDivider: { height: StyleSheet.hairlineWidth, backgroundColor: professionalPalette.border, marginVertical: spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 15, paddingVertical: 8 },
  summaryLabel: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 12.5 },
  summaryValue: { flex: 1, color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 12.5, textAlign: 'right' },
  termsRow: { minHeight: 48, flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: spacing.lg },
  checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 6, backgroundColor: professionalPalette.white, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { borderColor: professionalPalette.olive, backgroundColor: professionalPalette.olive },
  checkmark: { color: professionalPalette.white, fontFamily: fontFamilies.body.bold, fontSize: 14 },
  termsText: { flex: 1, color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 19 },
  reviewNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radii.md, backgroundColor: professionalPalette.goldSoft, padding: 13, marginTop: spacing.md },
  reviewNoticeText: { flex: 1, color: professionalPalette.goldText, fontFamily: fontFamilies.body.medium, fontSize: 12, lineHeight: 18 },
  pendingScreen: { flex: 1, backgroundColor: professionalPalette.canvas, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  pendingContent: { width: '100%', maxWidth: 480, alignSelf: 'center', alignItems: 'center' },
  pendingIcon: { width: 82, height: 82, borderRadius: 41, backgroundColor: professionalPalette.greenSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
  pendingTitle: { color: professionalPalette.text, fontFamily: fontFamilies.display.medium, fontSize: 31, textAlign: 'center' },
  reviewNoteCard: { alignSelf: 'stretch', borderRadius: radii.md, backgroundColor: professionalPalette.goldSoft, padding: spacing.md, gap: 4 },
  reviewNoteLabel: { color: professionalPalette.goldText, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  reviewNoteText: { color: professionalPalette.text, fontFamily: fontFamilies.body.regular, fontSize: 14, lineHeight: 20 },
  pendingBody: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 8, marginBottom: spacing.lg },
  signOutButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 20, marginTop: spacing.sm },
  signOutText: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  pressed: { opacity: 0.72 },
});
