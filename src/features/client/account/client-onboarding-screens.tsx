import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoButton } from '@/components/ui/konjo-button';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view';
import { KonjoIcon } from '@/components/ui/konjo-icon';
import { useClientCopy } from '@/localization/use-client-copy';
import { useClientIdentityDocuments } from '@/features/client/identity-documents/client-identity-document-context';
import { ClientAddressForm } from './client-address-form';
import { isClientProfileComplete } from './client-account-types';
import { useClientAccount } from './client-account-context';
import { fontFamilies, layout, palette, radii, spacing } from '@/theme/tokens';

function ClientOnboardingShell({ children, step }: { children: React.ReactNode; step: 1 | 2 }) {
  const { language } = useClientCopy();

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
          <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.content}>
              <View style={styles.header}><Text style={styles.wordmark}>Konjo</Text><Text style={styles.step}>{language === 'am' ? `ደረጃ ${step} ከ2` : `STEP ${step} OF 2`}</Text></View>
              <View style={styles.progress}><View style={[styles.progressFill, { width: `${step * 50}%` }]} /></View>
              {children}
            </View>
          </KeyboardAwareScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

export function ClientProfileOnboardingScreen() {
  const { draft, updateDraft } = useClientAccount();
  const { t } = useClientCopy();
  const [showErrors, setShowErrors] = useState(false);
  const complete = isClientProfileComplete(draft);
  const next = () => { setShowErrors(true); if (complete) router.push('/client/onboarding/identity' as Href); };

  return (
    <ClientOnboardingShell step={1}>
      <View style={styles.intro}><Text accessibilityRole="header" style={styles.title}>{t('onboardingTitle')}</Text><Text style={styles.subtitle}>{t('onboardingBody')}</Text></View>
      <View style={styles.form}>
        <Field autoComplete="name" error={showErrors && draft.fullName.trim().length < 2} label={t('fullName')} onChangeText={(fullName) => updateDraft({ fullName })} placeholder={t('fullNamePlaceholder')} textContentType="name" value={draft.fullName} />
        <Field autoCapitalize="none" autoComplete="email" editable={!draft.email} inputMode="email" keyboardType="email-address" label={t('emailAddress')} onChangeText={(email) => updateDraft({ email })} placeholder="you@example.com" textContentType="emailAddress" value={draft.email} />
        <Field autoComplete="tel" editable={false} inputMode="tel" keyboardType="phone-pad" label={t('phoneOptional')} placeholder={t('internationalNumber')} textContentType="telephoneNumber" value={draft.phoneNumber} />
        <Text style={styles.fieldLabel}>{t('appLanguage')}</Text>
        <View style={styles.languageRow}>
          <Choice label={t('english')} onPress={() => updateDraft({ preferredLanguage: 'en' })} selected={draft.preferredLanguage === 'en'} />
          <Choice label={t('amharic')} onPress={() => updateDraft({ preferredLanguage: 'am' })} selected={draft.preferredLanguage === 'am'} />
        </View>
      </View>
      {showErrors && !complete ? <Text accessibilityLiveRegion="polite" style={styles.error}>{t('invalidProfile')}</Text> : null}
      <KonjoButton label={t('continue')} onPress={next} style={styles.primaryButton} trailingLabel="→" variant="dark" />
    </ClientOnboardingShell>
  );
}

