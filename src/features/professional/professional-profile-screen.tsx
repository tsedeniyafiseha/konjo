import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ComponentProps } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { ProfessionalSwitch, ProfessionalTabScreen, proSharedStyles } from '@/features/professional/professional-components';
import { useProfessionalData } from '@/features/professional/professional-data-context';
import { useProfessionalRegistration } from '@/features/professional/registration/professional-registration-context';
import { useAuthSession } from '@/features/auth/session-context';
import { professionalAccountService } from '@/features/professional/professional-account-service';
import { PortfolioGrid } from '@/features/professional/documents/portfolio-grid';
import { professionalPortfolioCopy } from '@/features/professional/registration/professional-portfolio-copy';
import { localizedSpecialtyName } from '@/features/professional/registration/professional-onboarding-labels';
import { useProfessionalCopy } from '@/localization/use-professional-copy';
import { fontFamilies, professionalPalette, spacing } from '@/theme/tokens';

interface ProfileRowProps {
  icon: ComponentProps<typeof KonjoIcon>['name'];
  label: string;
  href: Href;
  status?: string;
  last?: boolean;
}

function ProfileRow({ icon, label, href, status, last = false }: ProfileRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.menuRow, !last && styles.menuBorder, pressed && styles.pressed]}>
      <KonjoIcon color={professionalPalette.olive} name={icon} size={20} />
      <Text style={styles.menuLabel}>{label}</Text>
      {status ? <Text style={styles.approvedBadge}>{status}</Text> : <KonjoIcon color={professionalPalette.textMuted} name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={17} />}
    </Pressable>
  );
}

