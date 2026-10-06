import { Image } from 'expo-image';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppTabBar } from '@/components/navigation/app-tab-bar';
import { HorizontalScrollView } from '@/components/ui/horizontal-scroll-view';
import { KonjoIcon } from '@/components/ui/konjo-icon';
import { type Professional, type ServiceCategory } from '@/features/discovery/data';
import { useClientAccount } from '@/features/client/account/client-account-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { professionalLanguageMatchScore } from '@/application/discovery/discovery-contracts';
import {
  AvailabilityPill,
  BookAgainSection,
  DiscoverProfessionalsSection,
  PortfolioInspirationSection,
} from '@/features/home/home-discovery-sections';
import { useOptionalNotifications } from '@/features/notifications/notification-context';
import { RewardsCard } from '@/features/rewards/rewards-card';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, layout, palette, radii, shadows, spacing } from '@/theme/tokens';

interface CategoryChipProps {
  category: ServiceCategory;
  onPress: () => void;
}

function CategoryChip({ category, onPress }: CategoryChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.category, pressed && styles.pressed]}>
      <View style={styles.categoryCircle}>
        <Text style={styles.categoryInitial}>{category.initial}</Text>
      </View>
      <Text style={styles.categoryLabel}>{category.label}</Text>
    </Pressable>
  );
}

