import { Pressable, StyleSheet, Text, View } from 'react-native';

import { usePublicClientCopy } from '@/localization/use-public-client-copy';
import { fontFamilies, palette, radii } from '@/theme/tokens';

export function ClientLanguageToggle({ light = false }: { light?: boolean }) {
  const { language, setLanguage, t } = usePublicClientCopy();
  return (
    <View accessibilityLabel={t('appLanguage')} accessibilityRole="radiogroup" style={[styles.container, light && styles.containerLight]}>
      <LanguageChoice label="EN" light={light} onPress={() => setLanguage('en')} selected={language === 'en'} />
      <LanguageChoice label="አማ" light={light} onPress={() => setLanguage('am')} selected={language === 'am'} />
    </View>
  );
}

function LanguageChoice({ label, light, selected, onPress }: { label: string; light: boolean; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label === 'EN' ? 'English' : 'አማርኛ'}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected, light && styles.choiceLight, light && selected && styles.choiceLightSelected]}>
      <Text style={[styles.label, /[\u1200-\u137F]/.test(label) && styles.ethiopic, selected && styles.labelSelected, light && !selected && styles.labelLight, light && selected && styles.labelLightSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: 3, borderWidth: 1, borderColor: palette.border, borderRadius: radii.pill, backgroundColor: palette.surface, padding: 3 },
  containerLight: { borderColor: 'rgba(250,249,245,0.45)', backgroundColor: 'rgba(20,30,23,0.30)' },
  choice: { minWidth: 42, minHeight: 34, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  choiceSelected: { backgroundColor: palette.olive },
  choiceLight: { backgroundColor: 'transparent' },
  choiceLightSelected: { backgroundColor: palette.surface },
  label: { color: palette.textSecondary, fontFamily: fontFamilies.body.semibold, fontSize: 11 },
  ethiopic: { fontFamily: fontFamilies.ethiopic.semibold },
  labelSelected: { color: palette.white },
  labelLight: { color: palette.white },
  labelLightSelected: { color: palette.oliveDark },
});
