import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fontFamilies } from '@/theme/tokens';
import { openLegalPage } from './support-links';

const labels = {
  en: { terms: 'Terms of service', privacy: 'Privacy policy' },
  am: { terms: 'የአገልግሎት ውሎች', privacy: 'የግላዊነት መመሪያ' },
  om: { terms: 'Haala tajaajilaa', privacy: 'Imaammata iccitii' },
} as const;

/** Tappable Terms and Privacy links, for consent rows and settings screens. */
export function LegalLinks({ language = 'en', color, align = 'center' }: { language?: keyof typeof labels; color: string; align?: 'center' | 'left' }) {
  const copy = labels[language] ?? labels.en;
  return (
    <View style={[styles.row, align === 'left' && styles.left]}>
      <Pressable accessibilityRole="link" hitSlop={6} onPress={() => { void openLegalPage('terms'); }}>
        <Text style={[styles.link, { color }]}>{copy.terms}</Text>
      </Pressable>
      <Text style={[styles.dot, { color }]}>·</Text>
      <Pressable accessibilityRole="link" hitSlop={6} onPress={() => { void openLegalPage('privacy'); }}>
        <Text style={[styles.link, { color }]}>{copy.privacy}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 },
  left: { justifyContent: 'flex-start' },
  link: { fontFamily: fontFamilies.body.semibold, fontSize: 12.5, textDecorationLine: 'underline' },
  dot: { fontFamily: fontFamilies.body.regular, fontSize: 12.5 },
});
