import type { Href } from 'expo-router';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view';
import { useProfessionalData } from '@/features/professional/professional-data-context';
import { useProfessionalCopy } from '@/localization/use-professional-copy';
import type { ProfessionalCopyKey } from '@/localization/professional-copy';
import { fontFamilies, layout, professionalPalette, radii, spacing } from '@/theme/tokens';

const tabs = [
  { label: 'Home', copyKey: 'tabHome', href: '/pro/home', icon: { ios: 'house', android: 'home', web: 'home' } as const },
  { label: 'Calendar', copyKey: 'tabCalendar', href: '/pro/calendar', icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' } as const },
  { label: 'Earnings', copyKey: 'tabEarnings', href: '/pro/earnings', icon: { ios: 'dollarsign', android: 'attach_money', web: 'attach_money' } as const },
  { label: 'Profile', copyKey: 'tabProfile', href: '/pro/profile', icon: { ios: 'person', android: 'person', web: 'person' } as const },
] as const satisfies readonly { label: string; copyKey: ProfessionalCopyKey; href: string; icon: unknown }[];

export type ProfessionalTab = (typeof tabs)[number]['label'];

export function ProfessionalTabBar({ activeTab }: { activeTab: ProfessionalTab }) {
  const { t } = useProfessionalCopy();
  return (
    <SafeAreaView edges={['bottom']} style={styles.tabSafeArea}>
      <View accessibilityRole="tablist" style={styles.tabRow}>
        {tabs.map((tab) => {
          const selected = tab.label === activeTab;
          const color = selected ? professionalPalette.olive : professionalPalette.textMuted;
          return (
            <Pressable
              key={tab.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => router.replace(tab.href as Href)}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
              <KonjoIcon color={color} name={tab.icon} size={24} />
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{t(tab.copyKey)}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export function ProfessionalTabScreen({
  activeTab,
  children,
  contentStyle,
}: {
  activeTab: ProfessionalTab;
  children: ReactNode;
  contentStyle?: ComponentProps<typeof ScrollView>['contentContainerStyle'];
}) {
  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardAvoider}>
          <KeyboardAwareScrollView
            contentContainerStyle={[styles.scrollContent, contentStyle]}
            showsVerticalScrollIndicator={false}
            style={styles.scrollView}>
            {children}
          </KeyboardAwareScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <ProfessionalTabBar activeTab={activeTab} />
    </View>
  );
}

export function ProfessionalDetailScreen({ children }: { children: ReactNode }) {
  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardAvoider}>
          <KeyboardAwareScrollView
            contentContainerStyle={styles.detailContent}
            showsVerticalScrollIndicator={false}
            style={styles.scrollView}>
            {children}
          </KeyboardAwareScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

export function ProfessionalBackHeader({ title }: { title: string }) {
  const { t } = useProfessionalCopy();
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/pro/profile' as Href);
  };

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={t('goBack')}
        accessibilityRole="button"
        hitSlop={8}
        onPress={goBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
        <KonjoIcon color={professionalPalette.text} name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={19} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>
    </View>
  );
}

export function ProfessionalSwitch({ value, onChange, label }: { value: boolean; onChange: () => void; label: string }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={onChange}
      style={[styles.switchTrack, value && styles.switchTrackActive]}>
      <View style={[styles.switchThumb, value && styles.switchThumbActive]} />
    </Pressable>
  );
}

export function ProfessionalToast() {
  const { toast } = useProfessionalData();
  if (!toast) return null;
  return (
    <View accessibilityLiveRegion="polite" style={styles.toast}>
      <Text style={styles.toastText}>{toast}</Text>
    </View>
  );
}

export const proSharedStyles = StyleSheet.create({
  pageTitle: {
    color: professionalPalette.text,
    fontFamily: fontFamilies.display.medium,
    fontSize: 30,
    lineHeight: 38,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  card: {
    borderWidth: 1,
    borderColor: professionalPalette.border,
    borderRadius: 12,
    backgroundColor: professionalPalette.white,
  },
  eyebrow: {
    color: professionalPalette.textMuted,
    fontFamily: fontFamilies.body.bold,
    fontSize: 12,
    letterSpacing: 0.5,
  },
  body: {
    color: professionalPalette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 13.5,
    lineHeight: 20,
  },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: professionalPalette.canvas },
  safeArea: { flex: 1, alignItems: 'center' },
  keyboardAvoider: { flex: 1, width: '100%', alignItems: 'center' },
  scrollView: { width: '100%' },
  scrollContent: { width: '100%', maxWidth: layout.contentMaxWidth, paddingBottom: spacing.xl },
  detailContent: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', paddingBottom: spacing.xl },
  tabSafeArea: { backgroundColor: professionalPalette.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: professionalPalette.border },
  tabRow: { height: 66, flexDirection: 'row', alignItems: 'center' },
  tab: { flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tabLabel: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.medium, fontSize: 10.5 },
  tabLabelActive: { color: professionalPalette.olive, fontFamily: fontFamilies.body.bold },
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  backButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: professionalPalette.border, backgroundColor: professionalPalette.white, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 17 },
  switchTrack: { width: 44, height: 26, borderRadius: radii.pill, backgroundColor: professionalPalette.border, justifyContent: 'center', paddingHorizontal: 3 },
  switchTrackActive: { backgroundColor: professionalPalette.sage },
  switchThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: professionalPalette.white },
  switchThumbActive: { alignSelf: 'flex-end' },
  toast: { position: 'absolute', left: 20, right: 20, bottom: 92, borderRadius: 10, backgroundColor: professionalPalette.text, paddingHorizontal: 18, paddingVertical: 14, zIndex: 50 },
  toastText: { color: professionalPalette.white, fontFamily: fontFamilies.body.semibold, fontSize: 13.5, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
