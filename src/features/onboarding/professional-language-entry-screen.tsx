import type { Href } from 'expo-router';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { KonjoButton } from '@/components/ui/konjo-button';
import { useAuthSession } from '@/features/auth/session-context';
import type { ProfessionalAppLanguage } from '@/features/professional/registration/professional-registration-types';
import { fontFamilies, layout, onboardingPalette, radii, spacing } from '@/theme/tokens';

const options: readonly { id: ProfessionalAppLanguage; name: string; action: string }[] = [
  { id: 'am', name: 'አማርኛ', action: 'በአማርኛ ይቀጥሉ' },
  { id: 'om', name: 'Afaan Oromoo', action: 'Afaan Oromootiin itti fufi' },
  { id: 'en', name: 'English', action: 'Continue in English' },
];

export function ProfessionalLanguageEntryScreen() {
  const { width } = useWindowDimensions();
  const { session } = useAuthSession();
  const [language, setLanguage] = useState<ProfessionalAppLanguage>('en');
  if (session?.role === 'professional' && session.phoneNumber && session.phoneVerified !== false) {
    return <Redirect href="/pro" />;
  }
  const copy = {
    en: { title: 'Welcome, professional', language: 'Choose your language to continue' },
    am: { title: 'እንኳን ደህና መጡ', language: 'ለመቀጠል ቋንቋዎን ይምረጡ' },
    om: { title: 'Baga nagaan dhuftan', language: 'Itti fufuuf afaan keessan filadhaa' },
  }[language];
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={[styles.page, { width: Math.min(width, layout.contentMaxWidth) }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/role-select')} style={styles.backButton}>
            <KonjoIcon color={onboardingPalette.text} name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={20} />
          </Pressable>
          <View style={styles.icon}><KonjoIcon color={onboardingPalette.olive} name={{ ios: 'globe', android: 'language', web: 'language' }} size={32} /></View>
          <Text accessibilityRole="header" style={[styles.title, language !== 'am' && { fontFamily: fontFamilies.body.semibold }]}>{copy.title}</Text>
          <Text style={styles.subtitle}>{copy.language}</Text>
          <View style={styles.options}>
            {options.map((option) => (
              <Pressable
                key={option.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: language === option.id }}
                onPress={() => setLanguage(option.id)}
                style={({ pressed }) => [styles.option, language === option.id && { borderColor: onboardingPalette.olive, borderWidth: 2 }, pressed && styles.pressed]}>
                <Text style={[styles.optionName, option.id === 'am' && styles.ethiopicSemibold]}>{option.name}</Text>
                {language === option.id ? <KonjoIcon color={onboardingPalette.olive} name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={19} /> : null}
              </Pressable>
            ))}
          </View>
          <KonjoButton style={styles.signInLink} label={options.find((option) => option.id === language)!.action} variant="dark" onPress={() => router.push(`/professional-auth?language=${language}` as Href)} />
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: onboardingPalette.canvas },
  safeArea: { flex: 1, alignItems: 'center' },
  page: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: layout.horizontalPadding, paddingTop: 76, paddingBottom: spacing.lg },
  backButton: { position: 'absolute', top: spacing.md, left: layout.horizontalPadding, width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: onboardingPalette.border, backgroundColor: onboardingPalette.white, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9F0E6', alignSelf: 'center', marginBottom: spacing.lg },
  title: { color: onboardingPalette.text, fontFamily: fontFamilies.ethiopic.semibold, fontSize: 29, textAlign: 'center' },
  oromoTitle: { color: onboardingPalette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 20, textAlign: 'center', marginTop: 5 },
  subtitle: { color: onboardingPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13.5, textAlign: 'center', marginTop: 8 },
  options: { gap: 10, marginTop: spacing.xl },
  option: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: onboardingPalette.border, borderRadius: radii.md, backgroundColor: onboardingPalette.white, paddingHorizontal: spacing.md },
  optionName: { color: onboardingPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 17 },
  optionAction: { color: onboardingPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 11.5, marginTop: 3 },
  ethiopicSemibold: { fontFamily: fontFamilies.ethiopic.semibold },
  ethiopicRegular: { fontFamily: fontFamilies.ethiopic.regular },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  signInLink: { alignItems: 'center', marginTop: spacing.lg, padding: spacing.sm },
  signInText: { color: onboardingPalette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 13, textDecorationLine: 'underline' },
});
