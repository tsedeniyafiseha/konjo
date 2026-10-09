import { Image } from 'expo-image';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTabBar } from '@/components/navigation/app-tab-bar';
import { KonjoIcon } from '@/components/ui/konjo-icon';
import { useClientData } from '@/features/client/client-data-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, layout, palette, spacing } from '@/theme/tokens';

export function FavouritesScreen() {
  const { t } = useClientCopy();
  const { favouriteIds, toggleFavourite } = useClientData();
  const { professionals } = useDiscovery();
  const favourites = professionals.filter((professional) => favouriteIds.has(professional.id));

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Text accessibilityRole="header" style={styles.title}>{t('navFavourites')}</Text>
            <View style={styles.list}>
              {favourites.map((professional) => (
                <View key={professional.id} style={styles.card}>
                  <Pressable
                    accessibilityLabel={`${t('viewProfessional')}: ${professional.name}`}
                    accessibilityRole="button"
                    onPress={() =>
                      router.push(`/professional/${encodeURIComponent(professional.id)}` as Href)
                    }
                    style={styles.identityPressable}>
                    <View style={styles.avatar}>
                      {professional.image ? (
                        <Image contentFit="cover" source={professional.image} style={StyleSheet.absoluteFill} />
                      ) : (
                        <Text style={styles.initials}>{professional.initials}</Text>
                      )}
                    </View>
                    <View style={styles.copy}>
                      <Text style={styles.name}>{professional.name}</Text>
                      <Text style={styles.service}>{professional.service}</Text>
                      <Text style={styles.rating}>★ {professional.rating} · ETB {professional.priceFrom}</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityLabel={`${t('removeFavourite')}: ${professional.name}`}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => toggleFavourite(professional.id)}
                    style={({ pressed }) => [styles.heartButton, pressed && styles.pressed]}>
                    <KonjoIcon
                      color={palette.error}
                      name={{ ios: 'heart.fill', android: 'favorite', web: 'favorite' }}
                      size={18}
                    />
                  </Pressable>
                </View>
              ))}
            </View>
            {!favourites.length ? (
              <View style={styles.emptyState}>
                <KonjoIcon
                  color={palette.textMuted}
                  name={{ ios: 'heart', android: 'favorite_border', web: 'favorite_border' }}
                  size={42}
                />
                <Text style={styles.emptyCopy}>
                  {t('noFavourites')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.replace('/home' as Href)}
                  style={styles.browseButton}>
                  <Text style={styles.browseLabel}>{t('browseSpecialists')}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
      <AppTabBar activeTab="Favourites" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  safeArea: { flex: 1 },
  scrollContent: { alignItems: 'center', paddingBottom: spacing.xl },
  content: { width: '100%', maxWidth: layout.contentMaxWidth },
  title: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 26, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  list: { gap: 10, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  card: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: 10, backgroundColor: palette.surface, padding: spacing.sm },
  identityPressable: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 52, height: 52, borderRadius: 10, overflow: 'hidden', backgroundColor: palette.sageSoft, alignItems: 'center', justifyContent: 'center' },
  initials: { color: palette.olive, fontFamily: fontFamilies.display.regular, fontSize: 18 },
  copy: { flex: 1 },
  name: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14.5 },
  service: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, marginTop: 1 },
  rating: { color: palette.gold, fontFamily: fontFamilies.body.semibold, fontSize: 12, marginTop: 3 },
  heartButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 64 },
  emptyCopy: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 14, lineHeight: 21, marginTop: spacing.sm, textAlign: 'center' },
  browseButton: { minHeight: 46, borderRadius: 6, backgroundColor: palette.sage, justifyContent: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.md },
  browseLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  pressed: { opacity: 0.7 },
});
