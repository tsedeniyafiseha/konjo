import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, palette, spacing } from '@/theme/tokens';

const tabs = [
  { label: 'Home', copyKey: 'navHome', href: '/home', icon: { ios: 'house.fill', android: 'home', web: 'home' } as const },
  { label: 'Bookings', copyKey: 'navBookings', href: '/bookings', icon: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' } as const },
  { label: 'Favourites', copyKey: 'navFavourites', href: '/favourites', icon: { ios: 'heart', android: 'favorite', web: 'favorite' } as const },
  { label: 'Profile', copyKey: 'navProfile', href: '/profile', icon: { ios: 'person', android: 'person', web: 'person' } as const },
] as const;

interface AppTabBarProps {
  activeTab: (typeof tabs)[number]['label'];
}

export function AppTabBar({ activeTab }: AppTabBarProps) {
  const { t } = useClientCopy();
  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <View accessibilityRole="tablist" style={styles.tabRow}>
        {tabs.map((tab) => {
          const selected = tab.label === activeTab;
          const color = selected ? palette.olive : palette.textMuted;

          return (
            <Pressable
              key={tab.label}
              accessibilityLabel={t(tab.copyKey)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => router.replace(tab.href as Href)}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
              <KonjoIcon color={color} name={tab.icon} size={25} />
              <Text style={[styles.label, selected && styles.selectedLabel]}>{t(tab.copyKey)}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: palette.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  tabRow: {
    height: 66,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  label: {
    color: palette.textMuted,
    fontFamily: fontFamilies.body.medium,
    fontSize: 11,
  },
  selectedLabel: {
    color: palette.olive,
    fontFamily: fontFamilies.body.bold,
  },
  pressed: { opacity: 0.68 },
});
