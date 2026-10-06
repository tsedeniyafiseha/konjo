import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';

import {
  BookingFooter,
  BookingHeader,
  BookingPrimaryButton,
  MissingBooking,
  PriceSummary,
  SelectionIndicator,
} from '@/features/booking/booking-components';
import { useBooking } from '@/features/booking/booking-context';
import { ClientAddressForm } from '@/features/client/account/client-address-form';
import { useClientAccount } from '@/features/client/account/client-account-context';
import { useDiscovery } from '@/features/discovery/discovery-context';
import { useClientCopy } from '@/localization/use-client-copy';
import { rewardDiscountFor, useClientRewards } from '@/features/rewards/use-client-rewards';
import { useState } from 'react';
import { fontFamilies, layout, palette, spacing } from '@/theme/tokens';

export function BookingWhereScreen() {
  const { getProfessional } = useDiscovery();
  const { draft, selectAddress } = useBooking();
  const { account, addAddress } = useClientAccount();
  const { t } = useClientCopy();
  const { rewards } = useClientRewards();
  const [addingAddress, setAddingAddress] = useState(false);
  const professional = getProfessional(draft?.professionalId);
  const service = draft ? professional?.services[draft.serviceIndex] : undefined;
  const address = account?.addresses.find((item) => item.id === draft?.addressId);
  const bookingReady = Boolean(draft?.dateIso && draft.time && professional && service);

  if (!bookingReady || !draft || !professional || !service) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <MissingBooking onExit={() => router.replace('/browse' as Href)} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.contentFrame}>
          <BookingHeader label="Where" onBack={() => router.back()} step={2} />
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" style={styles.title}>{t('locationTitle')}</Text>
            <Text style={styles.intro}>
              {t('chooseAddressBody')}
            </Text>

            {!addingAddress ? (
              <View accessibilityRole="radiogroup" style={styles.addressList}>
              {account?.addresses.map((option) => {
                const selected = option.id === draft.addressId;
                return (
                  <Pressable
                    accessibilityLabel={`${option.label}, ${option.detail}, ${option.zone}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    key={option.id}
                    onPress={() => selectAddress(option.id)}
                    style={({ pressed }) => [
                      styles.addressCard,
                      selected && styles.addressCardSelected,
                      pressed && styles.pressed,
                    ]}>
                    <SelectionIndicator selected={selected} />
                    <View style={styles.addressCopy}>
                      <Text style={styles.addressLabel}>{option.label}</Text>
                      <Text style={styles.addressDetail}>{option.detail}</Text>
                    </View>
                    <Text style={[styles.addressZone, selected && styles.addressZoneSelected]}>
                      {option.zone}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityLabel={t('addNewAddress')}
                accessibilityRole="button"
                onPress={() => setAddingAddress(true)}
                style={styles.addAddressButton}>
                <Text style={styles.addAddressLabel}>+ {t('addNewAddress')}</Text>
              </Pressable>
              {account?.addresses.length === 0 ? (
                <Text style={styles.emptyNote}>{t('noSavedAddress')}</Text>
              ) : null}
              </View>
            ) : (
              <View style={styles.addressForm}>
                <ClientAddressForm
                  onCancel={() => setAddingAddress(false)}
                  onSave={async (newAddress) => {
                    const addressId = await addAddress(newAddress);
                    selectAddress(addressId);
                    setAddingAddress(false);
                  }}
                />
              </View>
            )}

            {address ? <View style={styles.summaryWrapper}>
              <PriceSummary
                discount={rewardDiscountFor(rewards, service.price)}
                serviceName={service.name}
                servicePrice={service.price}
                travelFee={0}
                zone={address.zone}
              />
              <View style={styles.travelFeeNotice}>
                <KonjoIcon color={palette.olive} name={{ ios: 'info.circle', android: 'info_outline', web: 'info_outline' }} size={15} />
                <Text style={styles.travelFeeNoticeText}>{t('travelFeeSetByProfessional')}</Text>
              </View>
            </View> : null}
          </ScrollView>
        </View>
      </SafeAreaView>
      <SafeAreaView edges={['bottom']} style={styles.footerSafeArea}>
        <BookingFooter>
          <BookingPrimaryButton
            disabled={!address}
            label={t('continueToPayment')}
            onPress={() => router.push('/booking/payment' as Href)}
          />
        </BookingFooter>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  safeArea: { flex: 1, alignItems: 'center' },
  contentFrame: { flex: 1, width: '100%', maxWidth: layout.contentMaxWidth },
  scrollView: { paddingHorizontal: spacing.lg },
  scrollContent: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },
  title: {
    color: palette.text,
    fontFamily: fontFamilies.display.medium,
    fontSize: 26,
    lineHeight: 33,
  },
  intro: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 6,
  },
  addressList: { gap: 10, paddingTop: spacing.lg },
  addressForm: { paddingTop: spacing.lg },
  addressCard: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  addressCardSelected: { borderWidth: 1.5, borderColor: palette.sage, backgroundColor: '#F4FBF2' },
  addressCopy: { flex: 1, minWidth: 0 },
  addressLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14.5 },
  addressDetail: {
    color: palette.textSecondary,
    fontFamily: fontFamilies.body.regular,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 2,
  },
  addressZone: { color: palette.textMuted, fontFamily: fontFamilies.body.semibold, fontSize: 12 },
  addressZoneSelected: { color: palette.olive },
  addAddressButton: {
    minHeight: 50,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#C5C8BC',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  addAddressLabel: { color: palette.textMuted, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  emptyNote: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 17, textAlign: 'center' },
  summaryWrapper: { marginTop: spacing.lg },
  travelFeeNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: 2,
  },
  travelFeeNoticeText: {
    flex: 1,
    color: palette.textMuted,
    fontFamily: fontFamilies.body.regular,
    fontSize: 11.5,
    lineHeight: 17,
  },
  footerSafeArea: { backgroundColor: palette.canvas },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
