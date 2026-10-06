import type { Href } from 'expo-router';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoButton } from '@/components/ui/konjo-button';
import { KonjoIcon } from '@/components/ui/konjo-icon';
import { professionalOnboardingCopy } from './professional-onboarding-copy';
import { professionalCopy } from '@/localization/professional-copy';
import { useProfessionalRegistration } from './professional-registration-context';
import type { ProfessionalAppLanguage } from './professional-registration-types';
import { fontFamilies, layout, professionalPalette, radii, spacing } from '@/theme/tokens';

const languageOptions: readonly { id: ProfessionalAppLanguage; name: string; helper: string }[] = [
  { id: 'am', name: 'አማርኛ', helper: 'በአማርኛ ይቀጥሉ' },
  { id: 'om', name: 'Afaan Oromoo', helper: 'Afaan Oromootiin itti fufi' },
  { id: 'en', name: 'English', helper: 'Continue in English' },
];

export function ProfessionalLanguageScreen() {
  const { application, draft, saveApprovedProfile, setPreferredLanguage } = useProfessionalRegistration();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const pathname = usePathname();
  const params = useLocalSearchParams<{ initial?: string | string[] }>();
  const isSettings = pathname === '/pro/language';
  const rawInitial = Array.isArray(params.initial) ? params.initial[0] : params.initial;
  const initialLanguage = rawInitial === 'am' || rawInitial === 'om' || rawInitial === 'en'
    ? rawInitial
    : null;
  const language = draft.preferredLanguage ?? initialLanguage ?? 'en';
  const copy = professionalOnboardingCopy[language];
  const isAmharic = language === 'am';

  // In settings the choice is stored on the professional's profile so every
  // device and the notifications follow it; an approved profile is the only
  // one the API lets us update, so a pending application keeps it locally.
  const confirm = async () => {
    const next = draft.preferredLanguage;
    const destination = (isSettings ? '/pro/profile' : '/pro/onboarding/profile') as Href;
    if (!isSettings || !next || application?.status !== 'approved' || application.preferredLanguage === next) {
      router.replace(destination);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await saveApprovedProfile({ ...draft, preferredLanguage: next });
      router.replace(destination);
    } catch {
      setSaveError(professionalCopy[next].languageSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!draft.preferredLanguage && initialLanguage) {
      setPreferredLanguage(initialLanguage);
    }
  }, [draft.preferredLanguage, initialLanguage, setPreferredLanguage]);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.brand}><Text style={styles.brandName}>Konjo</Text><Text style={[styles.brandTagline, isAmharic && styles.ethiopicSemibold]}>{copy.professionalLabel}</Text></View>
          <View style={styles.languageIcon}><KonjoIcon color={professionalPalette.olive} name={{ ios: 'globe', android: 'language', web: 'language' }} size={34} /></View>
          <Text accessibilityRole="header" style={[styles.title, isAmharic && styles.ethiopicSemibold]}>{copy.chooseLanguage}</Text>
          <Text style={[styles.body, isAmharic && styles.ethiopicRegular]}>{copy.chooseLanguageBody}</Text>
          <View style={styles.options}>
            {languageOptions.map((language) => {
              const selected = draft.preferredLanguage === language.id;
              return (
                <Pressable
                  key={language.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => setPreferredLanguage(language.id)}
                  style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}>
                  <View style={styles.optionCopy}><Text style={[styles.optionName, language.id === 'am' && styles.ethiopicSemibold]}>{language.name}</Text><Text style={[styles.optionHelper, language.id === 'am' && styles.ethiopicRegular]}>{language.helper}</Text></View>
                  <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                </Pressable>
              );
            })}
          </View>
          <KonjoButton
            disabled={!draft.preferredLanguage || saving}
            label={copy.continue}
            loading={saving}
            onPress={() => { void confirm(); }}
            style={styles.button}
            trailingLabel="→"
            variant="dark"
          />
          {saveError ? <Text accessibilityLiveRegion="polite" style={[styles.note, isAmharic && styles.ethiopicRegular]}>{saveError}</Text> : null}
          <Text style={[styles.note, isAmharic && styles.ethiopicRegular]}>{isSettings ? copy.languageSaved : copy.languageChangeLater}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: professionalPalette.canvas },
  safeArea: { flex: 1 },
  content: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  brand: { position: 'absolute', top: spacing.lg, left: spacing.lg },
  brandName: { color: professionalPalette.olive, fontFamily: fontFamilies.display.semibold, fontSize: 25 },
  brandTagline: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.bold, fontSize: 8, letterSpacing: 2 },
  languageIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: professionalPalette.greenSoft, alignSelf: 'center', marginBottom: spacing.lg },
  title: { color: professionalPalette.text, fontFamily: fontFamilies.display.medium, fontSize: 28, textAlign: 'center' },
  body: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13.5, lineHeight: 21, textAlign: 'center', marginTop: 8 },
  options: { gap: 10, marginTop: spacing.xl },
  option: { minHeight: 72, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: professionalPalette.border, borderRadius: radii.md, backgroundColor: professionalPalette.white, paddingHorizontal: spacing.md },
  optionSelected: { borderWidth: 2, borderColor: professionalPalette.olive, backgroundColor: professionalPalette.greenSoft },
  optionCopy: { flex: 1 },
  optionName: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 17 },
  optionHelper: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 11.5, marginTop: 3 },
  ethiopicSemibold: { fontFamily: fontFamilies.ethiopic.semibold },
  ethiopicRegular: { fontFamily: fontFamilies.ethiopic.regular },
  radio: { width: 23, height: 23, borderWidth: 2, borderColor: professionalPalette.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: professionalPalette.olive },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: professionalPalette.olive },
  button: { marginTop: spacing.xl },
  note: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11, textAlign: 'center', marginTop: spacing.sm },
  pressed: { opacity: 0.72 },
});
