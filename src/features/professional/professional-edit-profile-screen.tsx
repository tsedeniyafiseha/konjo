import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { KonjoButton } from '@/components/ui/konjo-button';
import { KonjoIcon } from '@/components/ui/konjo-icon';
import {
  ProfessionalBackHeader,
  ProfessionalDetailScreen,
  ProfessionalSwitch,
  proSharedStyles,
} from '@/features/professional/professional-components';
import { ChoiceChip, onboardingStyles } from '@/features/professional/registration/professional-onboarding-components';
import { useProfessionalRegistration } from '@/features/professional/registration/professional-registration-context';
import {
  isPayoutMethodComplete,
  type ProfessionalPayoutMethodDraft,
  professionalEducationLevels,
  professionalGenders,
  professionalLanguageProficiencies,
  professionalSpokenLanguages,
  serviceCategoryForSpecialty,
  type ProfessionalLanguageProficiency,
  type ProfessionalRegistrationDraft,
  type ProfessionalServiceDraft,
  type ProfessionalSpokenLanguage,
} from '@/features/professional/registration/professional-registration-types';
import {
  localizedEducationLevelName,
  localizedLanguageProficiencyName,
  localizedSpecialtyName,
  localizedSpokenLanguageName,
} from '@/features/professional/registration/professional-onboarding-labels';
import { useProfessionalCopy } from '@/localization/use-professional-copy';
import { fontFamilies, professionalPalette, radii, spacing } from '@/theme/tokens';
import { payoutMethodTypes } from '../../../shared/payout-method';

let serviceSequence = 0;

function Section({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionEyebrow}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      <View style={[proSharedStyles.card, styles.sectionCard]}>{children}</View>
    </View>
  );
}

