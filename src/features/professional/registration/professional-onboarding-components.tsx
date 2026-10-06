import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { professionalOnboardingCopy } from './professional-onboarding-copy';
import { professionalPortfolioCopy } from './professional-portfolio-copy';
import { useProfessionalRegistration } from './professional-registration-context';
import { fontFamilies, layout, professionalPalette, radii, spacing } from '@/theme/tokens';

export function OnboardingScreen({
  children,
  currentStep,
  fallback,
}: {
  children: ReactNode;
  currentStep: number;
  fallback: Href;
}) {
  const { draft, syncStatus, syncError, syncDraft, loadSavedDraft } = useProfessionalRegistration();
  const [reloadError, setReloadError] = useState<string | null>(null);
  const copy = professionalOnboardingCopy[draft.preferredLanguage ?? 'en'];
  const isAmharic = draft.preferredLanguage === 'am';
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  };

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <KeyboardAwareScrollView
          bottomOffset={24}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable
              accessibilityLabel={copy.goBack}
              accessibilityRole="button"
              hitSlop={8}
              onPress={goBack}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <KonjoIcon color={professionalPalette.text} name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={20} />
            </Pressable>
            <Text accessibilityRole="header" style={[styles.headerTitle, isAmharic && styles.ethiopicSemibold]}>{copy.onboarding}</Text>
            <View accessibilityElementsHidden style={styles.headerButton}>
              <KonjoIcon color={professionalPalette.textMuted} name={{ ios: 'questionmark.circle', android: 'help_outline', web: 'help_outline' }} size={20} />
            </View>
          </View>
          <OnboardingProgress currentStep={currentStep} />
          <Text accessibilityLiveRegion="polite" style={onboardingStyles.helper}>{syncStatus === 'saving' ? 'Saving your progress…' : syncStatus === 'error' ? 'Changes are saved on this device. Online sync needs attention.' : 'Your progress is saved.'}</Text>
          {syncStatus === 'error' && <View style={{ gap: 8 }}>
            <Text accessibilityRole="alert" style={onboardingStyles.error}>{reloadError ?? syncError}</Text>
            <Pressable accessibilityRole="button" onPress={() => { void syncDraft().catch(() => undefined); }}><Text style={onboardingStyles.label}>Retry sync</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { void loadSavedDraft().catch((error: unknown) => setReloadError(error instanceof Error ? error.message : 'Unable to load saved progress.')); }}><Text style={onboardingStyles.label}>Discard local changes and load saved version</Text></Pressable>
          </View>}
          {children}
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </View>
  );
}

