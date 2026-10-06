import { Image } from 'expo-image';
import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HorizontalScrollView } from '@/components/ui/horizontal-scroll-view';
import type { Professional } from '@/application/discovery/discovery-contracts';
import { useClientData } from '@/features/client/client-data-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { discoveryService } from '@/features/discovery/discovery-service';
import { apiBaseUrl } from '@/services/api-client';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, palette, radii, spacing } from '@/theme/tokens';
import type { ApiPortfolioFeedItem } from '../../../shared/api-contracts';

function openProfessional(professionalId: string) {
  router.push(`./professional/${encodeURIComponent(professionalId)}` as Href);
}

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function initialsOf(name: string): string {
  return name.split(/\s+/).map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase() || 'K';
}

export function AvailabilityPill({ accepting, onVisit = false, compact = false }: { accepting: boolean; onVisit?: boolean; compact?: boolean }) {
  const { t } = useClientCopy();
  const open = accepting && !onVisit;
  return (
    <View style={[styles.pill, open ? styles.pillOn : styles.pillOff, compact && styles.pillCompact]}>
      <View style={[styles.pillDot, { backgroundColor: open ? '#3E8E4F' : onVisit ? palette.gold : palette.textMuted }]} />
      <Text style={[styles.pillText, { color: open ? palette.olive : onVisit ? palette.gold : palette.textSecondary }]}>
        {open ? t('availableNow') : onVisit ? t('onVisitNow') : t('notTakingBookings')}
      </Text>
    </View>
  );
}

function SectionHeading({ title, body, action, onAction }: { title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.heading}>
      <View style={styles.headingRow}>
        <Text style={styles.headingTitle}>{title}</Text>
        {action && onAction ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={onAction}>
            <Text style={styles.headingAction}>{action}</Text>
          </Pressable>
        ) : null}
      </View>
      {body ? <Text style={styles.headingBody}>{body}</Text> : null}
    </View>
  );
}

/** Published portfolio photos; tapping one opens the professional who made it. */
const LOOK_CARD_WIDTH = 158;
const LOOK_ADVANCE_MS = 4_000;
const LOOK_RESUME_AFTER_TOUCH_MS = 10_000;

