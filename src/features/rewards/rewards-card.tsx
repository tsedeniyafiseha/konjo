import { StyleSheet, Text, View } from 'react-native';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { useClientCopy } from '@/localization/use-client-copy';
import { fontFamilies, palette, radii, spacing } from '@/theme/tokens';
import { useClientRewards } from './use-client-rewards';

/**
 * Tells the client about their rewards before they book: the welcome discount
 * on a first booking, a loyalty coupon that is ready, or how close the next
 * coupon is. Rewards apply automatically, so the card only informs.
 */
export function RewardsCard() {
  const { rewards } = useClientRewards();
  const { t } = useClientCopy();
  if (!rewards) return null;
  const percent = String(Math.round(rewards.discountRateBps / 100));
  const every = String(rewards.everyBookings);
  const fill = (key: Parameters<typeof t>[0]) => t(key)
    .replace(/\{percent\}/g, percent)
    .replace(/\{every\}/g, every)
    .replace('{count}', String(rewards.bookingsUntilNextCoupon));
  const offer = rewards.offer;
  const title = offer?.reason === 'first_booking' ? fill('rewardsFirstTitle') : offer ? fill('rewardsCouponTitle') : fill('rewardsProgressTitle');
  const body = offer?.reason === 'first_booking' ? fill('rewardsFirstBody') : offer ? fill('rewardsCouponBody') : fill('rewardsProgressBody');
  const progress = offer ? 1 : (rewards.everyBookings - rewards.bookingsUntilNextCoupon) / rewards.everyBookings;
  return (
    <View accessibilityRole="summary" style={[styles.card, offer && styles.cardOffer]}>
      <View style={[styles.icon, offer && styles.iconOffer]}>
        <KonjoIcon color={offer ? palette.white : palette.olive} name={{ ios: 'gift', android: 'card_giftcard', web: 'card_giftcard' }} size={20} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        {!offer ? (
          <View accessibilityLabel={fill('rewardsProgressAccessibility')} style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginHorizontal: spacing.lg, marginTop: spacing.md, borderRadius: radii.lg, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: spacing.md },
  cardOffer: { borderColor: palette.sage, backgroundColor: palette.sageSoft },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.sageSoft, alignItems: 'center', justifyContent: 'center' },
  iconOffer: { backgroundColor: palette.olive },
  copy: { flex: 1, gap: 4 },
  title: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14.5, lineHeight: 20 },
  body: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18 },
  track: { height: 6, borderRadius: 3, backgroundColor: palette.surfaceMuted, overflow: 'hidden', marginTop: 6 },
  fill: { height: 6, borderRadius: 3, backgroundColor: palette.olive },
});