function OnboardingProgress({ currentStep }: { currentStep: number }) {
  const { draft } = useProfessionalRegistration();
  const copy = professionalOnboardingCopy[draft.preferredLanguage ?? 'en'];
  const isAmharic = draft.preferredLanguage === 'am';
  const steps = [copy.profileStep, copy.experienceStep, copy.identityStep, professionalPortfolioCopy[draft.preferredLanguage ?? 'en'].step, copy.servicesStep, copy.availabilityStep, copy.reviewStep];
  const progressLabel = copy.stepProgress
    .replace('{current}', String(currentStep))
    .replace('{total}', String(steps.length));
  return (
    <View accessibilityLabel={progressLabel} style={styles.progressCard}>
      <View style={styles.progressTrack} />
      <View style={styles.progressRow}>
        {steps.map((step, index) => {
          const number = index + 1;
          const done = number < currentStep;
          const active = number === currentStep;
          return (
            <View key={step} style={styles.progressItem}>
              <View style={[styles.progressCircle, (done || active) && styles.progressCircleActive]}>
                <Text style={[styles.progressNumber, (done || active) && styles.progressNumberActive]}>{done ? '✓' : number}</Text>
              </View>
              <Text numberOfLines={1} style={[styles.progressLabel, active && styles.progressLabelActive, isAmharic && styles.ethiopicRegular]}>{step}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function OnboardingIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  const { draft } = useProfessionalRegistration();
  const isAmharic = draft.preferredLanguage === 'am';
  return (
    <View style={styles.intro}>
      <View style={styles.eyebrow}><View style={styles.eyebrowDot} /><Text style={[styles.eyebrowText, isAmharic && styles.ethiopicRegular]}>{eyebrow}</Text></View>
      <Text style={[styles.title, isAmharic && styles.ethiopicSemibold]}>{title}</Text>
      <Text style={[styles.body, isAmharic && styles.ethiopicRegular]}>{body}</Text>
    </View>
  );
}

export function OnboardingCard({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ChoiceChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const isEthiopic = /[\u1200-\u137F]/.test(label);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected, isEthiopic && styles.ethiopicRegular]}>{selected ? '✓  ' : ''}{label}</Text>
    </Pressable>
  );
}

export const onboardingStyles = StyleSheet.create({
  sectionTitle: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 17, lineHeight: 24 },
  label: { color: professionalPalette.text, fontFamily: fontFamilies.body.medium, fontSize: 13, marginBottom: 7 },
  input: { minHeight: 52, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: radii.md, backgroundColor: professionalPalette.white, color: professionalPalette.text, fontFamily: fontFamilies.body.regular, fontSize: 15, paddingHorizontal: 15 },
  inputError: { borderColor: professionalPalette.danger },
  textArea: { minHeight: 116, paddingTop: 13, textAlignVertical: 'top' },
  helper: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 17, marginTop: 6 },
  error: { color: professionalPalette.danger, fontFamily: fontFamilies.body.medium, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  missingList: { marginTop: spacing.sm, gap: 4 },
  missingItem: { color: professionalPalette.danger, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18 },
  field: { marginBottom: 18 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  footer: { gap: 10, marginTop: spacing.xl, marginBottom: spacing.lg },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: professionalPalette.canvas },
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1, width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 18 },
  progressCard: { position: 'relative', borderRadius: radii.md, backgroundColor: professionalPalette.white, paddingHorizontal: spacing.sm, paddingVertical: 10, marginBottom: spacing.lg },
  progressTrack: { position: 'absolute', top: 24, left: 34, right: 34, height: 2, backgroundColor: professionalPalette.border },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  progressItem: { width: '16.6667%', alignItems: 'center', gap: 4 },
  progressCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: professionalPalette.border },
  progressCircleActive: { backgroundColor: professionalPalette.olive },
  progressNumber: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  progressNumberActive: { color: professionalPalette.white },
  progressLabel: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 9.5 },
  progressLabelActive: { color: professionalPalette.olive, fontFamily: fontFamilies.body.bold },
  intro: { marginBottom: spacing.lg },
  eyebrow: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.pill, backgroundColor: professionalPalette.surfaceMuted, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 8 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: professionalPalette.gold },
  eyebrowText: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.medium, fontSize: 11.5 },
  title: { color: professionalPalette.text, fontFamily: fontFamilies.display.medium, fontSize: 27, lineHeight: 34 },
  body: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 14, lineHeight: 22, marginTop: 5 },
  card: { borderWidth: 1, borderColor: professionalPalette.border, borderRadius: radii.md, backgroundColor: professionalPalette.white, padding: spacing.md },
  chip: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: professionalPalette.border, borderRadius: radii.pill, backgroundColor: professionalPalette.white, paddingHorizontal: 15 },
  chipSelected: { borderColor: professionalPalette.olive, backgroundColor: professionalPalette.olive },
  chipLabel: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.medium, fontSize: 12.5 },
  chipLabelSelected: { color: professionalPalette.white, fontFamily: fontFamilies.body.semibold },
  pressed: { opacity: 0.72 },
  ethiopicRegular: { fontFamily: fontFamilies.ethiopic.regular },
  ethiopicSemibold: { fontFamily: fontFamilies.ethiopic.semibold },
});

/** Inline message under a single field once the professional tried to continue. */
export function FieldError({ message, visible }: { message: string; visible: boolean }) {
  if (!visible) return null;
  return <Text accessibilityLiveRegion="polite" style={onboardingStyles.error}>{message}</Text>;
}

/** Names every incomplete field on the step so nothing has to be guessed. */
export function MissingFieldList({ title, issues }: { title: string; issues: readonly string[] }) {
  if (!issues.length) return null;
  return (
    <View accessibilityLiveRegion="polite" style={onboardingStyles.missingList}>
      <Text style={onboardingStyles.error}>{title}</Text>
      {issues.map((issue) => <Text key={issue} style={onboardingStyles.missingItem}>• {issue}</Text>)}
    </View>
  );
}