export function ClientLocationOnboardingScreen() {
  const { completeOnboarding } = useClientAccount();
  const { t } = useClientCopy();
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finishWithoutAddress = async () => {
    setLoading(true); setError(null);
    try {
      await completeOnboarding();
      router.replace('/home' as Href);
    } catch (finishError) {
      if (__DEV__) console.error('Unable to complete client onboarding.', finishError);
      setError(t('saveProfileError'));
    } finally { setLoading(false); }
  };

  return (
    <ClientOnboardingShell step={2}>
      <View style={styles.intro}><Text accessibilityRole="header" style={styles.title}>{t('locationTitle')}</Text><Text style={styles.subtitle}>{t('locationBody')}</Text></View>
      {!adding ? (
        <View style={styles.locationChoices}>
          <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={({ pressed }) => [styles.locationChoice, pressed && styles.pressed]}>
            <View style={styles.choiceIcon}><KonjoIcon color={palette.olive} name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }} size={22} /></View>
            <View style={styles.choiceCopy}><Text style={styles.choiceTitle}>{t('saveAddisAddress')}</Text><Text style={styles.choiceBody}>{t('saveAddressHelp')}</Text></View>
            <KonjoIcon color={palette.textMuted} name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={18} />
          </Pressable>
          <Pressable accessibilityRole="button" disabled={loading} onPress={finishWithoutAddress} style={({ pressed }) => [styles.locationChoice, pressed && styles.pressed]}>
            <View style={styles.choiceIcon}><KonjoIcon color={palette.olive} name={{ ios: 'calendar', android: 'event', web: 'event' }} size={21} /></View>
            <View style={styles.choiceCopy}><Text style={styles.choiceTitle}>{t('chooseEachBooking')}</Text><Text style={styles.choiceBody}>{t('chooseEachBookingHelp')}</Text></View>
            <KonjoIcon color={palette.textMuted} name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={18} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.addressForm}>
          <ClientAddressForm
            onCancel={() => setAdding(false)}
            onSave={async (address) => {
              await completeOnboarding(address);
              router.replace('/home' as Href);
            }}
            submitLabel={t('saveAddressFinish')}
          />
        </View>
      )}
      {!adding ? <Text style={styles.locationNote}>{t('locationPrivacy')}</Text> : null}
      {error ? <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </ClientOnboardingShell>
  );
}

export function ClientIdentityOnboardingScreen() {
  const { language } = useClientCopy();
  const { account } = useClientAccount();
  const identity = useClientIdentityDocuments();
  const [method, setMethod] = useState<'passport' | 'national_id'>(identity.front || identity.back ? 'national_id' : 'passport');
  const title = language === 'am' ? 'የማንነት ሰነድዎን ይጫኑ' : 'Add your identity document';
  const body = language === 'am'
    ? 'ፓስፖርትዎን ወይም የመታወቂያዎን ፊትና ጀርባ ይጫኑ። ሰነዶቹ የግል ናቸው እና ፈቃድ ያለው የKonjo ገምጋሚ ብቻ ያያቸዋል።'
    : 'Upload your passport bio page, or the front and back of your ID. These files stay private and only authorized Konjo reviewers can open them.';

  return (
    <ClientOnboardingShell step={1}>
      <View style={styles.intro}><Text accessibilityRole="header" style={styles.title}>{title}</Text><Text style={styles.subtitle}>{body}</Text></View>
      <View style={styles.identityCard}>
        <View style={styles.languageRow}>
          <Choice label={language === 'am' ? 'ፓስፖርት' : 'Passport'} onPress={() => setMethod('passport')} selected={method === 'passport'} />
          <Choice label={language === 'am' ? 'ብሔራዊ መታወቂያ' : 'National ID'} onPress={() => setMethod('national_id')} selected={method === 'national_id'} />
        </View>
        {method === 'passport' ? (
          <DocumentChoice
            added={Boolean(identity.passport)}
            disabled={identity.busy}
            label={language === 'am' ? 'የፓስፖርት መረጃ ገጽ' : 'Passport bio page'}
            onPress={() => { void identity.uploadDocument('passport'); }}
          />
        ) : (
          <View style={styles.documentChoices}>
            <DocumentChoice added={Boolean(identity.front)} disabled={identity.busy} label={language === 'am' ? 'የመታወቂያ ፊት' : 'ID front'} onPress={() => { void identity.uploadDocument('national_id_front'); }} />
            <DocumentChoice added={Boolean(identity.back)} disabled={identity.busy} label={language === 'am' ? 'የመታወቂያ ጀርባ' : 'ID back'} onPress={() => { void identity.uploadDocument('national_id_back'); }} />
          </View>
        )}
      </View>
      {!identity.available ? <Text accessibilityRole="alert" style={styles.error}>Identity uploads are temporarily unavailable. Please contact Konjo support.</Text> : null}
      {identity.pending ? <Text style={styles.pendingNote}>{language === 'am' ? 'ሰነዶችዎ ለምርመራ ዝግጁ ናቸው።' : 'Your documents are ready for manual review.'}</Text> : null}
      {identity.rejectedReason ? <Text accessibilityRole="alert" style={styles.error}>{language === 'am' ? `ሰነድዎ ውድቅ ተደርጓል፦ ${identity.rejectedReason}` : `A document was rejected: ${identity.rejectedReason}`}</Text> : null}
      {identity.error ? <Pressable onPress={identity.dismissError}><Text accessibilityRole="alert" style={styles.error}>{identity.error}</Text></Pressable> : null}
      <KonjoButton disabled={!identity.complete || identity.busy || !identity.available} label={language === 'am' ? 'ወደ አካባቢ ቀጥል' : 'Continue to location'} onPress={() => router.replace((account ? '/home' : '/client/onboarding/location') as Href)} style={styles.primaryButton} trailingLabel="→" variant="dark" />
    </ClientOnboardingShell>
  );
}

