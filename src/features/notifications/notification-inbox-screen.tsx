import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { fontFamilies, layout, palette, professionalPalette, radii, spacing } from '@/theme/tokens';
import { type InboxNotification, useNotifications } from './notification-context';

const copy = {
  en: { title: 'Notifications', empty: 'No notifications yet. Booking updates will appear here.', markAll: 'Mark all as read', back: 'Back' },
  am: { title: 'ማሳወቂያዎች', empty: 'እስካሁን ማሳወቂያ የለም። የቦታ ማስያዣ ዝማኔዎች እዚህ ይታያሉ።', markAll: 'ሁሉንም እንደተነበበ ምልክት አድርግ', back: 'ተመለስ' },
  om: { title: 'Beeksisa', empty: 'Beeksisni hin jiru. Odeeffannoon beellamaa asitti mul’ata.', markAll: 'Hunda akka dubbifametti mallatteessi', back: 'Duubatti' },
} as const;

function relativeTime(iso: string, language: keyof typeof copy): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return language === 'am' ? 'አሁን' : language === 'om' ? 'amma' : 'now';
  if (minutes < 60) return `${minutes}${language === 'am' ? ' ደቂቃ' : language === 'om' ? ' daq' : ' min'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}${language === 'am' ? ' ሰዓት' : language === 'om' ? ' sa’a' : ' h'}`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function NotificationInboxScreen({ language = 'en' }: { language?: keyof typeof copy }) {
  const { role, notifications, unreadCount, markAllRead, open } = useNotifications();
  const text = copy[language];
  const colors = role === 'professional' ? professionalPalette : palette;
  const renderItem = ({ item }: { item: InboxNotification }) => (
    <Pressable accessibilityRole="button" onPress={() => open(item)} style={({ pressed }) => [styles.item, !item.readAt && styles.itemUnread, pressed && styles.pressed]}>
      <View style={[styles.dot, item.readAt && styles.dotRead]} />
      <View style={styles.itemCopy}>
        <Text style={styles.itemTitle}>{item.title}</Text>
        <Text style={styles.itemBody}>{item.body}</Text>
      </View>
      <Text style={styles.time}>{relativeTime(item.createdAt, language)}</Text>
    </Pressable>
  );
  return (
    <View style={[styles.screen, { backgroundColor: colors.canvas }]}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable accessibilityLabel={text.back} accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace(role === 'professional' ? '/pro/home' : '/home')} style={styles.backButton}>
            <KonjoIcon color={palette.text} name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={20} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>{text.title}</Text>
          {unreadCount ? <Pressable accessibilityRole="button" onPress={() => { void markAllRead(); }}><Text style={styles.markAll}>{text.markAll}</Text></Pressable> : <View style={styles.headerSpacer} />}
        </View>
        <FlatList
          contentContainerStyle={styles.list}
          data={notifications}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>{text.empty}</Text>}
          renderItem={renderItem}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  backButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 24 },
  markAll: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  headerSpacer: { width: 4 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, flexGrow: 1 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: radii.md, padding: spacing.md, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
  itemUnread: { borderColor: palette.olive },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.olive, marginTop: 6 },
  dotRead: { backgroundColor: 'transparent' },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitle: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  itemBody: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  time: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11 },
  separator: { height: 10 },
  empty: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13.5, textAlign: 'center', paddingTop: 80 },
  pressed: { opacity: 0.8 },
});
