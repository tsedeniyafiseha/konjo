import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamilies, layout, onboardingPalette } from '@/theme/tokens';
import { ClientLanguageToggle } from '@/localization/client-language-toggle';
import { usePublicClientCopy } from '@/localization/use-public-client-copy';

const roleHero = require('../../../assets/images/konjo/onboarding-barber.jpeg');
const roleOverlay = require('../../../assets/images/konjo/role-overlay.svg');

interface RoleCardProps {
  icon: string;
  title: string;
  description: string;
  action: string;
  outlined?: boolean;
  onPress: () => void;
  isAmharic: boolean;
}

function RoleCard({ icon, title, description, action, outlined = false, onPress, isAmharic }: RoleCardProps) {
  return (
    <View style={styles.roleCard}>
      <Text accessibilityElementsHidden style={styles.roleIcon}>
        {icon}
      </Text>
      <Text style={[styles.roleTitle, isAmharic && styles.ethiopicSemibold]}>{title}</Text>
      <Text style={[styles.roleDescription, isAmharic && styles.ethiopicRegular]}>{description}</Text>
      <Pressable
        accessibilityLabel={action}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.roleButton,
          outlined ? styles.outlinedButton : styles.filledButton,
          pressed && styles.pressed,
        ]}>
        <Text style={[outlined ? styles.outlinedButtonLabel : styles.filledButtonLabel, isAmharic && styles.ethiopicSemibold]}>{action}</Text>
      </Pressable>
    </View>
  );
}

export function RoleSelectionScreen() {
  const { isAmharic, t } = usePublicClientCopy();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pageWidth = Math.min(width, layout.contentMaxWidth);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={[styles.page, { width: pageWidth }]}>
        <Image
          accessibilityLabel={t('roleHeroImage')}
          contentFit="cover"
          contentPosition="center"
          source={roleHero}
          style={StyleSheet.absoluteFill}
        />
        <Image contentFit="fill" source={roleOverlay} style={styles.visualOverlay} />
        <View style={[styles.languageToggle, { top: Math.max(18, insets.top + 8) }]}><ClientLanguageToggle light /></View>
        <View style={[styles.content, { paddingBottom: Math.max(32, insets.bottom + 20) }]}>
          <Text accessibilityRole="header" style={[styles.heading, isAmharic && styles.ethiopicSemibold]}>
            {t('roleSelectionTitle')}
          </Text>
          <View style={styles.cards}>
            <RoleCard
              action={t('continueAsClient')}
              description={t('clientRoleDescription')}
              icon="👩🏾"
              isAmharic={isAmharic}
              onPress={() => router.push('/client-auth')}
              title={t('clientRoleTitle')}
            />
            <RoleCard
              action={t('continueAsProfessional')}
              description={t('professionalRoleDescription')}
              icon="✨"
              isAmharic={isAmharic}
              onPress={() => router.push('/professional-language')}
              outlined
              title={t('professionalRoleTitle')}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: onboardingPalette.forest,
  },
  page: {
    flex: 1,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  visualOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
  },
  languageToggle: { position: 'absolute', right: 20, zIndex: 2 },
  content: {
    gap: 14,
    paddingHorizontal: 20,
  },
  heading: {
    color: onboardingPalette.canvas,
    fontFamily: fontFamilies.display.medium,
    fontSize: 26,
    lineHeight: 32,
    marginBottom: 2,
  },
  cards: {
    flexDirection: 'row',
    gap: 10,
  },
  roleCard: {
    flex: 1,
    minHeight: 212,
    borderRadius: 12,
    backgroundColor: 'rgba(250, 249, 245, 0.96)',
    padding: 14,
  },
  roleIcon: {
    fontSize: 20,
    lineHeight: 26,
    marginBottom: 6,
  },
  roleTitle: {
    color: onboardingPalette.text,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 14.5,
    lineHeight: 20,
  },
  roleDescription: {
    flex: 1,
    color: onboardingPalette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 4,
  },
  roleButton: {
    minHeight: 44,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  filledButton: {
    backgroundColor: onboardingPalette.olive,
  },
  outlinedButton: {
    borderWidth: 1.5,
    borderColor: onboardingPalette.olive,
    backgroundColor: onboardingPalette.white,
  },
  filledButtonLabel: {
    color: onboardingPalette.white,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 12.5,
    lineHeight: 17,
    textAlign: 'center',
  },
  outlinedButtonLabel: {
    color: onboardingPalette.olive,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 12.5,
    lineHeight: 17,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  ethiopicRegular: { fontFamily: fontFamilies.ethiopic.regular },
  ethiopicSemibold: { fontFamily: fontFamilies.ethiopic.semibold },
});
