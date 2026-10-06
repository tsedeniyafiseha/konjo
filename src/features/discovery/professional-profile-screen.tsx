import { Image } from 'expo-image';
import type { Href } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useEffect, useState, useRef } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { HorizontalScrollView } from '@/components/ui/horizontal-scroll-view';
import { type ProfessionalService } from '@/features/discovery/data';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { apiBaseUrl } from '@/services/api-client';
import { useClientData } from '@/features/client/client-data-context';
import { AvailabilityPill } from '@/features/home/home-discovery-sections';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, layout, palette, radii, spacing } from '@/theme/tokens';

function ActionButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

function educationLabel(value: string, language: 'en' | 'am'): string {
  const english = {
    secondary: 'Secondary school',
    certificate: 'Vocational certificate',
    diploma: 'Diploma',
    bachelors: "Bachelor’s degree",
    postgraduate: 'Postgraduate degree',
  } as Record<string, string>;
  const amharic = {
    secondary: 'ሁለተኛ ደረጃ', certificate: 'የሙያ ማረጋገጫ', diploma: 'ዲፕሎማ',
    bachelors: 'የመጀመሪያ ዲግሪ', postgraduate: 'ድህረ ምረቃ',
  } as Record<string, string>;
  return (language === 'am' ? amharic : english)[value] ?? value;
}

function genderLabel(value: 'female' | 'male' | 'unspecified', language: 'en' | 'am'): string | null {
  if (value === 'unspecified') return null;
  const labels = language === 'am'
    ? { female: 'ሴት', male: 'ወንድ' }
    : { female: 'Female', male: 'Male' };
  return labels[value];
}

function proficiencyLabel(value: string, language: 'en' | 'am'): string {
  const labels = language === 'am'
    ? { basic: 'መሠረታዊ', conversational: 'የውይይት', fluent: 'ቅልጥፍና', native: 'አፍ መፍቻ' }
    : { basic: 'Basic', conversational: 'Conversational', fluent: 'Fluent', native: 'Native' };
  return labels[value as keyof typeof labels] ?? value;
}

function ServiceCard({
  service,
  selected,
  onPress,
}: {
  service: ProfessionalService;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.serviceCard,
        selected && styles.serviceCardSelected,
        pressed && styles.pressed,
      ]}>
      <View style={styles.serviceTitleRow}>
        <View style={styles.serviceNameRow}>
          <Text style={[styles.serviceName, selected && styles.serviceTextSelected]}>{service.name}</Text>
          {service.tag ? (
            <View style={[styles.serviceTag, selected && styles.serviceTagSelected]}>
              <Text style={[styles.serviceTagLabel, selected && styles.serviceTextSelected]}>
                {service.tag}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.servicePrice, selected && styles.servicePriceSelected]}>
          ETB {service.price}
        </Text>
      </View>
      <Text style={[styles.serviceDescription, selected && styles.serviceDescriptionSelected]}>
        {service.description}
      </Text>
      <View style={styles.serviceMetaRow}>
        <Text style={[styles.serviceMeta, selected && styles.serviceMetaSelected]}>{service.duration}</Text>
        <Text style={[styles.serviceMeta, selected && styles.serviceMetaSelected]}>{service.note}</Text>
      </View>
    </Pressable>
  );
}

/**
 * The link people receive. An https address is what chat apps turn into a
 * tappable link: the web app's profile page when EXPO_PUBLIC_WEB_URL is set,
 * otherwise the API's public profile page (/p/:id), which opens the app.
 */
