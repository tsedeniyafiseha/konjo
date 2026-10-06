import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fontFamilies, palette, spacing } from '@/theme/tokens';

export default function NotFoundRoute() {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>Page not found</Text>
        <Text style={styles.body}>That link does not match anything in Konjo.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/' as Href)} style={styles.button}>
          <Text style={styles.buttonLabel}>Go to Konjo</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 420, gap: spacing.md },
  title: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 26 },
  body: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 14, lineHeight: 21 },
  button: { minHeight: 48, borderRadius: 10, backgroundColor: palette.olive, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 15 },
});
