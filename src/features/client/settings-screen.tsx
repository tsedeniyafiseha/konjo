import type { Href } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KonjoIcon } from '@/components/ui/konjo-icon';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view';
import { ClientAddressForm } from '@/features/client/account/client-address-form';
import { useClientAccount } from '@/features/client/account/client-account-context';
import { ClientBackHeader, KonjoSwitch } from '@/features/client/client-screen-components';
import { type NotificationPreferenceKey, useClientData } from '@/features/client/client-data-context';
import { useAuthSession } from '@/features/auth/session-context';
import type { ClientCopyKey } from '@/localization/client-copy';
import { useClientCopy } from '@/localization/use-client-copy';
import { openSupportEmail, supportEmail } from '@/features/support/support-links';
import { fontFamilies, layout, palette, radii, spacing } from '@/theme/tokens';

type SettingsSection = 'profile' | 'addresses' | 'payment-methods' | 'notifications' | 'privacy' | 'help';

const validSections: ReadonlySet<string> = new Set<SettingsSection>([
  'profile',
  'addresses',
  'payment-methods',
  'notifications',
  'privacy',
  'help',
]);

const sectionTitleKeys: Record<SettingsSection, ClientCopyKey> = {
  profile: 'personalDetails',
  addresses: 'savedAddresses',
  'payment-methods': 'paymentMethods',
  notifications: 'notifications',
  privacy: 'privacySecurity',
  help: 'helpSupport',
};

const notificationRows: readonly {
  key: NotificationPreferenceKey;
  labelKey: ClientCopyKey;
  descriptionKey: ClientCopyKey;
}[] = [
  { key: 'bookingUpdates', labelKey: 'bookingUpdates', descriptionKey: 'bookingUpdatesDescription' },
  { key: 'promotions', labelKey: 'promotionsOffers', descriptionKey: 'promotionsDescription' },
  { key: 'smsReminders', labelKey: 'smsReminders', descriptionKey: 'smsRemindersDescription' },
];

