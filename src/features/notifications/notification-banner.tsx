import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { fontFamilies, palette, radii, spacing } from '@/theme/tokens';
import { useOptionalNotifications } from './notification-context';

/** Top-of-screen toast for a notification that arrived while the app is open. */
export function NotificationBanner() {
  const notifications = useOptionalNotifications();
  const insets = useSafeAreaInsets();
  const banner = notifications?.banner;
  if (!notifications || !banner) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: Math.max(insets.top, 10) + 6 }]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => notifications.open(banner)}
        style={({ pressed }) => [styles.banner, pressed && styles.pressed]}>
        <View style={styles.icon}><KonjoIcon color={palette.white} name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }} size={16} /></View>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.title}>{banner.title}</Text>
          <Text numberOfLines={2} style={styles.body}>{banner.body}</Text>
        </View>
        <Pressable accessibilityLabel="Dismiss" accessibilityRole="button" hitSlop={8} onPress={notifications.dismissBanner} style={styles.dismiss}>
          <KonjoIcon color={palette.textMuted} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={15} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50, paddingHorizontal: spacing.md },
  banner: { width: '100%', maxWidth: 480, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radii.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, padding: 12, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: palette.olive, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  title: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  body: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 17, marginTop: 1 },
  dismiss: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
});