function ProfileMetric({ value, label }: { value: string; label: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

export function ProfessionalProfileScreen() {
  const { available, completedCount, toggleAvailable, travelZones } = useProfessionalData();
  const { application } = useProfessionalRegistration();
  const { session, signOut } = useAuthSession();
  const { language, t } = useProfessionalCopy();
  const displayName = application?.profile.displayName ?? t('professionalFallbackName');
  const initials = displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const zoneLabels = travelZones.filter((zone) => zone.active).map((zone) => zone.label).join(', ');
  const reviewStatusLabel = ({ approved: t('statusApproved'), pending: t('statusPending'), changes_requested: t('statusChangesRequested'), rejected: t('statusRejected'), suspended: t('statusSuspended') } as Record<string, string>)[application?.status ?? ''] ?? t('statusPending');
  const confirmDeleteAccount = () => {
    Alert.alert(
      t('deleteTitle'),
      t('deleteBody'),
      [
        { text: t('keepAccount'), style: 'cancel' },
        {
          text: t('deleteConfirm'), style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                if (session?.accessToken) await professionalAccountService.deleteAccount(session.accessToken);
                await signOut();
                router.replace('/welcome' as Href);
              } catch (error) {
                Alert.alert(t('deleteFailedTitle'), error instanceof Error ? error.message : t('deleteFailedBody'));
              }
            })();
          },
        },
      ],
    );
  };
  const logout = async () => {
    try {
      await signOut();
      router.replace('/welcome' as Href);
    } catch (error) {
      if (__DEV__) console.error('Unable to sign out of the professional workspace.', error);
    }
  };

  return (
    <ProfessionalTabScreen activeTab="Profile">
      <StatusBar style="dark" />
      <Text accessibilityRole="header" style={proSharedStyles.pageTitle}>{t('profileTitle')}</Text>
      <View style={styles.identity}>
        <View accessibilityLabel={t('profileAccessibility', { name: displayName })} style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
        <View style={styles.identityCopy}>
          <View style={styles.nameRow}><Text style={styles.name}>{displayName}</Text><KonjoIcon color={professionalPalette.olive} name={{ ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' }} size={16} /></View>
          <Text style={styles.specialty}>{localizedSpecialtyName(application?.profile.specialty ?? null, language)}</Text>
          <Text style={styles.rating}>{t('newProfessional')}</Text>
        </View>
      </View>
      <Text style={styles.zonesBadge}>{t('zonesPrefix', { zones: zoneLabels || t('notSelected') })}</Text>
      <View style={styles.metrics}><ProfileMetric label={t('jobsDone')} value={`${completedCount}`} /><ProfileMetric label={t('experience')} value={t('yearsShort', { years: application?.profile.yearsExperience ?? 0 })} /><ProfileMetric label={t('repeats')} value="—" /><ProfileMetric label={t('onTime')} value="—" /></View>
      <View style={styles.availabilityCard}><Text style={styles.availabilityText}>{t('availableForBookings')}</Text><ProfessionalSwitch label={t('availableForBookings')} onChange={toggleAvailable} value={available} /></View>
      <View style={styles.portfolioSection}>
        <View style={styles.portfolioHeader}>
          <Text style={styles.portfolioTitle}>{professionalPortfolioCopy[language].manageTitle}</Text>
          <Text style={styles.portfolioHint}>{professionalPortfolioCopy[language].manageBody}</Text>
        </View>
        <PortfolioGrid language={language} />
      </View>
      <View style={styles.menu}>
        <ProfileRow href={'/pro/edit-profile' as Href} icon={{ ios: 'pencil', android: 'edit', web: 'edit' }} label={t('editProfileRow')} />
        <ProfileRow href={'/pro/services' as Href} icon={{ ios: 'creditcard', android: 'credit_card', web: 'credit_card' }} label={t('servicesRow')} />
        <ProfileRow href={'/pro/portfolio' as Href} icon={{ ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' }} label={t('portfolioRow')} />
        <ProfileRow href={'/pro/documents' as Href} icon={{ ios: 'shield', android: 'shield', web: 'shield' }} label={t('identityRow')} status={reviewStatusLabel} />
        <ProfileRow href={'/pro/zones' as Href} icon={{ ios: 'mappin', android: 'location_on', web: 'location_on' }} label={t('zonesRow')} />
        <ProfileRow href={'/pro/payout' as Href} icon={{ ios: 'calendar', android: 'account_balance_wallet', web: 'account_balance_wallet' }} label={t('payoutRow')} />
        <ProfileRow href={'/pro/language' as Href} icon={{ ios: 'globe', android: 'language', web: 'language' }} label={t('languageRow')} />
        <ProfileRow href={'/pro/help' as Href} icon={{ ios: 'questionmark.circle', android: 'help_outline', web: 'help_outline' }} label={t('helpRow')} last />
      </View>
      <Pressable accessibilityRole="button" onPress={logout} style={styles.logout}><Text style={styles.logoutLabel}>{t('logOut')}</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={confirmDeleteAccount} style={styles.deleteAccount}><Text style={styles.deleteAccountLabel}>{t('deleteAccount')}</Text></Pressable>
      <Text style={styles.version}>{t('version')}</Text>
    </ProfessionalTabScreen>
  );
}

const styles = StyleSheet.create({
  portfolioSection: { marginTop: spacing.lg, gap: spacing.sm, backgroundColor: professionalPalette.white, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 16, padding: spacing.md },
  portfolioHeader: { gap: 4 },
  portfolioTitle: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 16 },
  portfolioHint: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 18 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: spacing.lg, marginTop: 14 },
  avatar: { width: 70, height: 70, borderRadius: 14, backgroundColor: professionalPalette.olive, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: professionalPalette.white, fontFamily: fontFamilies.body.bold, fontSize: 21 },
  identityCopy: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: professionalPalette.text, fontFamily: fontFamilies.display.regular, fontSize: 21 },
  specialty: { color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, marginTop: 2 },
  rating: { color: professionalPalette.gold, fontFamily: fontFamilies.body.semibold, fontSize: 12, marginTop: 3 },
  zonesBadge: { alignSelf: 'flex-start', color: professionalPalette.textSecondary, fontFamily: fontFamilies.body.semibold, fontSize: 11.5, borderRadius: 99, backgroundColor: professionalPalette.surfaceMuted, marginLeft: spacing.lg, marginTop: 16, paddingHorizontal: 12, paddingVertical: 7 },
  metrics: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, marginTop: 18 },
  metric: { flex: 1, minHeight: 70, borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 8, backgroundColor: professionalPalette.white, alignItems: 'center', justifyContent: 'center', padding: 4 },
  metricValue: { color: professionalPalette.text, fontFamily: fontFamilies.body.bold, fontSize: 15 },
  metricLabel: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 9, marginTop: 2, textAlign: 'center' },
  availabilityCard: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 12, backgroundColor: professionalPalette.white, marginHorizontal: spacing.lg, marginTop: 18, paddingHorizontal: 16 },
  availabilityText: { color: professionalPalette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  menu: { overflow: 'hidden', borderWidth: 1, borderColor: professionalPalette.border, borderRadius: 12, backgroundColor: professionalPalette.white, marginHorizontal: spacing.lg, marginTop: 16 },
  menuRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  menuBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: professionalPalette.surfaceMuted },
  menuLabel: { flex: 1, color: professionalPalette.text, fontFamily: fontFamilies.body.medium, fontSize: 14 },
  approvedBadge: { color: professionalPalette.olive, fontFamily: fontFamilies.body.bold, fontSize: 10, borderRadius: 99, backgroundColor: professionalPalette.greenSoft, paddingHorizontal: 10, paddingVertical: 4 },
  logout: { minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  logoutLabel: { color: professionalPalette.danger, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  deleteAccount: { alignSelf: 'center', minHeight: 40, justifyContent: 'center', marginTop: 4 },
  deleteAccountLabel: { color: professionalPalette.danger, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  version: { color: professionalPalette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11, textAlign: 'center', marginTop: 8 },
  pressed: { opacity: 0.7 },
});
