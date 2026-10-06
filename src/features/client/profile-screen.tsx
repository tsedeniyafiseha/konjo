import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTabBar } from '@/components/navigation/app-tab-bar';
import { KonjoIcon } from '@/components/ui/konjo-icon';
import { SettingsRow } from '@/features/client/client-screen-components';
import { useAuthSession } from '@/features/auth/session-context';
import { useClientAccount } from '@/features/client/account/client-account-context';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, layout, palette, radii, spacing } from '@/theme/tokens';

export function ProfileScreen() {
  const { t } = useClientCopy();
  const { signOut } = useAuthSession();
  const { account, updateProfile } = useClientAccount();
  const [signingOut, setSigningOut] = useState(false);
  if (!account) return null;
  const { profile } = account;
  const initials = profile.fullName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const contact = profile.email ?? profile.phoneNumber ?? t('contactNotAdded');

  const logout = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/welcome' as Href);
    } catch (error) {
      if (__DEV__) console.error('Unable to sign out.', error);
      setSigningOut(false);
    }
  };

  const createProfessionalAccount = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace('/professional-language' as Href);
    } catch (error) {
      if (__DEV__) console.error('Unable to open professional registration.', error);
      setSigningOut(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Text accessibilityRole="header" style={styles.title}>{t('navProfile')}</Text>
            <View style={styles.identityCard}>
              <View style={styles.avatar}><Text style={styles.avatarLabel}>{initials}</Text></View>
              <View style={styles.identityCopy}>
                <Text style={styles.name}>{profile.fullName}</Text>
                <Text style={styles.phone}>{contact}</Text>
              </View>
              <Pressable
                accessibilityLabel={t('editProfile')}
                accessibilityRole="button"
                onPress={() => router.push('/settings/profile' as Href)}
                style={styles.editButton}>
                <KonjoIcon color={palette.text} name={{ ios: 'pencil', android: 'edit', web: 'edit' }} size={17} />
              </Pressable>
            </View>

            <View style={styles.settingsCard}>
              <SettingsRow
                icon={{ ios: 'mappin', android: 'location_on', web: 'location_on' }}
                label={t('savedAddresses')}
                onPress={() => router.push('/settings/addresses' as Href)}
              />
              <SettingsRow
                icon={{ ios: 'creditcard', android: 'credit_card', web: 'credit_card' }}
                label={t('paymentMethods')}
                onPress={() => router.push('/settings/payment-methods' as Href)}
              />
              <SettingsRow
                icon={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
                label={t('notifications')}
                onPress={() => router.push('/settings/notifications' as Href)}
              />
              <SettingsRow
                icon={{ ios: 'globe', android: 'language', web: 'language' }}
                label={t('language')}
                trailing={
                  <View style={styles.languageControl}>
                    <Pressable onPress={() => updateProfile({ preferredLanguage: 'en' })} style={[styles.languageButton, profile.preferredLanguage === 'en' && styles.languageButtonActive]}>
                      <Text style={[styles.languageLabel, profile.preferredLanguage === 'en' && styles.languageLabelActive]}>EN</Text>
                    </Pressable>
                    <Pressable onPress={() => updateProfile({ preferredLanguage: 'am' })} style={[styles.languageButton, profile.preferredLanguage === 'am' && styles.languageButtonActive]}>
                      <Text style={[styles.languageLabel, profile.preferredLanguage === 'am' && styles.languageLabelActive]}>አማ</Text>
                    </Pressable>
                  </View>
                }
              />
              <SettingsRow
                icon={{ ios: 'shield', android: 'shield', web: 'shield' }}
                label={t('privacySecurity')}
                onPress={() => router.push('/settings/privacy' as Href)}
              />
              <SettingsRow
                icon={{ ios: 'questionmark.circle', android: 'help_outline', web: 'help_outline' }}
                label={t('helpSupport')}
                last
                onPress={() => router.push('/settings/help' as Href)}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: signingOut, disabled: signingOut }}
              disabled={signingOut}
              onPress={createProfessionalAccount}
              style={styles.professionalAccountButton}>
              <Text style={styles.professionalAccountLabel}>{t('createProfessionalAccount')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: signingOut, disabled: signingOut }}
              disabled={signingOut}
              onPress={logout}
              style={styles.logoutButton}>
              <Text style={styles.logoutLabel}>{signingOut ? t('loggingOut') : t('logOut')}</Text>
            </Pressable>
            <Text style={styles.version}>{t('versionLocation')}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
      <AppTabBar activeTab="Profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  safeArea: { flex: 1 },
  scrollContent: { alignItems: 'center', paddingBottom: spacing.xl },
  content: { width: '100%', maxWidth: layout.contentMaxWidth },
  title: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 26, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  identityCard: { minHeight: 90, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: palette.sageSoft, alignItems: 'center', justifyContent: 'center' },
  avatarLabel: { color: palette.olive, fontFamily: fontFamilies.display.medium, fontSize: 20 },
  identityCopy: { flex: 1 },
  name: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 16 },
  phone: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, marginTop: 2 },
  editButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  settingsCard: { overflow: 'hidden', borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, marginHorizontal: spacing.lg, marginTop: spacing.lg },
  languageControl: { flexDirection: 'row', borderRadius: radii.pill, backgroundColor: palette.surfaceMuted, padding: 3 },
  languageButton: { borderRadius: radii.pill, paddingHorizontal: 11, paddingVertical: 5 },
  languageButtonActive: { backgroundColor: palette.surface },
  languageLabel: { color: palette.textMuted, fontFamily: fontFamilies.body.semibold, fontSize: 11 },
  languageLabelActive: { color: palette.text },
  logoutButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  logoutLabel: { color: palette.error, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  professionalAccountButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginHorizontal: spacing.lg, marginTop: spacing.md, borderWidth: 1, borderColor: palette.olive, borderRadius: radii.md, paddingHorizontal: spacing.md },
  professionalAccountLabel: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 13.5, textAlign: 'center' },
  version: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11, marginTop: spacing.sm, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