function DocumentChoice({ added, disabled, label, onPress }: { added: boolean; disabled: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled || added} onPress={onPress} style={[styles.documentChoice, added && styles.documentChoiceAdded]}>
      <KonjoIcon color={palette.olive} name={{ ios: added ? 'checkmark.circle.fill' : 'photo', android: added ? 'check_circle' : 'photo', web: added ? 'check_circle' : 'photo' }} size={21} />
      <Text style={styles.documentChoiceLabel}>{added ? `✓ ${label}` : `+ ${label}`}</Text>
    </Pressable>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & { label: string; error?: boolean };
function Field({ label, error, style, ...props }: FieldProps) { return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput placeholderTextColor={palette.textMuted} style={[styles.input, error && styles.inputError, style]} {...props} /></View>; }
function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{selected ? '✓  ' : ''}{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas }, safeArea: { flex: 1 }, keyboard: { flex: 1 }, scrollContent: { flexGrow: 1, alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }, content: { width: '100%', maxWidth: layout.contentMaxWidth },
  header: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, wordmark: { color: palette.olive, fontFamily: fontFamilies.display.semibold, fontSize: 24 }, step: { color: palette.textMuted, fontFamily: fontFamilies.body.bold, fontSize: 9.5, letterSpacing: 1 },
  progress: { height: 3, borderRadius: 2, backgroundColor: palette.border }, progressFill: { height: 3, borderRadius: 2, backgroundColor: palette.olive },
  intro: { marginTop: 38 }, title: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 30, lineHeight: 38 }, subtitle: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 14, lineHeight: 22, marginTop: 8 },
  form: { marginTop: spacing.xl }, addressForm: { marginTop: spacing.xl }, field: { marginBottom: 16 }, fieldLabel: { color: palette.text, fontFamily: fontFamilies.body.medium, fontSize: 12.5, marginBottom: 7 }, input: { minHeight: 52, borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, color: palette.text, fontFamily: fontFamilies.body.regular, fontSize: 14.5, paddingHorizontal: 15 }, inputError: { borderColor: palette.error },
  languageRow: { flexDirection: 'row', gap: 9 }, chip: { minHeight: 42, justifyContent: 'center', borderWidth: 1, borderColor: palette.border, borderRadius: radii.pill, backgroundColor: palette.surface, paddingHorizontal: 14 }, chipSelected: { borderColor: palette.olive, backgroundColor: palette.olive }, chipLabel: { color: palette.textSecondary, fontFamily: fontFamilies.body.medium, fontSize: 12 }, chipLabelSelected: { color: palette.white, fontFamily: fontFamilies.body.semibold },
  error: { color: palette.error, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18, marginBottom: spacing.sm }, primaryButton: { marginTop: spacing.xl },
  locationChoices: { gap: 10, marginTop: spacing.xl }, locationChoice: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, padding: spacing.md }, choiceIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: palette.sageSoft, alignItems: 'center', justifyContent: 'center' }, choiceCopy: { flex: 1 }, choiceTitle: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 }, choiceBody: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 17, marginTop: 3 },
  locationNote: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11, lineHeight: 17, marginTop: spacing.lg }, pressed: { opacity: 0.72 },
  identityCard: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: radii.md, borderWidth: 1, gap: spacing.md, marginTop: spacing.xl, padding: spacing.md },
  documentChoices: { gap: spacing.sm },
  documentChoice: { alignItems: 'center', backgroundColor: palette.surfaceMuted, borderColor: palette.border, borderRadius: radii.md, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 58, paddingHorizontal: spacing.md },
  documentChoiceAdded: { backgroundColor: palette.sageSoft, borderColor: palette.sage, borderStyle: 'solid' },
  documentChoiceLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  pendingNote: { color: palette.olive, fontFamily: fontFamilies.body.medium, fontSize: 12.5, lineHeight: 19, marginTop: spacing.md },
});
