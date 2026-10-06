import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { KonjoButton } from '@/components/ui/konjo-button';
import { KonjoIcon } from '@/components/ui/konjo-icon';
import {
  ChoiceChip,
  FieldError,
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
import { useProfessionalDocuments } from '@/features/professional/documents/professional-document-context';
import { PortfolioGrid } from '@/features/professional/documents/portfolio-grid';
import { fillPortfolioCopy, PORTFOLIO_MINIMUM, professionalPortfolioCopy } from './professional-portfolio-copy';
import {
  isExperienceComplete,
  isPayoutMethodComplete,
  isProfileComplete,
  type ProfessionalPayoutMethodDraft,
  professionalEducationLevels,
  professionalLanguageProficiencies,
  professionalSpokenLanguages,
  professionalSpecialties,
  professionalGenders,
  type ProfessionalLanguageProficiency,
  type ProfessionalSpokenLanguage,
} from './professional-registration-types';
import { fontFamilies, professionalPalette, radii, spacing } from '@/theme/tokens';
import { payoutMethodTypes } from '../../../../shared/payout-method';

const identityDocumentCopy = {
  en: { front: 'National ID — front', back: 'National ID — back', additional: 'Additional government-issued ID', chooseFront: 'Upload front', chooseBack: 'Upload back', chooseAdditional: 'Upload additional ID', replaceRejected: 'Replace rejected image', pending: 'Awaiting review', approved: 'Approved', required: 'Upload both sides of your National ID and one additional government-issued ID, such as a resident ID, driver’s license, or passport bio page.', privacy: 'Your ID images are stored in private Supabase storage. Only authorized Konjo reviewers can open short-lived previews, and your profile stays offline until all required documents are approved.' },
  am: { front: 'የብሔራዊ መታወቂያ ፊት', back: 'የብሔራዊ መታወቂያ ጀርባ', additional: 'ተጨማሪ የመንግስት መታወቂያ', chooseFront: 'ፊት ጫን', chooseBack: 'ጀርባ ጫን', chooseAdditional: 'ተጨማሪ መታወቂያ ጫን', replaceRejected: 'ውድቅ የተደረገውን ምስል ቀይር', pending: 'ምርመራ ላይ', approved: 'ጸድቋል', required: 'የብሔራዊ መታወቂያዎን ፊትና ጀርባ፣ እንዲሁም እንደ የነዋሪነት መታወቂያ፣ መንጃ ፈቃድ ወይም ፓስፖርት ያለ አንድ ተጨማሪ የመንግስት መታወቂያ ይጫኑ።', privacy: 'የመታወቂያ ምስሎችዎ በግል Supabase ማከማቻ ውስጥ ይቀመጣሉ። ፈቃድ ያላቸው የKonjo ገምጋሚዎች ብቻ ለአጭር ጊዜ በሚሰራ ማስፈንጠሪያ ሊያዩዋቸው ይችላሉ፤ ሁሉም ሰነዶች እስኪጸድቁ መገለጫዎ አይታይም።' },
  om: { front: 'Eenyummaa biyyaalessaa — fuuldura', back: 'Eenyummaa biyyaalessaa — duuba', additional: 'Eenyummaa mootummaa dabalataa', chooseFront: 'Fuuldura fe’i', chooseBack: 'Duuba fe’i', chooseAdditional: 'Eenyummaa dabalataa fe’i', replaceRejected: 'Suuraa didame bakka buusi', pending: 'Qorannoo eeggachaa jira', approved: 'Mirkanaa’eera', required: 'Fuulduraa fi duuba eenyummaa biyyaalessaa, akkasumas eenyummaa jiraataa, hayyama konkolaachisummaa ykn fuula paaspoortii keessaa tokko fe’aa.', privacy: 'Suuraaleen eenyummaa keessanii kuusaa dhuunfaa Supabase keessatti kuufamu. Qorattoota Konjo hayyama qaban qofatu geessituu yeroo gabaabaa fayyadamuun bana; hanga galmeen hundi mirkanaa’utti odeeffannoon keessan hin mul’atu.' },
} as const;

const baseZones = ['Bole', 'CMC', 'Kazanchis', 'Old Airport', 'Ayat', 'Megenagna', 'Summit', 'Sarbet'] as const;
export function ProfessionalProfileOnboardingScreen() {
  const { draft, updateProfile } = useProfessionalRegistration();
  const [showErrors, setShowErrors] = useState(false);
  const profile = draft.profile;
  const language = draft.preferredLanguage ?? 'en';
  const copy = professionalOnboardingCopy[language];
  const complete = draft.preferredLanguage !== null && isProfileComplete(profile);
  const emailInvalid = profile.email.trim().length > 0 && !/^\S+@\S+\.\S+$/.test(profile.email.trim());
  const legalNameMissing = profile.legalName.trim().length < 3;
  const displayNameMissing = profile.displayName.trim().length < 2;
  const specialtyMissing = profile.specialty === null;
  const genderMissing = profile.gender === null;
  const payoutMissing = !isPayoutMethodComplete(profile.payoutMethod);
  const baseZoneMissing = profile.baseZone.length === 0;
  const updatePayout = (changes: Partial<ProfessionalPayoutMethodDraft>) => updateProfile({ payoutMethod: { ...profile.payoutMethod, ...changes } });
  const issues = showErrors ? [
    legalNameMissing && copy.fieldLegalName,
    displayNameMissing && copy.fieldDisplayName,
    emailInvalid && copy.fieldEmail,
    specialtyMissing && copy.fieldSpecialty,
    genderMissing && copy.fieldGender,
    payoutMissing && copy.fieldPayout,
    baseZoneMissing && copy.fieldBaseZone,
  ].filter((issue): issue is string => typeof issue === 'string') : [];

  const next = () => {
    setShowErrors(true);
    if (!complete || emailInvalid) return;
    router.push('/pro/onboarding/experience' as Href);
  };

  return (
    <OnboardingScreen currentStep={1} fallback={'/pro/onboarding/language' as Href}>
      <StatusBar style="dark" />
      <OnboardingIntro
        body={copy.profileBody}
        eyebrow={copy.profileEyebrow}
        title={copy.profileTitle}
      />
      <OnboardingCard>
        <View style={onboardingStyles.field}>
          <Text style={onboardingStyles.label}>{copy.legalName}</Text>
          <TextInput
            accessibilityLabel={copy.legalName}
            autoComplete="name"
            onChangeText={(legalName) => updateProfile({ legalName })}
            placeholder={language === 'am' ? 'በመታወቂያዎ ላይ ያለው ስም' : language === 'om' ? 'Maqaa waraqaa eenyummaa irratti barreeffame' : 'Name shown on your ID'}
            placeholderTextColor={professionalPalette.textMuted}
            returnKeyType="next"
            style={[onboardingStyles.input, showErrors && legalNameMissing && onboardingStyles.inputError]}
            textContentType="name"
            value={profile.legalName}
          />
          <FieldError message={copy.fieldLegalName} visible={showErrors && legalNameMissing} />
        </View>
        <View style={onboardingStyles.field}>
          <Text style={onboardingStyles.label}>{copy.displayName}</Text>
          <TextInput
            accessibilityLabel={copy.displayName}
            onChangeText={(displayName) => updateProfile({ displayName })}
            placeholder={copy.displayPlaceholder}
            placeholderTextColor={professionalPalette.textMuted}
            returnKeyType="next"
            style={[onboardingStyles.input, showErrors && displayNameMissing && onboardingStyles.inputError]}
            value={profile.displayName}
          />
          <FieldError message={copy.fieldDisplayName} visible={showErrors && displayNameMissing} />
          <Text style={onboardingStyles.helper}>{copy.displayHelp}</Text>
        </View>
        <View style={onboardingStyles.field}>
          <Text style={onboardingStyles.label}>{copy.email}</Text>
          <TextInput
            accessibilityLabel={copy.email}
            autoCapitalize="none"
            autoComplete="email"
            inputMode="email"
            keyboardType="email-address"
            onChangeText={(email) => updateProfile({ email })}
            placeholder="you@example.com"
            placeholderTextColor={professionalPalette.textMuted}
            returnKeyType="next"
            style={[onboardingStyles.input, showErrors && emailInvalid && onboardingStyles.inputError]}
            textContentType="emailAddress"
            value={profile.email}
          />
          <FieldError message={copy.fieldEmail} visible={showErrors && emailInvalid} />
        </View>
        <Text style={onboardingStyles.label}>{copy.specialty}</Text>
        <View style={onboardingStyles.chipWrap}>
          {professionalSpecialties.map((specialty) => (
            <ChoiceChip
              key={specialty.id}
              label={localizedSpecialtyName(specialty.id, language)}
              onPress={() => updateProfile({ specialty: specialty.id })}
              selected={profile.specialty === specialty.id}
            />
          ))}
        </View>
        <FieldError message={copy.fieldSpecialty} visible={showErrors && specialtyMissing} />
        <Text style={[onboardingStyles.label, { marginTop: spacing.lg }]}>{copy.gender}</Text>
        <Text style={onboardingStyles.helper}>{copy.genderHelp}</Text>
        <View style={onboardingStyles.chipWrap}>
          {professionalGenders.map((gender) => (
            <ChoiceChip
              key={gender}
              label={gender === 'female' ? copy.genderFemale : gender === 'male' ? copy.genderMale : copy.genderUnspecified}
              onPress={() => updateProfile({ gender })}
              selected={profile.gender === gender}
            />
          ))}
        </View>
        <FieldError message={copy.fieldGender} visible={showErrors && genderMissing} />
        <Text style={[onboardingStyles.label, { marginTop: spacing.lg }]}>{copy.payoutTitle}</Text>
        <Text style={onboardingStyles.helper}>{copy.payoutHelp}</Text>
        <View style={onboardingStyles.chipWrap}>
          {payoutMethodTypes.map((type) => (
            <ChoiceChip
              key={type}
              label={type === 'telebirr' ? copy.payoutTelebirr : type === 'cbe_birr' ? copy.payoutCbeBirr : copy.payoutBank}
              onPress={() => updatePayout({ type })}
              selected={profile.payoutMethod.type === type}
            />
          ))}
        </View>
        {profile.payoutMethod.type ? (
          <View style={styles.payoutFields}>
            <Text style={onboardingStyles.label}>{copy.payoutAccountName}</Text>
            <TextInput onChangeText={(accountName) => updatePayout({ accountName })} style={onboardingStyles.input} value={profile.payoutMethod.accountName} />
            {profile.payoutMethod.type === 'bank' ? (
              <>
                <Text style={[onboardingStyles.label, styles.payoutFieldLabel]}>{copy.payoutBankName}</Text>
                <TextInput onChangeText={(bankName) => updatePayout({ bankName })} style={onboardingStyles.input} value={profile.payoutMethod.bankName} />
                <Text style={[onboardingStyles.label, styles.payoutFieldLabel]}>{copy.payoutBankAccountNumber}</Text>
                <TextInput inputMode="numeric" keyboardType="number-pad" onChangeText={(accountNumber) => updatePayout({ accountNumber })} style={onboardingStyles.input} value={profile.payoutMethod.accountNumber} />
              </>
            ) : (
              <>
                <Text style={[onboardingStyles.label, styles.payoutFieldLabel]}>{copy.payoutAccountNumber}</Text>
                <TextInput inputMode="tel" keyboardType="phone-pad" onChangeText={(accountNumber) => updatePayout({ accountNumber })} placeholder={copy.payoutNumberPlaceholder} placeholderTextColor={professionalPalette.textMuted} style={onboardingStyles.input} value={profile.payoutMethod.accountNumber} />
              </>
            )}
          </View>
        ) : null}
        <FieldError message={copy.fieldPayout} visible={showErrors && payoutMissing} />
        <View style={styles.baseZoneField}>
          <Text style={onboardingStyles.label}>{copy.baseZone}</Text>
          <Text style={onboardingStyles.helper}>{copy.selectBaseZone}</Text>
          <View style={[onboardingStyles.chipWrap, styles.baseZoneChips]}>
            {baseZones.map((zone) => <ChoiceChip key={zone} label={zone} onPress={() => updateProfile({ baseZone: zone })} selected={profile.baseZone === zone} />)}
          </View>
          <FieldError message={copy.fieldBaseZone} visible={showErrors && baseZoneMissing} />
        </View>
        <MissingFieldList issues={issues} title={copy.missingFields} />
      </OnboardingCard>
      <View style={onboardingStyles.footer}>
        <KonjoButton label={copy.continueExperience} onPress={next} trailingLabel="→" variant="dark" />
      </View>
    </OnboardingScreen>
  );
}

export function ProfessionalExperienceOnboardingScreen() {
  const { draft, updateProfile } = useProfessionalRegistration();
  const [showErrors, setShowErrors] = useState(false);
  const profile = draft.profile;
  const copy = professionalOnboardingCopy[draft.preferredLanguage ?? 'en'];
  const complete = isExperienceComplete(profile);
  const years = Number(profile.yearsExperience);
  const yearsInvalid = profile.yearsExperience.trim().length === 0 || !Number.isInteger(years) || years < 0 || years > 60;
  const educationMissing = profile.educationLevel === null;
  const genderMissing = profile.gender === null;
  const languagesMissing = profile.languageSkills.length === 0;
  const bioRemaining = Math.max(0, 30 - profile.bio.trim().length);
  const bioMissing = bioRemaining > 0;
  const bioMessage = copy.fieldBio.replace('{count}', String(bioRemaining));
  const issues = showErrors ? [
    yearsInvalid && copy.fieldYears,
    educationMissing && copy.fieldEducation,
    genderMissing && copy.fieldGender,
    languagesMissing && copy.fieldLanguages,
    bioMissing && bioMessage,
  ].filter((issue): issue is string => typeof issue === 'string') : [];

  const toggleLanguage = (language: ProfessionalSpokenLanguage) => {
    const exists = profile.languageSkills.some((skill) => skill.language === language);
    updateProfile({
      languageSkills: exists
        ? profile.languageSkills.filter((skill) => skill.language !== language)
        : [...profile.languageSkills, { language, proficiency: 'conversational' }],
    });
  };
  const setProficiency = (
    language: ProfessionalSpokenLanguage,
    proficiency: ProfessionalLanguageProficiency,
  ) => {
    updateProfile({
      languageSkills: profile.languageSkills.map((skill) => (
        skill.language === language ? { ...skill, proficiency } : skill
      )),
    });
  };
  const next = () => {
    setShowErrors(true);
    if (!complete) return;
    router.push('/pro/onboarding/identity' as Href);
  };

  return (
    <OnboardingScreen currentStep={2} fallback={'/pro/onboarding/profile' as Href}>
      <StatusBar style="dark" />
      <OnboardingIntro
        body={copy.experienceBody}
        eyebrow={copy.experienceEyebrow}
        title={copy.experienceTitle}
      />
      <OnboardingCard>
        <View style={onboardingStyles.field}>
          <Text style={onboardingStyles.label}>{copy.years}</Text>
          <TextInput
            accessibilityLabel={copy.years}
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={2}
            onChangeText={(yearsExperience) => updateProfile({ yearsExperience: yearsExperience.replace(/\D/g, '') })}
            placeholder={copy.yearsPlaceholder}
            placeholderTextColor={professionalPalette.textMuted}
            style={[onboardingStyles.input, showErrors && yearsInvalid && onboardingStyles.inputError]}
            value={profile.yearsExperience}
          />
          <FieldError message={copy.fieldYears} visible={showErrors && yearsInvalid} />
        </View>
        <View style={onboardingStyles.field}>
          <Text style={onboardingStyles.label}>{copy.educationLevel}</Text>
          <View style={onboardingStyles.chipWrap}>
            {professionalEducationLevels.map((educationLevel) => (
              <ChoiceChip
                key={educationLevel}
                label={localizedEducationLevelName(educationLevel, draft.preferredLanguage ?? 'en')}
                onPress={() => updateProfile({ educationLevel })}
                selected={profile.educationLevel === educationLevel}
              />
            ))}
          </View>
          <FieldError message={copy.fieldEducation} visible={showErrors && educationMissing} />
        </View>
        <View style={onboardingStyles.field}>
          <Text style={onboardingStyles.label}>{copy.spokenLanguages}</Text>
          <Text style={onboardingStyles.helper}>{copy.languageProficiencyHelp}</Text>
          <View style={onboardingStyles.chipWrap}>
            {professionalSpokenLanguages.map((spokenLanguage) => (
              <ChoiceChip
                key={spokenLanguage}
                label={localizedSpokenLanguageName(spokenLanguage, draft.preferredLanguage ?? 'en')}
                onPress={() => toggleLanguage(spokenLanguage)}
                selected={profile.languageSkills.some((skill) => skill.language === spokenLanguage)}
              />
            ))}
          </View>
          <FieldError message={copy.fieldLanguages} visible={showErrors && languagesMissing} />
          {profile.languageSkills.map((skill) => (
            <View key={skill.language} style={styles.languageSkill}>
              <Text style={styles.languageSkillName}>
                {localizedSpokenLanguageName(skill.language, draft.preferredLanguage ?? 'en')}
              </Text>
              <View style={onboardingStyles.chipWrap}>
                {professionalLanguageProficiencies.map((proficiency) => (
                  <ChoiceChip
                    key={proficiency}
                    label={localizedLanguageProficiencyName(proficiency, draft.preferredLanguage ?? 'en')}
                    onPress={() => setProficiency(skill.language, proficiency)}
                    selected={skill.proficiency === proficiency}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
        <View>
          <Text style={onboardingStyles.label}>{copy.aboutWork}</Text>
          <TextInput
            accessibilityLabel={copy.aboutWork}
            maxLength={280}
            multiline
            onChangeText={(bio) => updateProfile({ bio })}
            placeholder={copy.aboutPlaceholder}
            placeholderTextColor={professionalPalette.textMuted}
            style={[onboardingStyles.input, onboardingStyles.textArea, showErrors && bioMissing && onboardingStyles.inputError]}
            value={profile.bio}
          />
          <FieldError message={bioMessage} visible={showErrors && bioMissing} />
          <Text style={styles.characterCount}>{profile.bio.length}/280</Text>
        </View>
        <MissingFieldList issues={issues} title={copy.missingFields} />
      </OnboardingCard>
      <View style={styles.guidanceCard}>
        <KonjoIcon color={professionalPalette.olive} name={{ ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' }} size={21} />
        <View style={styles.guidanceCopy}>
          <Text style={styles.guidanceTitle}>{copy.portfolioTitle}</Text>
          <Text style={styles.guidanceBody}>{copy.portfolioBody}</Text>
        </View>
      </View>
      <View style={onboardingStyles.footer}>
        <KonjoButton label={copy.continueIdentity} onPress={next} trailingLabel="→" variant="dark" />
      </View>
    </OnboardingScreen>
  );
}

export function ProfessionalIdentityOnboardingScreen() {
  const { draft } = useProfessionalRegistration();
  const { documents, uploadDocument, deleteDocument, mutationStatus, error: documentError, dismissError } = useProfessionalDocuments();
  const language = draft.preferredLanguage ?? 'en';
  const copy = professionalOnboardingCopy[language];
  const identityCopy = identityDocumentCopy[language];
  const front = documents.find((document) => document.kind === 'national_id_front' && document.status !== 'rejected');
  const back = documents.find((document) => document.kind === 'national_id_back' && document.status !== 'rejected');
  const additionalId = documents.find((document) => document.kind === 'government_id' && document.status !== 'rejected');
  const educationCertificate = documents.find((document) => document.kind === 'certificate' && document.credentialType !== 'course' && document.status !== 'rejected');
  const rejectedFront = documents.find((document) => document.kind === 'national_id_front' && document.status === 'rejected');
  const rejectedBack = documents.find((document) => document.kind === 'national_id_back' && document.status === 'rejected');
  const rejectedAdditionalId = documents.find((document) => document.kind === 'government_id' && document.status === 'rejected');
  const complete = Boolean(front && back && additionalId && educationCertificate);

  return (
    <OnboardingScreen currentStep={3} fallback={'/pro/onboarding/experience' as Href}>
      <StatusBar style="dark" />
      <OnboardingIntro
        body={identityCopy.required}
        eyebrow={copy.identityEyebrow}
        title={copy.identityTitle}
      />
      <View style={styles.identityDocuments}>
        {([
          ['national_id_front', identityCopy.front, identityCopy.chooseFront, front, rejectedFront],
          ['national_id_back', identityCopy.back, identityCopy.chooseBack, back, rejectedBack],
          ['government_id', identityCopy.additional, identityCopy.chooseAdditional, additionalId, rejectedAdditionalId],
        ] as const).map(([kind, title, uploadLabel, active, rejected]) => (
          <View key={kind} style={styles.identityDocumentCard}>
            <View style={styles.identityDocumentCopy}>
              <Text style={styles.guidanceTitle}>{title}</Text>
              <Text style={styles.guidanceBody}>
                {active ? (active.status === 'approved' ? identityCopy.approved : identityCopy.pending) : rejected?.rejectionReason ?? identityCopy.required}
              </Text>
            </View>
            {active ? (
              active.status === 'approved' ? null : <KonjoButton disabled={mutationStatus !== 'idle'} label="Remove" onPress={() => { void deleteDocument(active.id); }} />
            ) : (
              <KonjoButton disabled={mutationStatus !== 'idle'} label={rejected ? identityCopy.replaceRejected : uploadLabel} loading={mutationStatus !== 'idle'} onPress={() => { dismissError(); void uploadDocument(kind); }} />
            )}
          </View>
        ))}
      </View>
      <View style={styles.identityDocumentCard}>
        <View style={styles.identityDocumentCopy}>
          <Text style={styles.guidanceTitle}>Highest-education certificate or diploma</Text>
          <Text style={styles.guidanceBody}>{educationCertificate ? 'Submitted for review.' : 'Required. Upload your highest education certificate or diploma.'}</Text>
        </View>
        {educationCertificate ? (
          educationCertificate.status === 'approved' ? null : <KonjoButton disabled={mutationStatus !== 'idle'} label="Remove" onPress={() => { void deleteDocument(educationCertificate.id); }} />
        ) : (
          <KonjoButton disabled={mutationStatus !== 'idle'} label="Upload certificate" loading={mutationStatus !== 'idle'} onPress={() => { dismissError(); void uploadDocument('certificate', 'education'); }} />
        )}
      </View>
      {documentError ? <Text accessibilityLiveRegion="polite" style={onboardingStyles.error}>{documentError}</Text> : null}
      <View style={styles.privacyCard}>
        <View style={styles.shieldCircle}><KonjoIcon color={professionalPalette.olive} name={{ ios: 'shield', android: 'shield', web: 'shield' }} size={21} /></View>
        <View style={styles.guidanceCopy}>
          <Text style={styles.guidanceTitle}>{copy.privateTitle}</Text>
          <Text style={styles.guidanceBody}>{identityCopy.privacy}</Text>
        </View>
      </View>
      <View style={onboardingStyles.footer}>
        <KonjoButton disabled={!complete} label={copy.continueServices} onPress={() => router.push('/pro/onboarding/portfolio' as Href)} trailingLabel="→" variant="dark" />
      </View>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  characterCount: { alignSelf: 'flex-end', color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11, marginTop: 5 },
  baseZoneField: { marginTop: spacing.lg },
  payoutFields: { marginTop: spacing.sm },
  payoutFieldLabel: { marginTop: spacing.sm },
  baseZoneChips: { marginTop: spacing.sm },
  guidanceCard: { flexDirection: 'row', gap: 12, borderRadius: radii.md, backgroundColor: professionalPalette.greenSoft, padding: spacing.md, marginTop: spacing.md },
  guidanceCopy: { flex: 1 },
  guidanceTitle: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  guidanceBody: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 19, marginTop: 3 },
  identityDocuments: { gap: spacing.sm, marginTop: spacing.md },
  identityDocumentCard: { alignItems: 'center', backgroundColor: professionalPalette.white, borderColor: professionalPalette.border, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between', padding: spacing.md },
  identityDocumentCopy: { flex: 1, minWidth: 190 },
  privacyCard: { flexDirection: 'row', gap: 12, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: radii.md, backgroundColor: professionalPalette.white, padding: spacing.md, marginTop: spacing.lg },
  shieldCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: professionalPalette.greenSoft, alignItems: 'center', justifyContent: 'center' },
  languageSkill: { borderTopColor: professionalPalette.border, borderTopWidth: 1, gap: spacing.xs, marginTop: spacing.sm, paddingTop: spacing.sm },
  languageSkillName: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
});

export function ProfessionalPortfolioOnboardingScreen() {
  const { draft } = useProfessionalRegistration();
  const { documents } = useProfessionalDocuments();
  const language = draft.preferredLanguage ?? 'en';
  const copy = professionalOnboardingCopy[language];
  const portfolioCopy = professionalPortfolioCopy[language];
  const uploaded = documents.filter((document) => document.kind === 'portfolio' && document.status !== 'rejected').length;
  const missing = Math.max(0, PORTFOLIO_MINIMUM - uploaded);

  return (
    <OnboardingScreen currentStep={4} fallback={'/pro/onboarding/identity' as Href}>
      <StatusBar style="dark" />
      <OnboardingIntro body={portfolioCopy.body} eyebrow={portfolioCopy.eyebrow} title={portfolioCopy.title} />
      <OnboardingCard>
        <PortfolioGrid language={language} />
      </OnboardingCard>
      {missing > 0 ? <Text style={onboardingStyles.helper}>{fillPortfolioCopy(portfolioCopy.needMore, { count: missing })}</Text> : null}
      <View style={onboardingStyles.footer}>
        <KonjoButton disabled={missing > 0} label={copy.continueServices} onPress={() => router.push('/pro/onboarding/services' as Href)} trailingLabel="→" variant="dark" />
      </View>
    </OnboardingScreen>
  );
}