/** Approved professionals edit everything except the specialty they were approved for. */
export function ProfessionalEditProfileScreen() {
  const { application, draft: savedDraft, saveApprovedProfile, listZones } = useProfessionalRegistration();
  const { language, t } = useProfessionalCopy();
  const [draft, setDraft] = useState<ProfessionalRegistrationDraft>(savedDraft);
  const [zones, setZones] = useState<readonly { id: string; label: string }[]>(
    savedDraft.travelZones.map((zone) => ({ id: zone.id, label: zone.label })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const profile = draft.profile;
  const specialty = profile.specialty;

  useEffect(() => {
    let active = true;
    void listZones().then((available) => {
      if (active && available.length) setZones(available);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [listZones]);

  if (application?.status !== 'approved') {
    return (
      <ProfessionalDetailScreen>
        <ProfessionalBackHeader title={t('editProfileTitle')} />
        <Text style={styles.notice}>{t('editAfterApproval')}</Text>
      </ProfessionalDetailScreen>
    );
  }

  const updateProfile = (changes: Partial<ProfessionalRegistrationDraft['profile']>) => {
    setError(null);
    setDraft((current) => ({ ...current, profile: { ...current.profile, ...changes } }));
  };
  const updateService = (id: string, changes: Partial<ProfessionalServiceDraft>) => {
    setError(null);
    setDraft((current) => ({
      ...current,
      services: current.services.map((service) => (service.id === id ? { ...service, ...changes } : service)),
    }));
  };
  const addService = () => {
    serviceSequence += 1;
    setDraft((current) => ({
      ...current,
      services: [...current.services, {
        id: `service-${Date.now()}-${serviceSequence}`,
        category: serviceCategoryForSpecialty(specialty),
        name: localizedSpecialtyName(specialty, language),
        durationMinutes: 60,
        price: 500,
        note: '',
        popular: false,
      }],
    }));
  };
  const removeService = (id: string) => setDraft((current) => ({
    ...current,
    services: current.services.filter((service) => service.id !== id),
  }));
  const toggleZone = (zone: { id: string; label: string }) => setDraft((current) => {
    const existing = current.travelZones.find((item) => item.id === zone.id);
    return {
      ...current,
      travelZones: existing
        ? current.travelZones.map((item) => (item.id === zone.id ? { ...item, active: !item.active } : item))
        : [...current.travelZones, { id: zone.id, label: zone.label, active: true }],
    };
  });
  const updatePayout = (changes: Partial<ProfessionalPayoutMethodDraft>) => updateProfile({ payoutMethod: { ...profile.payoutMethod, ...changes } });
  const toggleLanguage = (language: ProfessionalSpokenLanguage) => updateProfile({
    languageSkills: profile.languageSkills.some((skill) => skill.language === language)
      ? profile.languageSkills.filter((skill) => skill.language !== language)
      : [...profile.languageSkills, { language, proficiency: 'conversational' }],
  });
  const setLanguageProficiency = (
    language: ProfessionalSpokenLanguage,
    proficiency: ProfessionalLanguageProficiency,
  ) => updateProfile({
    languageSkills: profile.languageSkills.map((skill) => (
      skill.language === language ? { ...skill, proficiency } : skill
    )),
  });

  const validate = (): string | null => {
    if (profile.displayName.trim().length < 2) return t('vDisplayName');
    if (profile.email.trim() && !/^\S+@\S+\.\S+$/.test(profile.email.trim())) return t('vEmail');
    if (profile.bio.trim().length < 30) return t('vBio');
    const years = Number(profile.yearsExperience);
    if (!Number.isInteger(years) || years < 0 || years > 60) return t('vYears');
    if (!profile.educationLevel) return t('vEducation');
    if (!profile.gender) return t('vGender');
    if (!isPayoutMethodComplete(profile.payoutMethod)) return t('vPayout');
    if (!profile.languageSkills.length) return t('vLanguages');
    if (!profile.baseZone) return t('vBaseZone');
    if (!draft.travelZones.some((zone) => zone.active)) return t('vTravelZone');
    if (!draft.services.length) return t('vService');
    if (draft.services.some((service) => service.name.trim().length < 2 || service.price <= 0)) {
      return t('vServiceFields');
    }
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveApprovedProfile({
        ...draft,
        services: draft.services.map((service) => ({ ...service, category: serviceCategoryForSpecialty(specialty) })),
      });
      if (router.canGoBack()) router.back();
      else router.replace('/pro/profile' as Href);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProfessionalDetailScreen>
      <StatusBar style="dark" />
      <ProfessionalBackHeader title={t('editProfileTitle')} />

      <View style={[proSharedStyles.card, styles.lockedCard]}>
        <KonjoIcon color={professionalPalette.olive} name={{ ios: 'lock', android: 'lock', web: 'lock' }} size={18} />
        <View style={styles.lockedCopy}>
          <Text style={styles.lockedTitle}>{localizedSpecialtyName(specialty, language)}</Text>
          <Text style={styles.lockedBody}>{t('specialtyLocked')}</Text>
        </View>
      </View>

      <Section title={t('aboutYou')}>
        <View style={onboardingStyles.field}>
          <Text style={onboardingStyles.label}>{t('displayName')}</Text>
          <TextInput onChangeText={(displayName) => updateProfile({ displayName })} style={onboardingStyles.input} value={profile.displayName} />
        </View>
        <View style={onboardingStyles.field}>
          <Text style={onboardingStyles.label}>{t('emailOptional')}</Text>
          <TextInput autoCapitalize="none" inputMode="email" keyboardType="email-address" onChangeText={(email) => updateProfile({ email })} placeholder="you@example.com" placeholderTextColor={professionalPalette.textMuted} style={onboardingStyles.input} value={profile.email} />
        </View>
        <View style={onboardingStyles.field}>
          <Text style={onboardingStyles.label}>{t('introduction')}</Text>
          <TextInput maxLength={280} multiline onChangeText={(bio) => updateProfile({ bio })} style={[onboardingStyles.input, onboardingStyles.textArea]} value={profile.bio} />
          <Text style={styles.counter}>{profile.bio.length}/280</Text>
        </View>
        <View style={onboardingStyles.field}>
          <Text style={onboardingStyles.label}>{t('yearsExperience')}</Text>
          <TextInput inputMode="numeric" keyboardType="number-pad" maxLength={2} onChangeText={(value) => updateProfile({ yearsExperience: value.replace(/\D/g, '') })} style={onboardingStyles.input} value={profile.yearsExperience} />
        </View>
        <Text style={onboardingStyles.label}>{t('educationLevel')}</Text>
        <View style={onboardingStyles.chipWrap}>
          {professionalEducationLevels.map((educationLevel) => (
            <ChoiceChip key={educationLevel} label={localizedEducationLevelName(educationLevel, language)} onPress={() => updateProfile({ educationLevel })} selected={profile.educationLevel === educationLevel} />
          ))}
        </View>
        <Text style={[onboardingStyles.label, styles.languagesLabel]}>{t('gender')}</Text>
        <Text style={styles.counter}>{t('genderHelp')}</Text>
        <View style={onboardingStyles.chipWrap}>
          {professionalGenders.map((gender) => (
            <ChoiceChip key={gender} label={gender === 'female' ? t('genderFemale') : gender === 'male' ? t('genderMale') : t('genderUnspecified')} onPress={() => updateProfile({ gender })} selected={profile.gender === gender} />
          ))}
        </View>
        <Text style={[onboardingStyles.label, styles.languagesLabel]}>{t('howPaid')}</Text>
        <Text style={styles.counter}>{t('payoutHelp')}</Text>
        <View style={onboardingStyles.chipWrap}>
          {payoutMethodTypes.map((type) => (
            <ChoiceChip key={type} label={type === 'telebirr' ? t('telebirr') : type === 'cbe_birr' ? t('cbeBirr') : t('bankAccount')} onPress={() => updatePayout({ type })} selected={profile.payoutMethod.type === type} />
          ))}
        </View>
        {profile.payoutMethod.type ? (
          <>
            <Text style={[onboardingStyles.label, styles.languagesLabel]}>{t('accountHolder')}</Text>
            <TextInput onChangeText={(accountName) => updatePayout({ accountName })} style={onboardingStyles.input} value={profile.payoutMethod.accountName} />
            {profile.payoutMethod.type === 'bank' ? (
              <>
                <Text style={[onboardingStyles.label, styles.languagesLabel]}>{t('bankName')}</Text>
                <TextInput onChangeText={(bankName) => updatePayout({ bankName })} style={onboardingStyles.input} value={profile.payoutMethod.bankName} />
                <Text style={[onboardingStyles.label, styles.languagesLabel]}>{t('accountNumber')}</Text>
                <TextInput inputMode="numeric" keyboardType="number-pad" onChangeText={(accountNumber) => updatePayout({ accountNumber })} style={onboardingStyles.input} value={profile.payoutMethod.accountNumber} />
              </>
            ) : (
              <>
                <Text style={[onboardingStyles.label, styles.languagesLabel]}>{t('mobileNumber')}</Text>
                <TextInput inputMode="tel" keyboardType="phone-pad" onChangeText={(accountNumber) => updatePayout({ accountNumber })} placeholder="09XX XXX XXX" placeholderTextColor={professionalPalette.textMuted} style={onboardingStyles.input} value={profile.payoutMethod.accountNumber} />
              </>
            )}
          </>
        ) : null}
        <Text style={[onboardingStyles.label, styles.languagesLabel]}>{t('languagesYouSpeak')}</Text>
        <View style={onboardingStyles.chipWrap}>
          {professionalSpokenLanguages.map((spoken) => (
            <ChoiceChip key={spoken} label={localizedSpokenLanguageName(spoken, language)} onPress={() => toggleLanguage(spoken)} selected={profile.languageSkills.some((skill) => skill.language === spoken)} />
          ))}
        </View>
        {profile.languageSkills.map((skill) => (
          <View key={skill.language} style={styles.languageSkill}>
            <Text style={styles.languageSkillName}>{localizedSpokenLanguageName(skill.language, language)}</Text>
            <View style={onboardingStyles.chipWrap}>
              {professionalLanguageProficiencies.map((proficiency) => (
                <ChoiceChip key={proficiency} label={localizedLanguageProficiencyName(proficiency, language)} onPress={() => setLanguageProficiency(skill.language, proficiency)} selected={skill.proficiency === proficiency} />
              ))}
            </View>
          </View>
        ))}
      </Section>

      <Section hint={t('baseLocationHint')} title={t('baseLocation')}>
        <View style={onboardingStyles.chipWrap}>
          {zones.map((zone) => (
            <ChoiceChip key={zone.id} label={zone.label} onPress={() => updateProfile({ baseZone: zone.label })} selected={profile.baseZone.toLowerCase() === zone.label.toLowerCase()} />
          ))}
        </View>
      </Section>

      <Section hint={t('sameDayNotice')} title={t('bookingPreference')}>
        <View style={[styles.dayRow, styles.sameDayRow]}>
          <View style={styles.dayCopy}>
            <Text style={styles.dayName}>{t('sameDay')}</Text>
            <Text style={styles.dayOff}>{t('alwaysBookable')}</Text>
          </View>
          <ProfessionalSwitch label={t('sameDay')} onChange={() => setDraft((current) => ({ ...current, sameDayBookings: !current.sameDayBookings }))} value={draft.sameDayBookings} />
        </View>
      </Section>

      <Section hint={t('zonesHint')} title={t('zonesYouTravelTo')}>
        <View style={onboardingStyles.chipWrap}>
          {zones.map((zone) => (
            <ChoiceChip
              key={zone.id}
              label={zone.label}
              onPress={() => toggleZone(zone)}
              selected={draft.travelZones.some((item) => item.id === zone.id && item.active)}
            />
          ))}
        </View>
      </Section>

      <Section hint={t('servicesStay', { specialty: localizedSpecialtyName(specialty, language) })} title={t('servicesPrices')}>
        {draft.services.map((service, index) => (
          <View key={service.id} style={[styles.serviceBlock, index > 0 && styles.serviceDivider]}>
            <View style={styles.serviceHeader}>
              <TextInput accessibilityLabel={t('serviceName')} onChangeText={(name) => updateService(service.id, { name })} style={[onboardingStyles.input, styles.serviceName]} value={service.name} />
              {draft.services.length > 1 ? (
                <Pressable accessibilityLabel={t('removeService', { name: service.name })} hitSlop={8} onPress={() => removeService(service.id)} style={styles.removeService}>
                  <KonjoIcon color={professionalPalette.danger} name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={19} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.serviceControls}>
              <View style={styles.serviceControl}>
                <Text style={onboardingStyles.label}>{t('durationLabel')}</Text>
                <View style={styles.stepper}>
                  <Pressable accessibilityLabel={t('shorter')} onPress={() => updateService(service.id, { durationMinutes: Math.max(30, service.durationMinutes - 30) })} style={styles.stepperButton}><Text style={styles.stepperSymbol}>−</Text></Pressable>
                  <Text style={styles.stepperValue}>{t('minutesValue', { minutes: service.durationMinutes })}</Text>
                  <Pressable accessibilityLabel={t('longer')} onPress={() => updateService(service.id, { durationMinutes: Math.min(480, service.durationMinutes + 30) })} style={styles.stepperButton}><Text style={styles.stepperSymbol}>+</Text></Pressable>
                </View>
              </View>
              <View style={styles.serviceControl}>
                <Text style={onboardingStyles.label}>{t('priceEtb')}</Text>
                <TextInput inputMode="numeric" keyboardType="number-pad" onChangeText={(value) => updateService(service.id, { price: Number(value.replace(/\D/g, '')) || 0 })} style={onboardingStyles.input} value={service.price ? String(service.price) : ''} />
              </View>
            </View>
            <TextInput onChangeText={(note) => updateService(service.id, { note })} placeholder={t('includedPlaceholder')} placeholderTextColor={professionalPalette.textMuted} style={[onboardingStyles.input, styles.noteInput]} value={service.note} />
          </View>
        ))}
        <Pressable accessibilityRole="button" onPress={addService} style={styles.addService}>
          <Text style={styles.addServiceLabel}>{t('addAnotherService', { specialty: localizedSpecialtyName(specialty, language).toLowerCase() })}</Text>
        </Pressable>
      </Section>

      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
      <KonjoButton label={t('saveChanges')} loading={saving} onPress={() => { void save(); }} style={styles.saveButton} variant="dark" />
    </ProfessionalDetailScreen>
  );
}

const styles = StyleSheet.create({
  notice: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 14, lineHeight: 21, marginTop: spacing.lg },
  lockedCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.md },
  lockedCopy: { flex: 1 },
  lockedTitle: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 15 },
  lockedBody: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 18, marginTop: 2 },
  section: { marginTop: spacing.lg },
  sectionEyebrow: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.bold, fontSize: 11, letterSpacing: 0.8 },
  sectionHint: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 18, marginTop: 4 },
  sectionCard: { marginTop: spacing.xs, padding: spacing.md },
  counter: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11, marginTop: 4, textAlign: 'right' },
  languagesLabel: { marginTop: spacing.md },
  languageSkill: { borderTopColor: professionalPalette.border, borderTopWidth: 1, gap: spacing.xs, marginTop: spacing.sm, paddingTop: spacing.sm },
  languageSkillName: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: spacing.sm },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: professionalPalette.border },
  sameDayRow: { borderTopWidth: 1, borderTopColor: professionalPalette.border, marginTop: spacing.xs, paddingTop: spacing.md },
  dayCopy: { flex: 1 },
  dayName: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  dayOff: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 12, marginTop: 3 },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  timeChip: { borderRadius: radii.pill, backgroundColor: professionalPalette.greenSoft, paddingHorizontal: 10, paddingVertical: 5 },
  timeText: { color: professionalPalette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  timeDash: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 12 },
  serviceBlock: { gap: spacing.sm, paddingVertical: spacing.sm },
  serviceDivider: { borderTopWidth: 1, borderTopColor: professionalPalette.border },
  serviceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  serviceName: { flex: 1 },
  removeService: { padding: 6 },
  serviceControls: { flexDirection: 'row', gap: spacing.sm },
  serviceControl: { flex: 1 },
  stepper: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: professionalPalette.border, borderRadius: radii.md, paddingHorizontal: 6 },
  stepperButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepperSymbol: { color: professionalPalette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 20 },
  stepperValue: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  noteInput: { minHeight: 44 },
  addService: { borderWidth: 1, borderStyle: 'dashed', borderColor: professionalPalette.olive, borderRadius: radii.md, alignItems: 'center', paddingVertical: 14, marginTop: spacing.xs },
  addServiceLabel: { color: professionalPalette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  error: { color: professionalPalette.danger, fontFamily: fontFamilies.body.medium, fontSize: 13, lineHeight: 19, marginTop: spacing.md },
  saveButton: { marginTop: spacing.lg, marginBottom: spacing.xl },
});
