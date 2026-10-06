import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fontFamilies, palette, spacing } from '@/theme/tokens';

/**
 * Landing for professional email links. Professionals sign in with their phone
 * number and password, so an email link only needs to bring them back to the
 * Konjo Pro sign-in, where "Forgot password" completes the reset by SMS.
 */
export default function ProfessionalEmailRoute() {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>Konjo Pro</Text>
        <Text style={styles.body}>Your link has been received. Sign in with your phone number to continue, or use “Forgot password” to reset it by SMS code.</Text>
        <Pressable accessibilityRole="button" onPress={() => router.replace('/professional-language' as Href)} style={styles.button}>
          <Text style={styles.buttonLabel}>Open Konjo Pro sign-in</Text>
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