function ProfessionalCard({ professional, onPress }: { professional: Professional; onPress: () => void }) {
  const { t } = useClientCopy();
  return (
    <Pressable
      accessibilityLabel={`View ${professional.name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.professionalCard, pressed && styles.pressed]}>
      <View style={styles.professionalVisual}>
        {professional.image ? (
          <Image
            accessibilityLabel={`${professional.name}, ${professional.service} professional`}
            contentFit="cover"
            contentPosition="top"
            source={professional.image}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={styles.professionalPlaceholder}>
            <Text style={styles.professionalInitials}>{professional.initials}</Text>
          </View>
        )}
        <View style={styles.ratingBadge}>
          <Text style={styles.star}>★</Text>
          <Text style={styles.rating}>{professional.rating}</Text>
        </View>
        <View style={styles.nextSlotBadge}>
          <Text style={styles.nextSlot}>{t('nextSlot')} {professional.nextSlot}</Text>
        </View>
      </View>

      <View style={styles.professionalBody}>
        <View style={styles.professionalNameRow}>
          <Text numberOfLines={1} style={styles.professionalName}>
            {professional.name}
          </Text>
          <Text style={styles.professionalLocation}>{professional.zone}</Text>
        </View>
        <Text numberOfLines={1} style={styles.professionalService}>
          {professional.service}
        </Text>
        <AvailabilityPill accepting={professional.acceptingBookings !== false} compact onVisit={professional.onVisit === true} />
        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.fromLabel}>{t('from')}</Text>
            <Text style={styles.price}>ETB {professional.priceFrom}</Text>
          </View>
          <View accessibilityLabel={`Book ${professional.name}`} style={styles.bookButton}>
            <Text style={styles.bookButtonLabel}>{t('book')}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function HomeScreen() {
  const unreadNotifications = useOptionalNotifications()?.unreadCount ?? 0;
  const { account } = useClientAccount();
  const clientInitials = (account?.profile.fullName ?? '').trim().split(/\s+/).filter(Boolean).map((part: string) => part[0]).join('').slice(0, 2).toUpperCase() || '·';
  const { categoryLabel, language, t } = useClientCopy();
  const [query, setQuery] = useState('');
  const { professionals, categories } = useDiscovery();
  const homeProfessionals = professionals
    .filter((professional) => professional.acceptingBookings !== false)
    .sort((left, right) => (
      professionalLanguageMatchScore(right, language) - professionalLanguageMatchScore(left, language) ||
      Number(Boolean(right.featured)) - Number(Boolean(left.featured)) ||
      Number(Boolean(right.available)) - Number(Boolean(left.available)) ||
      right.rating - left.rating
    ))
    .slice(0, 6);

  const openBrowse = (category?: string) => {
    const href = category ? `./browse?category=${encodeURIComponent(category)}` : './browse';
    router.push(href as Href);
  };

  const openProfessional = (professionalId: string) => {
    router.push(`./professional/${encodeURIComponent(professionalId)}` as Href);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.header}>
              <View>
                <Text style={styles.wordmark}>Konjo</Text>
                <Text style={styles.sectionLabel}>{t('navHome').toUpperCase()}</Text>
              </View>
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityLabel={t('notifications')}
                  accessibilityRole="button"
                  onPress={() => router.push('/notifications' as Href)}
                  style={({ pressed }) => [styles.notificationButton, pressed && styles.pressed]}>
                  <KonjoIcon
                    color={palette.text}
                    name={{ ios: 'bell', android: 'notifications', web: 'notifications' }}
                    size={23}
                  />
                  {unreadNotifications ? <View style={styles.notificationDot} /> : null}
                </Pressable>
                <Pressable
                  accessibilityLabel={t('openProfile')}
                  accessibilityRole="button"
                  onPress={() => router.replace('/profile' as Href)}
                  style={({ pressed }) => [styles.avatarRing, pressed && styles.pressed]}>
                  <View style={[styles.avatar, styles.avatarInitials]}><Text style={styles.avatarInitialsText}>{clientInitials}</Text></View>
                </Pressable>
              </View>
            </View>

            <View style={styles.searchField}>
              <KonjoIcon
                color={palette.textMuted}
                name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                size={23}
              />
              <TextInput
                accessibilityLabel={t('searchAccessibility')}
                autoCapitalize="none"
                onChangeText={setQuery}
                placeholder={t('searchPlaceholder')}
                placeholderTextColor={palette.textMuted}
                returnKeyType="search"
                onSubmitEditing={() => {
                  const normalizedQuery = query.trim();
                  const href = normalizedQuery
                    ? `./browse?query=${encodeURIComponent(normalizedQuery)}`
                    : './browse';
                  router.push(href as Href);
                }}
                style={styles.searchInput}
                value={query}
              />
              <Pressable
                accessibilityLabel={t('browseFiltersAccessibility')}
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => openBrowse()}>
                <KonjoIcon
                  color={palette.olive}
                  name={{ ios: 'slider.horizontal.3', android: 'tune', web: 'tune' }}
                  size={22}
                />
              </Pressable>
            </View>

            <HorizontalScrollView
              accessibilityLabel={t('serviceCategoriesAccessibility')}
              contentContainerStyle={styles.categoryList}
              showsHorizontalScrollIndicator={false}>
              {categories.map((category) => (
                <CategoryChip
                  category={{ ...category, label: categoryLabel(category.id, category.label) }}
                  key={category.id}
                  onPress={() => openBrowse(category.id)}
                />
              ))}
            </HorizontalScrollView>

            <RewardsCard />

            <PortfolioInspirationSection />

            <View style={styles.sectionHeading}>
              <Text style={styles.heading}>{t('availableNearYou')}</Text>
              <Text style={styles.sectionDescription}>
                {t('verifiedNearby')}
              </Text>
            </View>

            <HorizontalScrollView
              accessibilityLabel={t('availableProfessionalsAccessibility')}
              contentContainerStyle={styles.professionalList}
              showsHorizontalScrollIndicator={false}>
              {homeProfessionals.map((professional) => (
                <ProfessionalCard
                  key={professional.id}
                  onPress={() => openProfessional(professional.id)}
                  professional={professional}
                />
              ))}
            </HorizontalScrollView>

            <DiscoverProfessionalsSection onSeeAll={() => openBrowse()} professionals={professionals} />

            <BookAgainSection professionals={professionals} />
          </View>
        </ScrollView>
      </SafeAreaView>
      <AppTabBar activeTab="Home" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: spacing.xxl,
  },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
  },
  header: {
    minHeight: 88,
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    color: palette.text,
    fontFamily: fontFamilies.display.medium,
    fontSize: 31,
    lineHeight: 36,
  },
  sectionLabel: {
    color: palette.textMuted,
    fontFamily: fontFamilies.body.medium,
    fontSize: 13,
    letterSpacing: 0.8,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  notificationButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.gold,
  },
  avatarRing: {
    width: 47,
    height: 47,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.olive,
    padding: 2,
  },
  avatarInitials: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.sageSoft },
  avatarInitialsText: { color: palette.olive, fontFamily: fontFamilies.body.bold, fontSize: 15 },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  searchField: {
    height: 52,
    marginHorizontal: layout.horizontalPadding,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: palette.text,
    fontFamily: fontFamilies.body.regular,
    fontSize: 15,
    paddingVertical: 0,
  },
  categoryList: {
    gap: 20,
    paddingHorizontal: layout.horizontalPadding,
    paddingVertical: spacing.xl,
  },
  category: {
    width: 60,
    alignItems: 'center',
    gap: spacing.xs,
  },
  categoryCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.sageSoft,
  },
  categoryInitial: {
    color: palette.olive,
    fontFamily: fontFamilies.display.regular,
    fontSize: 26,
  },
  categoryLabel: {
    color: palette.text,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 13,
  },
  sectionHeading: {
    paddingHorizontal: layout.horizontalPadding,
    marginBottom: spacing.lg,
  },
  heading: {
    color: palette.text,
    fontFamily: fontFamilies.display.medium,
    fontSize: 28,
    lineHeight: 34,
  },
  sectionDescription: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 14,
    lineHeight: 21,
    marginTop: spacing.xxs,
  },
  professionalList: {
    gap: spacing.md,
    paddingHorizontal: layout.horizontalPadding,
    paddingBottom: spacing.xl,
  },
  professionalCard: {
    width: 230,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    ...shadows.card,
  },
  professionalVisual: {
    height: 150,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: palette.sageSoft,
  },
  professionalPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.sageSoft,
  },
  professionalInitials: {
    color: palette.sage,
    fontFamily: fontFamilies.display.regular,
    fontSize: 50,
  },
  ratingBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: spacing.sm,
  },
  star: {
    color: palette.gold,
    fontSize: 14,
  },
  rating: {
    color: palette.text,
    fontFamily: fontFamilies.body.bold,
    fontSize: 14,
  },
  nextSlotBadge: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    minHeight: 27,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(44, 53, 45, 0.84)',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  nextSlot: {
    color: palette.white,
    fontFamily: fontFamilies.body.bold,
    fontSize: 12,
  },
  professionalBody: {
    padding: spacing.md,
  },
  professionalNameRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  professionalName: {
    flex: 1,
    color: palette.text,
    fontFamily: fontFamilies.body.bold,
    fontSize: 18,
  },
  professionalLocation: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 12,
  },
  professionalService: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 13,
    marginTop: 2,
  },
  cardFooter: {
    minHeight: 51,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  fromLabel: {
    color: palette.textMuted,
    fontFamily: fontFamilies.body.medium,
    fontSize: 10,
  },
  price: {
    color: palette.gold,
    fontFamily: fontFamilies.body.bold,
    fontSize: 18,
  },
  bookButton: {
    minWidth: 66,
    minHeight: 42,
    borderRadius: radii.sm,
    backgroundColor: palette.olive,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  bookButtonLabel: {
    color: palette.white,
    fontFamily: fontFamilies.body.bold,
    fontSize: 14,
  },
  bookAgainHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    paddingHorizontal: layout.horizontalPadding,
    marginBottom: spacing.md,
  },
  historyLabel: {
    color: palette.olive,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 14,
  },
  repeatBookingCard: {
    minHeight: 92,
    marginHorizontal: layout.horizontalPadding,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  repeatAvatar: {
    width: 52,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: palette.sageSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatInitials: {
    color: palette.olive,
    fontFamily: fontFamilies.display.regular,
    fontSize: 20,
  },
  repeatDetails: {
    flex: 1,
    minWidth: 0,
  },
  repeatName: {
    color: palette.text,
    fontFamily: fontFamilies.body.bold,
    fontSize: 15,
  },
  repeatService: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 12,
    marginTop: 1,
  },
  repeatRating: {
    color: palette.gold,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 12,
    marginTop: 2,
  },
  bookAgainButton: {
    minHeight: 42,
    borderRadius: radii.sm,
    backgroundColor: palette.olive,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  bookAgainButtonLabel: {
    color: palette.white,
    fontFamily: fontFamilies.body.bold,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.72,
  },
});