function SettingsCard({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function AddressesContent() {
  const { account, addAddress, removeAddress, setDefaultAddress, updateAddress } = useClientAccount();
  const { t } = useClientCopy();
  const [adding, setAdding] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const addresses = account?.addresses ?? [];

  return (
    <View style={styles.stack}>
      {addresses.map((address) => editingAddressId === address.id ? (
        <ClientAddressForm
          initialAddress={address}
          key={address.id}
          onCancel={() => setEditingAddressId(null)}
          onSave={async (changes) => {
            await updateAddress(address.id, changes);
            setEditingAddressId(null);
          }}
          submitLabel={t('updateAddress')}
        />
      ) : (
        <View key={address.id} style={styles.addressCard}>
          <KonjoIcon color={palette.olive} name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }} size={20} />
          <View style={styles.flexCopy}>
            <View style={styles.labelRow}>
              <Text style={styles.itemTitle}>{address.label}</Text>
              {address.id === account?.defaultAddressId ? <Text style={styles.defaultBadge}>{t('defaultLabel')}</Text> : null}
            </View>
            <Text style={styles.itemDescription}>{address.detail}</Text>
            <Text style={styles.zoneText}>{t('travelZone').replace('{zone}', address.zone)}</Text>
            <View style={styles.addressActions}>
              <Pressable accessibilityRole="button" onPress={() => setEditingAddressId(address.id)}>
                <Text style={styles.addressActionLabel}>{t('edit')}</Text>
              </Pressable>
              {address.id !== account?.defaultAddressId ? (
                <Pressable accessibilityRole="button" onPress={() => setDefaultAddress(address.id)}>
                  <Text style={styles.addressActionLabel}>{t('makeDefault')}</Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => Alert.alert(
                  t('removeAddressTitle'),
                  t('removeAddressBody').replace('{label}', address.label),
                  [
                    { text: t('keepAddress'), style: 'cancel' },
                    { text: t('remove'), style: 'destructive', onPress: () => removeAddress(address.id) },
                  ],
                )}>
                <Text style={[styles.addressActionLabel, styles.removeLabel]}>{t('remove')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ))}
      {addresses.length === 0 && !adding ? (
        <Text style={styles.emptyState}>{t('noSavedAddressesSettings')}</Text>
      ) : null}
      {adding ? (
        <ClientAddressForm
          onCancel={() => setAdding(false)}
          onSave={async (address) => {
            await addAddress(address);
            setAdding(false);
          }}
        />
      ) : (
        <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={styles.addAction}>
          <Text style={styles.addActionLabel}>+ {t('addNewAddressLong')}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ProfileContent() {
  const { account, updateProfile } = useClientAccount();
  const { t } = useClientCopy();
  const [fullName, setFullName] = useState(account?.profile.fullName ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!account) return null;

  const save = async () => {
    if (fullName.trim().length < 2) {
      setMessage(t('enterFullName'));
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await updateProfile({ fullName: fullName.trim() });
      setMessage(t('detailsUpdated'));
    } catch (error) {
      if (__DEV__) console.error('Unable to update client profile.', error);
      setMessage(t('saveChangesError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.stack}>
      <View style={styles.formField}>
        <Text style={styles.formLabel}>{t('fullName')}</Text>
        <TextInput autoComplete="name" onChangeText={setFullName} style={styles.input} textContentType="name" value={fullName} />
      </View>
      <View style={styles.formField}>
        <Text style={styles.formLabel}>{t('emailAddress')}</Text>
        <View style={styles.readOnlyInput}><Text style={styles.readOnlyText}>{account.profile.email ?? t('notAdded')}</Text></View>
        <Text style={styles.fieldNote}>{t('emailChangeNote')}</Text>
      </View>
      <View style={styles.formField}>
        <Text style={styles.formLabel}>{t('phoneWhatsApp')}</Text>
        <View style={styles.readOnlyInput}><Text style={styles.readOnlyText}>{account.profile.phoneNumber ?? t('notAdded')}</Text></View>
        <Text style={styles.fieldNote}>{t('phoneChangeVerificationNote')}</Text>
      </View>
      {message ? <Text accessibilityLiveRegion="polite" style={styles.formMessage}>{message}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ busy: saving, disabled: saving }} disabled={saving} onPress={save} style={styles.primaryAction}>
        <Text style={styles.primaryActionLabel}>{saving ? t('saving') : t('saveChanges')}</Text>
      </Pressable>
    </View>
  );
}

function PaymentMethodsContent() {
  const { t } = useClientCopy();
  return (
    <View style={styles.stack}>
      {[
        ['Telebirr', t('telebirrCheckout')],
        ['CBE Birr', t('cbeCheckout')],
        ['Visa / Mastercard', t('cardCheckout')],
      ].map(([label, description]) => (
        <View key={label} style={styles.paymentCard}>
          <View style={styles.paymentMark}><Text style={styles.paymentMarkText}>{label.slice(0, 3).toUpperCase()}</Text></View>
          <View style={styles.flexCopy}>
            <Text style={styles.itemTitle}>{label}</Text>
            <Text style={styles.itemDescription}>{description}</Text>
          </View>
        </View>
      ))}
      <View style={styles.securityNotice}>
        <KonjoIcon color={palette.olive} name={{ ios: 'shield', android: 'shield', web: 'shield' }} size={18} />
        <Text style={styles.securityText}>{t('paymentDataPrivacy')}</Text>
      </View>
    </View>
  );
}

function NotificationsContent() {
  const { notificationPreferences, toggleNotificationPreference } = useClientData();
  const { t } = useClientCopy();
  return (
    <SettingsCard>
      {notificationRows.map((row, index) => (
        <View key={row.key} style={[styles.preferenceRow, index < notificationRows.length - 1 && styles.borderBottom]}>
          <View style={styles.flexCopy}>
            <Text style={styles.itemTitle}>{t(row.labelKey)}</Text>
            <Text style={styles.itemDescription}>{t(row.descriptionKey)}</Text>
          </View>
          <KonjoSwitch
            label={t(row.labelKey)}
            onChange={() => toggleNotificationPreference(row.key)}
            value={notificationPreferences[row.key]}
          />
        </View>
      ))}
    </SettingsCard>
  );
}

function PrivacyContent() {
  const { deleteAccount } = useClientAccount();
  const { signOut } = useAuthSession();
  const { t } = useClientCopy();
  const confirmDeletion = () => Alert.alert(
    t('deleteAccountTitle'),
    t('deleteAccountBody'),
    [
      { text: t('keepAccount'), style: 'cancel' },
      {
        text: t('deleteAccount'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount();
            await signOut();
            router.replace('/welcome' as Href);
          } catch (error) {
            if (__DEV__) console.error('Unable to delete client account.', error);
            Alert.alert(t('accountNotDeleted'), t('accountDeleteError'));
          }
        },
      },
    ],
  );
  return (
    <View style={styles.stack}>
      <View style={styles.securityNotice}>
        <KonjoIcon color={palette.olive} name={{ ios: 'lock.shield', android: 'shield', web: 'shield' }} size={18} />
        <Text style={styles.securityText}>{t('sessionSecurity')}</Text>
      </View>
      <SettingsCard>
        <View style={styles.privacyRow}><Text style={styles.itemTitle}>{t('location')}</Text><Text style={styles.itemDescription}>{t('locationPrivacySettings')}</Text></View>
        <View style={[styles.privacyRow, styles.borderTop]}><Text style={styles.itemTitle}>{t('accountData')}</Text><Text style={styles.itemDescription}>{t('accountDataPrivacy')}</Text></View>
      </SettingsCard>
      <Pressable accessibilityRole="button" onPress={confirmDeletion} style={styles.deleteAccountButton}>
        <Text style={styles.deleteAccountLabel}>{t('deleteAccount')}</Text>
      </Pressable>
    </View>
  );
}

function HelpContent() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const { t } = useClientCopy();
  const questions = [
    [t('refundsQuestion'), t('refundsAnswer')],
    [t('sameSpecialistQuestion'), t('sameSpecialistAnswer')],
    [t('specialistCancelsQuestion'), t('specialistCancelsAnswer')],
  ];
  return (
    <View style={styles.stack}>
      <View style={styles.securityNotice}><KonjoIcon color={palette.olive} name={{ ios: 'message', android: 'chat_bubble_outline', web: 'chat_bubble_outline' }} size={18} /><Text style={styles.securityText}>{t('supportComingSoon')}</Text></View>
      <Pressable accessibilityRole="button" onPress={() => { void openSupportEmail('Konjo support request'); }} style={styles.supportButton}>
        <Text style={styles.supportButtonLabel}>{t('emailSupport')} · {supportEmail}</Text>
        <Text style={styles.supportButtonNote}>{t('emailSupportNote')}</Text>
      </Pressable>
      <Text style={styles.eyebrow}>{t('frequentlyAsked')}</Text>
      <SettingsCard>
        {questions.map(([question, answer], index) => (
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === index }} key={question} onPress={() => setExpanded(expanded === index ? null : index)} style={[styles.questionRow, index < questions.length - 1 && styles.borderBottom]}>
            <View style={styles.questionTitleRow}><Text style={styles.question}>{question}</Text><Text style={styles.questionSymbol}>{expanded === index ? '−' : '+'}</Text></View>
            {expanded === index ? <Text style={styles.answer}>{answer}</Text> : null}
          </Pressable>
        ))}
      </SettingsCard>
    </View>
  );
}

export function SettingsScreen() {
  const { t } = useClientCopy();
  const params = useLocalSearchParams<{ section?: string }>();
  const rawSection = Array.isArray(params.section) ? params.section[0] : params.section;
  const section: SettingsSection = rawSection && validSections.has(rawSection)
    ? (rawSection as SettingsSection)
    : 'help';

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/profile' as Href);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.contentFrame}>
          <ClientBackHeader onBack={goBack} title={t(sectionTitleKeys[section])} />
          <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {section === 'profile' ? <ProfileContent /> : null}
            {section === 'addresses' ? <AddressesContent /> : null}
            {section === 'payment-methods' ? <PaymentMethodsContent /> : null}
            {section === 'notifications' ? <NotificationsContent /> : null}
            {section === 'privacy' ? <PrivacyContent /> : null}
            {section === 'help' ? <HelpContent /> : null}
          </KeyboardAwareScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas },
  safeArea: { flex: 1, alignItems: 'center' },
  contentFrame: { flex: 1, width: '100%', maxWidth: layout.contentMaxWidth },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  stack: { gap: spacing.sm },
  card: { overflow: 'hidden', borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface },
  addressCard: { minHeight: 82, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, padding: spacing.md },
  flexCopy: { flex: 1, minWidth: 0 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  itemTitle: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  itemDescription: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 18, marginTop: 2 },
  zoneText: { color: palette.olive, fontFamily: fontFamilies.body.medium, fontSize: 11, marginTop: 4 },
  defaultBadge: { color: palette.gold, fontFamily: fontFamilies.body.bold, fontSize: 9, borderRadius: radii.pill, backgroundColor: 'rgba(200,162,82,0.13)', paddingHorizontal: 8, paddingVertical: 3 },
  addressActions: { flexDirection: 'row', gap: spacing.md, marginTop: 10 },
  addressActionLabel: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 11.5 },
  removeLabel: { color: palette.error },
  addAction: { minHeight: 50, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.textMuted, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  addActionLabel: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  emptyState: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 19, textAlign: 'center', paddingVertical: spacing.sm },
  note: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11, lineHeight: 17, textAlign: 'center' },
  paymentCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, padding: spacing.md },
  paymentMark: { width: 42, height: 42, borderRadius: 9, backgroundColor: palette.sageSoft, alignItems: 'center', justifyContent: 'center' },
  paymentMarkText: { color: palette.oliveDark, fontFamily: fontFamilies.body.bold, fontSize: 9 },
  securityNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radii.md, backgroundColor: palette.sageSoft, padding: spacing.md },
  supportButton: { borderRadius: radii.md, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, padding: spacing.md },
  supportButtonLabel: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  supportButtonNote: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 11.5, marginTop: 2 },
  securityText: { flex: 1, color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 18 },
  formField: { gap: 7 },
  formLabel: { color: palette.text, fontFamily: fontFamilies.body.medium, fontSize: 12.5 },
  input: { minHeight: 52, borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surface, color: palette.text, fontFamily: fontFamilies.body.regular, fontSize: 14.5, paddingHorizontal: 15 },
  readOnlyInput: { minHeight: 52, justifyContent: 'center', borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surfaceMuted, paddingHorizontal: 15 },
  readOnlyText: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 14 },
  fieldNote: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 10.5, lineHeight: 16 },
  formMessage: { color: palette.olive, fontFamily: fontFamilies.body.medium, fontSize: 12, lineHeight: 18 },
  primaryAction: { minHeight: 52, borderRadius: radii.sm, backgroundColor: palette.oliveDark, alignItems: 'center', justifyContent: 'center' },
  primaryActionLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  privacyRow: { padding: spacing.md },
  borderTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.surfaceMuted },
  deleteAccountButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
  deleteAccountLabel: { color: palette.error, fontFamily: fontFamilies.body.semibold, fontSize: 13.5 },
  preferenceRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md },
  borderBottom: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.surfaceMuted },
  eyebrow: { color: palette.textMuted, fontFamily: fontFamilies.body.semibold, fontSize: 11, letterSpacing: 0.5, marginTop: spacing.xs },
  questionRow: { minHeight: 58, justifyContent: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  questionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  question: { flex: 1, color: palette.text, fontFamily: fontFamilies.body.medium, fontSize: 13.5, lineHeight: 20 },
  questionSymbol: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 18 },
  answer: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 19, marginTop: spacing.xs },
});