export function professionalProfileShareUrl(professionalId: string): string {
  const webUrl = (process.env.EXPO_PUBLIC_WEB_URL ?? '').trim().replace(/\/$/, '');
  if (/^https?:\/\//.test(webUrl)) return `${webUrl}/professional/${encodeURIComponent(professionalId)}`;
  if (apiBaseUrl) return `${apiBaseUrl}/p/${encodeURIComponent(professionalId)}`;
  return `konjoclient://professional/${encodeURIComponent(professionalId)}`;
}

export function ProfessionalProfileScreen() {
  const params = useLocalSearchParams<{ professionalId?: string }>();
  const professionalId = typeof params.professionalId === 'string' ? params.professionalId : undefined;
  const { getProfessional, loadPortfolio, loadReviews, loading: discoveryLoading, refresh: refreshDiscovery } = useDiscovery();
  const professional = getProfessional(professionalId);
  // A newly approved professional may not be in the catalog loaded earlier:
  // ask for it once more before declaring them unavailable.
  const retriedCatalog = useRef(false);
  useEffect(() => {
    if (professional || discoveryLoading || retriedCatalog.current) return;
    retriedCatalog.current = true;
    void refreshDiscovery();
  }, [discoveryLoading, professional, refreshDiscovery]);
  const [selectedServiceIndex, setSelectedServiceIndex] = useState(0);
  const { favouriteIds, toggleFavourite } = useClientData();
  const { language, t } = useClientCopy();
  const favorited = professional ? favouriteIds.has(professional.id) : false;
  const onVisit = professional?.onVisit === true;
  const acceptingBookings = professional?.acceptingBookings !== false && !onVisit;

  useEffect(() => {
    if (!professionalId) return;
    void loadPortfolio(professionalId);
    void loadReviews(professionalId);
  }, [loadPortfolio, loadReviews, professionalId]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/browse' as Href);
  };

  if (!professional) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.notFoundScreen}>
        <Text style={styles.notFoundTitle}>{t('specialistUnavailable')}</Text>
        <Text style={styles.notFoundDescription}>{t('profileInactive')}</Text>
        <Pressable accessibilityRole="button" onPress={goBack} style={styles.notFoundButton}>
          <Text style={styles.notFoundButtonLabel}>{t('backToSpecialists')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const selectedService = professional.services[selectedServiceIndex] ?? professional.services[0];

  const shareProfile = async () => {
    // A real link: the web profile when a public web URL is configured, otherwise the app deep link.
    const url = professionalProfileShareUrl(professional.id);
    try {
      // Android shares only `message`, so the link travels inside it; iOS also gets `url`.
      await Share.share(
        Platform.OS === 'ios'
          ? { title: `${professional.name} on Konjo`, message: `${professional.name} — ${professional.service} on Konjo`, url }
          : { title: `${professional.name} on Konjo`, message: `${professional.name} — ${professional.service} on Konjo: ${url}` },
        { dialogTitle: t('shareProfile'), subject: `${professional.name} on Konjo` },
      );
    } catch (error) {
      if (__DEV__) console.error('Unable to share this professional profile.', error);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.topBar}>
              <ActionButton label={t('goBack')} onPress={goBack}>
                <KonjoIcon
                  color={palette.text}
                  name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                  size={20}
                />
              </ActionButton>
              <View style={styles.topActions}>
                <ActionButton label={t('shareProfile')} onPress={shareProfile}>
                  <KonjoIcon
                    color={palette.text}
                    name={{ ios: 'square.and.arrow.up', android: 'share', web: 'share' }}
                    size={19}
                  />
                </ActionButton>
                <ActionButton
                  label={favorited ? t('removeFavourite') : t('addToFavourites')}
                  onPress={() => toggleFavourite(professional.id)}>
                  <KonjoIcon
                    color={favorited ? palette.error : palette.text}
                    name={{
                      ios: favorited ? 'heart.fill' : 'heart',
                      android: 'favorite',
                      web: 'favorite',
                    }}
                    size={20}
                  />
                </ActionButton>
              </View>
            </View>

            <View style={styles.identitySection}>
              <View style={styles.profileVisual}>
                {professional.image ? (
                  <Image
                    accessibilityLabel={t('professionalImage').replace('{name}', professional.name).replace('{service}', professional.service)}
                    contentFit="cover"
                    source={professional.image}
                    style={StyleSheet.absoluteFill}
                  />
                ) : (
                  <Text style={styles.profileInitials}>{professional.initials}</Text>
                )}
              </View>
              <View style={styles.identityCopy}>
                <Text accessibilityRole="header" style={styles.profileName}>
                  {professional.name}
                </Text>
                <Text style={styles.profileService}>{professional.service}</Text>
                <Text style={styles.profileRating}>
                  ★ {professional.rating} ({professional.reviews} {t('reviews')})
                </Text>
                <View style={styles.availabilityRow}>
                  <AvailabilityPill accepting={acceptingBookings} onVisit={onVisit} />
                </View>
              </View>
            </View>
            {!acceptingBookings ? <Text style={styles.pausedNotice}>{onVisit ? t('onVisitBody').replace('{name}', professional.firstName) : t('notTakingBookingsBody')}</Text> : null}

            <View style={styles.badgeRow}>
              <View style={styles.verifiedBadge}>
                <KonjoIcon
                  color={palette.olive}
                  name={{ ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' }}
                  size={16}
                />
                <Text style={styles.verifiedLabel}>{t('faydaVerified')}</Text>
              </View>
              <View style={styles.zoneBadge}>
                <Text style={styles.zoneLabel}>{t('zone')}: {professional.zone}</Text>
              </View>
            </View>

            <Text style={styles.bio}>{professional.bio}</Text>

            {professional.educationLevel || professional.languageSkills?.length || genderLabel(professional.gender, language) ? (
              <View style={styles.qualificationsCard}>
                {genderLabel(professional.gender, language) ? (
                  <View style={styles.qualificationItem}>
                    <Text style={styles.qualificationLabel}>{t('genderLabel')}</Text>
                    <Text style={styles.qualificationValue}>{genderLabel(professional.gender, language)}</Text>
                  </View>
                ) : null}
                {professional.educationLevel ? (
                  <View style={styles.qualificationItem}>
                    <Text style={styles.qualificationLabel}>{t('education')}</Text>
                    <Text style={styles.qualificationValue}>{educationLabel(professional.educationLevel, language)}</Text>
                  </View>
                ) : null}
                {professional.languageSkills?.length ? (
                  <View style={styles.qualificationItem}>
                    <Text style={styles.qualificationLabel}>{t('languageSkills')}</Text>
                    <Text style={styles.qualificationValue}>
                      {professional.languageSkills.map((skill) => `${skill.language} · ${proficiencyLabel(skill.proficiency, language)}`).join('  •  ')}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={styles.statsRow}>
              {professional.stats.map((stat) => (
                <View key={stat.label} style={styles.statCard}>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text numberOfLines={1} style={styles.statLabel}>
                    {stat.label}
                  </Text>
                </View>
              ))}
            </View>

            {professional.portfolio.length ? (
              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>{t('portfolioWork')}</Text>
                  <Text style={styles.sectionMeta}>{professional.portfolio.length} {t('styles')}</Text>
                </View>
                <HorizontalScrollView
                  accessibilityLabel={t('portfolioStyles')}
                  contentContainerStyle={styles.portfolioList}
                  showsHorizontalScrollIndicator={false}>
                  {professional.portfolio.map((item) => {
                    const isRemoteImage = /^https?:\/\//i.test(item);
                    return (
                      <View key={item} style={styles.portfolioCard}>
                        {isRemoteImage ? (
                          <Image
                            accessibilityLabel={`${professional.name} portfolio work`}
                            contentFit="cover"
                            source={{ uri: item }}
                            style={StyleSheet.absoluteFill}
                          />
                        ) : (
                          <>
                            <KonjoIcon
                              color={palette.textMuted}
                              name={{ ios: 'photo', android: 'image', web: 'image' }}
                              size={28}
                            />
                            <Text style={styles.portfolioName}>{item}</Text>
                            <Text style={styles.portfolioHint}>{t('browseFiles')}</Text>
                          </>
                        )}
                      </View>
                    );
                  })}
                </HorizontalScrollView>
              </View>
            ) : null}

            <View style={styles.section}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>{t('servicesPricing')}</Text>
                <Text style={styles.sectionMeta}>{t('homeService')}</Text>
              </View>
              <View accessibilityRole="radiogroup" style={styles.serviceList}>
                {professional.services.map((service, index) => (
                  <ServiceCard
                    key={service.name}
                    onPress={() => setSelectedServiceIndex(index)}
                    selected={index === selectedServiceIndex}
                    service={service}
                  />
                ))}
              </View>
            </View>

            {professional.reviewsList.length ? (
              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>{t('clientReviews')}</Text>
                  <Text style={styles.reviewLink}>{t('readAll')}</Text>
                </View>
                <View style={styles.reviewList}>
                  {professional.reviewsList.map((review) => (
                    <View key={`${review.name}-${review.service}`} style={styles.reviewCard}>
                      <View style={styles.reviewHeader}>
                        <View style={styles.reviewerIdentity}>
                          <View style={styles.reviewerAvatar}>
                            <Text style={styles.reviewerInitial}>{review.name[0]}</Text>
                          </View>
                          <View>
                            <Text style={styles.reviewerName}>{review.name}</Text>
                            <Text style={styles.reviewerZone}>{review.zone}</Text>
                          </View>
                        </View>
                        <Text style={styles.reviewRating}>★ {review.rating}</Text>
                      </View>
                      <Text style={styles.reviewText}>“{review.text}”</Text>
                      <Text style={styles.reviewMeta}>
                        {review.time} · {review.service}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.bookingBar}>
        <View style={styles.bookingSummary}>
          <Text style={styles.selectedLabel}>{t('selectedService')}</Text>
          <Text style={styles.selectedPrice}>ETB {selectedService.price}</Text>
        </View>
        <Pressable
          accessibilityLabel={t('bookProfessional').replace('{name}', professional.firstName)}
          accessibilityRole="button"
          accessibilityState={{ disabled: !acceptingBookings }}
          disabled={!acceptingBookings}
          onPress={() =>
            router.push(
              `/booking/when?professionalId=${encodeURIComponent(professional.id)}&serviceIndex=${selectedServiceIndex}` as Href,
            )
          }
          style={({ pressed }) => [styles.bookingButton, !acceptingBookings && styles.bookingButtonDisabled, pressed && styles.pressed]}>
          <Text style={styles.bookingButtonLabel}>{acceptingBookings ? t('bookProfessional').replace('{name}', professional.firstName) : onVisit ? t('onVisitNow') : t('notTakingBookings')}</Text>
          <Text style={styles.bookingArrow}>→</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  availabilityRow: { marginTop: 8 },
  pausedNotice: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13, lineHeight: 19, marginTop: 12, borderRadius: 12, backgroundColor: palette.surfaceMuted, padding: 12 },
  bookingButtonDisabled: { opacity: 0.45 },
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
  topBar: {
    minHeight: 68,
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identitySection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: spacing.md,
  },
  profileVisual: {
    width: 84,
    height: 84,
    flexShrink: 0,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: palette.sageSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitials: {
    color: palette.olive,
    fontFamily: fontFamilies.display.regular,
    fontSize: 28,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    color: palette.text,
    fontFamily: fontFamilies.display.medium,
    fontSize: 28,
    lineHeight: 34,
  },
  profileService: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 16,
    marginTop: 2,
  },
  profileRating: {
    color: palette.gold,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: spacing.lg,
  },
  verifiedBadge: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    backgroundColor: palette.sageSoft,
    paddingHorizontal: spacing.sm,
  },
  verifiedLabel: {
    color: palette.olive,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 12,
  },
  zoneBadge: {
    minHeight: 32,
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: palette.surfaceMuted,
    paddingHorizontal: spacing.md,
  },
  zoneLabel: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 12,
  },
  bio: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 15,
    lineHeight: 23,
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: spacing.lg,
  },
  qualificationsCard: { backgroundColor: palette.surface, borderColor: palette.border, borderRadius: radii.sm, borderWidth: 1, gap: spacing.sm, marginHorizontal: layout.horizontalPadding, marginTop: spacing.md, padding: spacing.md },
  qualificationItem: { gap: 3 },
  qualificationLabel: { color: palette.textMuted, fontFamily: fontFamilies.body.semibold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  qualificationValue: { color: palette.text, fontFamily: fontFamilies.body.medium, fontSize: 13, lineHeight: 19, textTransform: 'capitalize' },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: spacing.lg,
  },
  statCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.sm,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  statValue: {
    color: palette.text,
    fontFamily: fontFamilies.body.bold,
    fontSize: 17,
  },
  statLabel: {
    color: palette.textMuted,
    fontFamily: fontFamilies.body.regular,
    fontSize: 9,
    marginTop: 2,
  },
  section: {
    paddingTop: spacing.xl,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: layout.horizontalPadding,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: fontFamilies.display.medium,
    fontSize: 24,
    lineHeight: 30,
  },
  sectionMeta: {
    color: palette.textMuted,
    fontFamily: fontFamilies.body.regular,
    fontSize: 12,
  },
  portfolioList: {
    gap: spacing.sm,
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: spacing.sm,
  },
  portfolioCard: {
    width: 120,
    height: 150,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: palette.textMuted,
    borderRadius: radii.md,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    overflow: 'hidden',
  },
  portfolioName: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 14,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  portfolioHint: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 11,
    marginTop: spacing.xs,
    textDecorationLine: 'underline',
  },
  serviceList: {
    gap: spacing.sm,
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: spacing.sm,
  },
  serviceCard: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    padding: spacing.md,
  },
  serviceCardSelected: {
    borderColor: palette.oliveDark,
    backgroundColor: palette.oliveDark,
  },
  serviceTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  serviceNameRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  serviceName: {
    color: palette.text,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 15,
  },
  serviceTag: {
    borderRadius: radii.pill,
    backgroundColor: palette.sageSoft,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
  },
  serviceTagSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  serviceTagLabel: {
    color: palette.olive,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 10,
  },
  serviceTextSelected: {
    color: palette.white,
  },
  servicePrice: {
    color: palette.text,
    fontFamily: fontFamilies.body.bold,
    fontSize: 15,
  },
  servicePriceSelected: {
    color: palette.gold,
  },
  serviceDescription: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  serviceDescriptionSelected: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  serviceMetaRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  serviceMeta: {
    color: palette.textMuted,
    fontFamily: fontFamilies.body.regular,
    fontSize: 11,
  },
  serviceMetaSelected: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  reviewLink: {
    color: palette.olive,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 12,
  },
  reviewList: {
    gap: spacing.sm,
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: spacing.sm,
  },
  reviewCard: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    backgroundColor: palette.surface,
    padding: spacing.md,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  reviewerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reviewerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.sageSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewerInitial: {
    color: palette.olive,
    fontFamily: fontFamilies.body.bold,
    fontSize: 12,
  },
  reviewerName: {
    color: palette.text,
    fontFamily: fontFamilies.body.semibold,
    fontSize: 13,
  },
  reviewerZone: {
    color: palette.textMuted,
    fontFamily: fontFamilies.body.regular,
    fontSize: 10,
  },
  reviewRating: {
    color: palette.gold,
    fontFamily: fontFamilies.body.bold,
    fontSize: 12,
  },
  reviewText: {
    color: palette.text,
    fontFamily: fontFamilies.body.regular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  reviewMeta: {
    color: palette.textMuted,
    fontFamily: fontFamilies.body.regular,
    fontSize: 10,
    marginTop: spacing.xs,
  },
  bookingBar: {
    minHeight: 86,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    backgroundColor: 'rgba(250, 249, 245, 0.98)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.horizontalPadding,
    paddingTop: spacing.sm,
  },
  bookingSummary: {
    flex: 1,
  },
  selectedLabel: {
    color: palette.textMuted,
    fontFamily: fontFamilies.body.medium,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  selectedPrice: {
    color: palette.text,
    fontFamily: fontFamilies.body.bold,
    fontSize: 19,
    marginTop: 2,
  },
  bookingButton: {
    minWidth: 158,
    minHeight: 52,
    borderRadius: radii.sm,
    backgroundColor: palette.sage,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  bookingButtonLabel: {
    color: palette.white,
    fontFamily: fontFamilies.body.bold,
    fontSize: 16,
  },
  bookingArrow: {
    color: palette.white,
    fontSize: 24,
  },
  notFoundScreen: {
    flex: 1,
    backgroundColor: palette.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  notFoundTitle: {
    color: palette.text,
    fontFamily: fontFamilies.display.medium,
    fontSize: 28,
  },
  notFoundDescription: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  notFoundButton: {
    minHeight: 48,
    borderRadius: radii.sm,
    backgroundColor: palette.olive,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  notFoundButtonLabel: {
    color: palette.white,
    fontFamily: fontFamilies.body.bold,
    fontSize: 14,
  },
  pressed: {
    opacity: 0.72,
  },
});