export function PortfolioInspirationSection() {
  const { t, categoryLabel } = useClientCopy();
  // The feed follows the catalog: when professionals are approved, removed or
  // refreshed, their work is fetched again instead of staying as first loaded.
  const { professionals } = useDiscovery();
  const catalogKey = professionals.map((professional) => professional.id).join(',');
  const [items, setItems] = useState<readonly ApiPortfolioFeedItem[] | null>(apiBaseUrl ? null : []);
  // The rail plays like a queue: every few seconds it slides to the next
  // professional's work, so everyone's portfolio gets seen without scrolling.
  // A touch pauses it; it resumes after a short idle.
  const railRef = useRef<ScrollView>(null);
  const positionRef = useRef(0);
  const pausedUntilRef = useRef(0);
  const stepWidth = LOOK_CARD_WIDTH + spacing.sm;
  const count = items?.length ?? 0;

  useEffect(() => {
    if (count < 2) return;
    const timer = setInterval(() => {
      if (Date.now() < pausedUntilRef.current) return;
      positionRef.current = (positionRef.current + 1) % count;
      railRef.current?.scrollTo({ x: positionRef.current * stepWidth, animated: true });
    }, LOOK_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [count, stepWidth]);

  useEffect(() => {
    if (!apiBaseUrl) return;
    let active = true;
    void discoveryService.listPortfolioFeed(18)
      .then((feed) => { if (active) setItems(feed); })
      .catch(() => { if (active) setItems((current) => current ?? []); });
    return () => { active = false; };
  }, [catalogKey]);

  if (items && !items.length) return null;

  return (
    <View style={styles.section}>
      <SectionHeading body={t('inspirationBody')} title={t('inspirationTitle')} />
      <HorizontalScrollView
        contentContainerStyle={styles.rail}
        decelerationRate="fast"
        onScrollBeginDrag={() => { pausedUntilRef.current = Number.MAX_SAFE_INTEGER; }}
        onScrollEndDrag={(event) => {
          positionRef.current = Math.round(event.nativeEvent.contentOffset.x / stepWidth);
          pausedUntilRef.current = Date.now() + LOOK_RESUME_AFTER_TOUCH_MS;
        }}
        ref={railRef}
        showsHorizontalScrollIndicator={false}
        snapToInterval={stepWidth}>
        {items === null
          ? [0, 1, 2].map((key) => <View key={key} style={[styles.lookCard, styles.skeleton]} />)
          : items.map((item) => (
            <Pressable
              accessibilityLabel={`${item.professionalName} — ${categoryLabel(item.specialty, item.specialty)}`}
              accessibilityRole="button"
              key={item.id}
              onPress={() => openProfessional(item.professionalId)}
              style={({ pressed }) => [styles.lookCard, pressed && styles.pressed]}>
              <Image contentFit="cover" source={{ uri: item.url }} style={StyleSheet.absoluteFill} transition={200} />
              <View style={styles.lookShade} />
              <View style={styles.lookCaption}>
                <Text numberOfLines={1} style={styles.lookName}>{item.professionalName}</Text>
                <View style={styles.lookMetaRow}>
                  <View style={[styles.statusDot, { backgroundColor: item.available ? '#7BD88F' : 'rgba(255,255,255,0.55)' }]} />
                  <Text numberOfLines={1} style={styles.lookMeta}>{categoryLabel(item.specialty, item.specialty)}</Text>
                </View>
              </View>
            </Pressable>
          ))}
      </HorizontalScrollView>
    </View>
  );
}

/** A shuffled carousel of every visible professional, with their live availability. */
export function DiscoverProfessionalsSection({ professionals, onSeeAll }: { professionals: readonly Professional[]; onSeeAll: () => void }) {
  const { t, categoryLabel } = useClientCopy();
  const ids = professionals.map((professional) => professional.id).join('|');
  // Shuffle once per list so the order doesn't jump while the client scrolls.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mix = useMemo(() => shuffled(professionals).slice(0, 12), [ids]);
  if (!mix.length) return null;

  return (
    <View style={styles.section}>
      <SectionHeading action={t('seeAll')} body={t('discoverBody')} onAction={onSeeAll} title={t('discoverTitle')} />
      <HorizontalScrollView contentContainerStyle={styles.rail} showsHorizontalScrollIndicator={false}>
        {mix.map((professional) => {
          const accepting = professional.acceptingBookings !== false;
          return (
            <Pressable
              accessibilityLabel={`View ${professional.name}`}
              accessibilityRole="button"
              key={professional.id}
              onPress={() => openProfessional(professional.id)}
              style={({ pressed }) => [styles.proCard, pressed && styles.pressed]}>
              <View style={styles.proTop}>
                <View style={styles.proAvatar}>
                  {professional.image
                    ? <Image contentFit="cover" source={professional.image} style={StyleSheet.absoluteFill} />
                    : <Text style={styles.proInitials}>{professional.initials || initialsOf(professional.name)}</Text>}
                </View>
                <View style={styles.ratingChip}>
                  <Text style={styles.ratingText}>★ {professional.reviews ? professional.rating.toFixed(1) : 'New'}</Text>
                </View>
              </View>
              <Text numberOfLines={1} style={styles.proName}>{professional.name}</Text>
              <Text numberOfLines={1} style={styles.proMeta}>{categoryLabel(professional.category, professional.service)} · {professional.zone}</Text>
              <Text style={styles.proPrice}>ETB {professional.priceFrom.toLocaleString()}+</Text>
              <AvailabilityPill accepting={accepting} compact />
            </Pressable>
          );
        })}
      </HorizontalScrollView>
    </View>
  );
}

/** Professionals from the client's own booking history, most recent first. */
export function BookAgainSection({ professionals }: { professionals: readonly Professional[] }) {
  const { t } = useClientCopy();
  const { bookings } = useClientData();
  const byId = new Map(professionals.map((professional) => [professional.id, professional]));
  const seen = new Set<string>();
  const history = [...bookings]
    .filter((booking) => booking.status !== 'cancelled')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .filter((booking) => {
      if (seen.has(booking.professionalId)) return false;
      seen.add(booking.professionalId);
      return true;
    })
    .slice(0, 6);

  return (
    <View style={styles.section}>
      <SectionHeading action={t('history')} onAction={() => router.replace('/bookings' as Href)} title={t('bookAgain')} />
      {history.length ? (
        <View style={styles.historyStack}>
          {history.map((booking) => {
            const professional = byId.get(booking.professionalId);
            const name = professional?.name ?? 'Konjo professional';
            const accepting = professional?.acceptingBookings !== false;
            return (
              <Pressable
                accessibilityRole="button"
                key={booking.id}
                onPress={() => openProfessional(booking.professionalId)}
                style={({ pressed }) => [styles.historyCard, pressed && styles.pressed]}>
                <View style={styles.historyAvatar}><Text style={styles.historyInitials}>{initialsOf(name)}</Text></View>
                <View style={styles.historyCopy}>
                  <Text numberOfLines={1} style={styles.historyName}>{name}</Text>
                  <Text numberOfLines={1} style={styles.historyMeta}>{booking.serviceName} · {booking.dateLabel}</Text>
                  <Text style={styles.historyMeta}>{professional?.reviews ? `★ ${professional.rating.toFixed(1)} · ` : ''}ETB {booking.total.toLocaleString()}</Text>
                </View>
                <Pressable
                  accessibilityLabel={t('bookAgainProfessional').replace('{name}', professional?.firstName ?? name)}
                  accessibilityRole="button"
                  disabled={!accepting}
                  onPress={() => router.push(`/booking/when?professionalId=${encodeURIComponent(booking.professionalId)}&serviceIndex=0` as Href)}
                  style={({ pressed }) => [styles.bookAgainButton, !accepting && styles.dimmed, pressed && styles.pressed]}>
                  <Text style={styles.bookAgainLabel}>{accepting ? t('bookAgain') : t('notTakingBookings')}</Text>
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.historyEmpty}><Text style={styles.historyEmptyText}>{t('bookAgainEmpty')}</Text></View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },
  heading: { marginBottom: spacing.sm },
  headingRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  headingTitle: { flex: 1, color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 22 },
  headingAction: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  headingBody: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13, lineHeight: 19, marginTop: 3 },
  rail: { gap: spacing.sm, paddingRight: spacing.lg },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  dimmed: { opacity: 0.5 },
  skeleton: { backgroundColor: palette.surfaceMuted },
  lookCard: { width: LOOK_CARD_WIDTH, height: 214, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: palette.surfaceMuted },
  lookShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 86, backgroundColor: 'rgba(14, 21, 15, 0.46)' },
  lookCaption: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  lookName: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  lookMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  lookMeta: { flex: 1, color: 'rgba(255,255,255,0.86)', fontFamily: fontFamilies.body.regular, fontSize: 12, textTransform: 'capitalize' },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  proCard: { width: 168, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: spacing.sm, gap: 4 },
  proTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  proAvatar: { width: 54, height: 54, borderRadius: 27, overflow: 'hidden', backgroundColor: palette.sageSoft, alignItems: 'center', justifyContent: 'center' },
  proInitials: { color: palette.olive, fontFamily: fontFamilies.display.medium, fontSize: 19 },
  ratingChip: { borderRadius: radii.pill, backgroundColor: palette.surfaceMuted, paddingHorizontal: 8, paddingVertical: 3 },
  ratingText: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 11 },
  proName: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 15 },
  proMeta: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, textTransform: 'capitalize' },
  proPrice: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13, marginVertical: 4 },
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5 },
  pillCompact: { paddingHorizontal: 8, paddingVertical: 4 },
  pillOn: { backgroundColor: palette.sageSoft },
  pillOff: { backgroundColor: palette.surfaceMuted },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontFamily: fontFamilies.body.semibold, fontSize: 11 },
  historyStack: { gap: spacing.sm },
  historyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: spacing.sm },
  historyAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: palette.sageSoft, alignItems: 'center', justifyContent: 'center' },
  historyInitials: { color: palette.olive, fontFamily: fontFamilies.display.medium, fontSize: 17 },
  historyCopy: { flex: 1, gap: 2 },
  historyName: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 15 },
  historyMeta: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12 },
  bookAgainButton: { borderRadius: radii.pill, backgroundColor: palette.oliveDark, paddingHorizontal: 14, paddingVertical: 9 },
  bookAgainLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  historyEmpty: { borderRadius: radii.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.border, padding: spacing.md },
  historyEmptyText: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 13, lineHeight: 19 },
});
