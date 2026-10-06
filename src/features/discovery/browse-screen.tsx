import { Image } from 'expo-image';
import type { Href } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ComponentProps } from 'react';
import { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { HorizontalScrollView } from '@/components/ui/horizontal-scroll-view';
import type { Professional } from '@/features/discovery/data';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { AvailabilityPill } from '@/features/home/home-discovery-sections';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, layout, palette, radii, shadows, spacing } from '@/theme/tokens';
import { BrowseFilterSheet, Chip } from './browse-filter-sheet';
import {
  type BrowseFilters,
  applyBrowseFilters,
  countActiveFilters,
  emptyBrowseFilters,
  ratingOptions,
  sortOptions,
} from './browse-filters';

// ─── helpers ────────────────────────────────────────────────────────────────

function CircleButton({
  label,
  icon,
  onPress,
  accent = false,
}: {
  label: string;
  icon: ComponentProps<typeof KonjoIcon>['name'];
  onPress: () => void;
  accent?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}>
      <KonjoIcon color={accent ? palette.olive : palette.text} name={icon} size={20} />
    </Pressable>
  );
}

// ─── specialist card ─────────────────────────────────────────────────────────

function SpecialistCard({
  professional,
  onPress,
}: {
  professional: Professional;
  onPress: () => void;
}) {
  const { t } = useClientCopy();
  return (
    <Pressable
      accessibilityLabel={`${t('viewProfessional')}: ${professional.name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.specialistCard, pressed && styles.pressed]}>
      <View style={styles.specialistVisual}>
        {professional.image ? (
          <Image
            accessibilityLabel={`${professional.name}, ${professional.service} professional`}
            contentFit="cover"
            source={professional.image}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <Text style={styles.specialistInitials}>{professional.initials}</Text>
        )}
      </View>

      <View style={styles.specialistDetails}>
        <View style={styles.specialistTopRow}>
          <Text numberOfLines={1} style={styles.specialistName}>
            {professional.name}
          </Text>
          <Text style={styles.specialistRating}>★ {professional.rating}</Text>
        </View>
        <Text numberOfLines={1} style={styles.specialistService}>
          {professional.service}
        </Text>
        <AvailabilityPill accepting={professional.acceptingBookings !== false} compact onVisit={professional.onVisit === true} />
        <View style={styles.specialistBottomRow}>
          <Text numberOfLines={2} style={styles.specialistAvailability}>
            {professional.zone} · {t('nextSlot')} {professional.nextSlot}
          </Text>
          <Text style={styles.specialistPrice}>ETB {professional.priceFrom}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── inline select chip ───────────────────────────────────────────────────────
// A pressable pill that cycles through options (used for Rating and Sort).

function SelectPill<T extends string | number>({
  value,
  options,
  labels,
  placeholder,
  icon,
  onChange,
}: {
  value: T | null;
  options: readonly T[];
  labels: Record<T, string>;
  placeholder: string;
  icon: ComponentProps<typeof KonjoIcon>['name'];
  onChange: (next: T | null) => void;
}) {
  const active = value !== null;
  const handlePress = () => {
    if (!active) {
      onChange(options[0]);
      return;
    }
    const idx = options.indexOf(value as T);
    const next = idx < options.length - 1 ? options[idx + 1] : null;
    onChange(next);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.selectPill,
        active && styles.selectPillActive,
        pressed && styles.pressed,
      ]}>
      <KonjoIcon
        color={active ? palette.olive : palette.textMuted}
        name={icon}
        size={14}
      />
      <Text
        numberOfLines={1}
        style={[styles.selectPillLabel, active && styles.selectPillLabelActive]}>
        {active ? labels[value as T] : placeholder}
      </Text>
      <KonjoIcon
        color={active ? palette.olive : palette.textMuted}
        name={{ ios: 'chevron.down', android: 'arrow_drop_down', web: 'arrow_drop_down' }}
        size={14}
      />
    </Pressable>
  );
}

// ─── main screen ─────────────────────────────────────────────────────────────

export function BrowseScreen() {
  const { categoryLabel, language, t } = useClientCopy();
  const { professionals, categories } = useDiscovery();
  const params = useLocalSearchParams<{ category?: string; query?: string }>();

  // ── local search state (drives the search panel, committed on Search press) ──
  const initialCategory = typeof params.category === 'string' ? params.category : null;
  const initialQuery = typeof params.query === 'string' ? params.query.trim() : '';

  const [draftQuery, setDraftQuery] = useState(initialQuery);
  const [committedQuery, setCommittedQuery] = useState(initialQuery.toLowerCase());
  const [filters, setFilters] = useState<BrowseFilters>({
    ...emptyBrowseFilters,
    category: initialCategory,
  });
  const [showFilters, setShowFilters] = useState(false);
  const queryInputRef = useRef<TextInput>(null);

  const zones = useMemo(
    () =>
      [...new Set(professionals.flatMap((p) => p.travelZones ?? [p.zone]))].sort(),
    [professionals],
  );

  // ── derived ────────────────────────────────────────────────────────────────
  const visibleProfessionals = useMemo(
    () => applyBrowseFilters(professionals, filters, committedQuery, language),
    [language, professionals, committedQuery, filters],
  );
  const countFor = (draft: BrowseFilters) =>
    applyBrowseFilters(professionals, draft, committedQuery, language).length;

  const activeCount = countActiveFilters(filters);
  const selectedCategory = filters.category;

  const ratingLabels = Object.fromEntries(
    ratingOptions.map((r) => [
      r,
      `★ ${t('ratingAtLeast').replace('{rating}', String(r))}`,
    ]),
  ) as Record<number, string>;

  const sortLabels = {
    rating: t('topRated'),
    distance: t('nearest'),
    price: t('price'),
  } as const;

  const ratingChipLabel =
    filters.minRating !== null
      ? `★ ${t('ratingAtLeast').replace('{rating}', String(filters.minRating))}`
      : null;
  const sortChipLabel =
    filters.sortBy === 'rating'
      ? t('topRated')
      : filters.sortBy === 'distance'
        ? t('nearest')
        : filters.sortBy === 'price'
          ? t('price')
          : null;

  const matchLabel = t('matchCount').replace(
    '{count}',
    String(visibleProfessionals.length),
  );

  // ── actions ────────────────────────────────────────────────────────────────
  const commitSearch = () => {
    setCommittedQuery(draftQuery.trim().toLowerCase());
    queryInputRef.current?.blur();
  };

  const clearAll = () => {
    setDraftQuery('');
    setCommittedQuery('');
    setFilters({ ...emptyBrowseFilters });
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/home' as Href);
  };

  const openProfessional = (professionalId: string) => {
    router.push(`./professional/${encodeURIComponent(professionalId)}` as Href);
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>

            {/* ── back row ── */}
            <View style={styles.backRow}>
              <CircleButton
                icon={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                label={t('goBack')}
                onPress={goBack}
              />
            </View>

            {/* ── search panel card ── */}
            <View style={styles.searchCard}>
              {/* title + match count */}
              <View style={styles.searchCardHeader}>
                <Text accessibilityRole="header" style={styles.searchCardTitle}>
                  {t('discoverTitle')}
                </Text>
                <View style={styles.matchBadge}>
                  <KonjoIcon
                    color={palette.olive}
                    name={{ ios: 'person.2', android: 'group', web: 'group' }}
                    size={13}
                  />
                  <Text style={styles.matchBadgeLabel}>{matchLabel}</Text>
                </View>
              </View>

              {/* row 1: free-text search */}
              <View style={styles.searchField}>
                <KonjoIcon
                  color={palette.textMuted}
                  name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                  size={16}
                />
                <TextInput
                  accessibilityLabel={t('searchAccessibility')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setDraftQuery}
                  onSubmitEditing={commitSearch}
                  placeholder={t('searchServiceProPlaceholder')}
                  placeholderTextColor={palette.textMuted}
                  ref={queryInputRef}
                  returnKeyType="search"
                  style={styles.searchInput}
                  value={draftQuery}
                />
                {draftQuery.length > 0 && (
                  <Pressable
                    accessibilityLabel={t('clearAll')}
                    hitSlop={8}
                    onPress={() => { setDraftQuery(''); setCommittedQuery(''); }}>
                    <KonjoIcon
                      color={palette.textMuted}
                      name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
                      size={16}
                    />
                  </Pressable>
                )}
              </View>

              {/* row 2: zone | rating | sort */}
              <View style={styles.pillRow}>
                {/* Zone picker */}
                <SelectPill<string>
                  icon={{ ios: 'mappin', android: 'place', web: 'place' }}
                  labels={Object.fromEntries(zones.map((z) => [z, z])) as Record<string, string>}
                  onChange={(z) => setFilters((f) => ({ ...f, zone: z }))}
                  options={zones}
                  placeholder={t('anyZone')}
                  value={filters.zone}
                />

                {/* Rating picker */}
                <SelectPill<number>
                  icon={{ ios: 'star', android: 'star', web: 'star' }}
                  labels={ratingLabels}
                  onChange={(r) => setFilters((f) => ({ ...f, minRating: r }))}
                  options={ratingOptions as unknown as number[]}
                  placeholder={t('anyRating')}
                  value={filters.minRating}
                />

                {/* Sort picker */}
                <SelectPill<'rating' | 'distance' | 'price'>
                  icon={{ ios: 'arrow.up.arrow.down', android: 'swap_vert', web: 'swap_vert' }}
                  labels={sortLabels}
                  onChange={(s) => setFilters((f) => ({ ...f, sortBy: s }))}
                  options={sortOptions}
                  placeholder={t('sortBy').replace(/\s+/g, '\u00A0')}
                  value={filters.sortBy}
                />
              </View>

              {/* row 3: search button + advanced filters */}
              <View style={styles.searchActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={commitSearch}
                  style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}>
                  <KonjoIcon
                    color={palette.white}
                    name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                    size={16}
                  />
                  <Text style={styles.searchButtonLabel}>{t('searchSubmit')}</Text>
                </Pressable>

                <View>
                  <Pressable
                    accessibilityLabel={
                      activeCount
                        ? `${t('filters')} · ${t('filtersActive').replace('{count}', String(activeCount))}`
                        : t('filters')
                    }
                    accessibilityRole="button"
                    onPress={() => setShowFilters(true)}
                    style={({ pressed }) => [styles.filterButton, pressed && styles.pressed]}>
                    <KonjoIcon
                      color={activeCount ? palette.olive : palette.text}
                      name={{ ios: 'line.3.horizontal.decrease', android: 'filter_list', web: 'filter_list' }}
                      size={18}
                    />
                  </Pressable>
                  {activeCount ? (
                    <View pointerEvents="none" style={styles.filterBadge}>
                      <Text style={styles.filterBadgeLabel}>{activeCount}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            {/* ── category chips ── */}
            <HorizontalScrollView
              accessibilityLabel={t('filterByServiceAccessibility')}
              contentContainerStyle={styles.categoryList}
              showsHorizontalScrollIndicator={false}>
              {categories.map((category) => {
                const selected = selectedCategory === category.id;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={category.id}
                    onPress={() =>
                      setFilters((f) => ({
                        ...f,
                        category: selected ? null : category.id,
                      }))
                    }
                    style={({ pressed }) => [
                      styles.categoryPill,
                      selected && styles.categoryPillSelected,
                      pressed && styles.pressed,
                    ]}>
                    {/* colour dot */}
                    <View
                      style={[
                        styles.categoryDot,
                        selected && styles.categoryDotSelected,
                      ]}
                    />
                    <Text
                      style={[
                        styles.categoryPillLabel,
                        selected && styles.categoryPillLabelSelected,
                      ]}>
                      {categoryLabel(category.id, category.label)}
                    </Text>
                  </Pressable>
                );
              })}

              {(activeCount > 0 || committedQuery.length > 0) && (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={clearAll}
                  style={({ pressed }) => [styles.clearPill, pressed && styles.pressed]}>
                  <Text style={styles.clearPillLabel}>{t('clearAll')}</Text>
                </Pressable>
              )}
            </HorizontalScrollView>

            {/* ── active filter chips ── */}
            {activeCount > 0 && (
              <View style={styles.activeChips}>
                {sortChipLabel ? (
                  <Chip
                    label={sortChipLabel}
                    onPress={() => undefined}
                    onRemove={() => setFilters((f) => ({ ...f, sortBy: null }))}
                    selected
                  />
                ) : null}
                {ratingChipLabel ? (
                  <Chip
                    label={ratingChipLabel}
                    onPress={() => undefined}
                    onRemove={() => setFilters((f) => ({ ...f, minRating: null }))}
                    selected
                  />
                ) : null}
                {filters.gender ? (
                  <Chip
                    label={filters.gender === 'female' ? t('genderFemale') : t('genderMale')}
                    onPress={() => undefined}
                    onRemove={() => setFilters((f) => ({ ...f, gender: null }))}
                    selected
                  />
                ) : null}
                {filters.languages.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    onPress={() => undefined}
                    onRemove={() =>
                      setFilters((f) => ({
                        ...f,
                        languages: f.languages.filter((v) => v !== item),
                      }))
                    }
                    selected
                  />
                ))}
                {filters.zone ? (
                  <Chip
                    label={filters.zone}
                    onPress={() => undefined}
                    onRemove={() => setFilters((f) => ({ ...f, zone: null }))}
                    selected
                  />
                ) : null}
              </View>
            )}

            {/* ── results list ── */}
            <View style={styles.specialistList}>
              {visibleProfessionals.map((professional) => (
                <SpecialistCard
                  key={professional.id}
                  onPress={() => openProfessional(professional.id)}
                  professional={professional}
                />
              ))}
              {visibleProfessionals.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyDescription}>{t('noSpecialists')}</Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      <BrowseFilterSheet
        categories={categories}
        countFor={countFor}
        filters={filters}
        onApply={(next) => {
          setFilters(next);
          setShowFilters(false);
        }}
        onClose={() => setShowFilters(false)}
        visible={showFilters}
        zones={zones}
      />
    </View>
  );
}

// ─── styles ───────────────────────────────────────────────────────────────────

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
    paddingBottom: spacing.xl,
  },
  content: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
  },

  // back row
  backRow: {
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  circleButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // search card
  searchCard: {
    marginHorizontal: layout.horizontalPadding,
    marginBottom: spacing.md,
    backgroundColor: palette.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  searchCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginBottom: spacing.xxs,
  },
  searchCardTitle: {
    color: palette.text,
    fontFamily: fontFamilies.body.bold,
    fontSize: 17,
    flex: 1,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: palette.sageSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  matchBadgeLabel: {
    color: palette.olive,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 12,
  },

  // search text field
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: palette.surfaceMuted,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: spacing.sm,
    height: 46,
  },
  searchInput: {
    flex: 1,
    color: palette.text,
    fontFamily: fontFamilies.body.regular,
    fontSize: 14,
    // remove default padding on Android
    paddingVertical: 0,
  },

  // pill row
  pillRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  selectPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 38,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.xs,
    overflow: 'hidden',
  },
  selectPillActive: {
    borderColor: palette.sage,
    backgroundColor: palette.sageSoft,
  },
  selectPillLabel: {
    flex: 1,
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.medium,
    fontSize: 12,
    textAlign: 'center',
  },
  selectPillLabelActive: {
    color: palette.olive,
  },

  // search actions row
  searchActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  searchButton: {
    flex: 1,
    height: 46,
    borderRadius: radii.md,
    backgroundColor: palette.olive,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  searchButtonLabel: {
    color: palette.white,
    fontFamily: fontFamilies.body.bold,
    fontSize: 15,
  },
  filterButton: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: palette.olive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeLabel: {
    color: palette.white,
    fontFamily: fontFamilies.body.bold,
    fontSize: 10,
  },

  // category chips
  categoryList: {
    gap: spacing.xs,
    paddingHorizontal: layout.horizontalPadding,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  categoryPillSelected: {
    borderColor: palette.text,
    backgroundColor: palette.text,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.sage,
  },
  categoryDotSelected: {
    backgroundColor: palette.sageSoft,
  },
  categoryPillLabel: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 13,
  },
  categoryPillLabelSelected: {
    color: palette.white,
  },
  clearPill: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearPillLabel: {
    color: palette.olive,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 13,
  },

  // active filter chips below the category row
  activeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: layout.horizontalPadding,
    marginBottom: spacing.sm,
  },

  // specialist list
  specialistList: {
    gap: spacing.sm,
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: spacing.xs,
  },
  specialistCard: {
    minHeight: 100,
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    padding: spacing.sm,
  },
  specialistVisual: {
    width: 74,
    height: 74,
    flexShrink: 0,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: palette.sageSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specialistInitials: {
    color: palette.olive,
    fontFamily: fontFamilies.display.regular,
    fontSize: 23,
  },
  specialistDetails: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 2,
  },
  specialistTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.xs,
  },
  specialistName: {
    flex: 1,
    color: palette.text,
    fontFamily: fontFamilies.body.bold,
    fontSize: 16,
  },
  specialistRating: {
    color: palette.gold,
    fontFamily: fontFamilies.body.bold,
    fontSize: 13,
  },
  specialistService: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 14,
    marginTop: 2,
  },
  specialistBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  specialistAvailability: {
    flex: 1,
    color: palette.textMuted,
    fontFamily: fontFamilies.body.regular,
    fontSize: 11,
    lineHeight: 15,
  },
  specialistPrice: {
    color: palette.text,
    fontFamily: fontFamilies.body.bold,
    fontSize: 14,
  },

  // empty state
  emptyState: {
    borderRadius: radii.md,
    backgroundColor: palette.surfaceMuted,
    padding: spacing.lg,
  },
  emptyDescription: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 13,
  },

  pressed: {
    opacity: 0.72,
  },
});
