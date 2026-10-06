import type { Href } from 'expo-router';
import { Redirect, Stack, usePathname } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { KonjoButton } from '@/components/ui/konjo-button';

import { clientDependencies } from '@/bootstrap/client-composition-root';
import { ClientAccountProvider, useClientAccount } from '@/features/client/account/client-account-context';
import { ClientDataProvider } from '@/features/client/client-data-context';
import { ClientIdentityDocumentProvider, useClientIdentityDocuments } from '@/features/client/identity-documents/client-identity-document-context';
import { DiscoveryProvider } from '@/features/discovery/discovery-context';
import { NotificationBanner } from '@/features/notifications/notification-banner';
import { NotificationProvider } from '@/features/notifications/notification-context';
import { useClientLanguage } from '@/localization/client-language-context';
import { palette } from '@/theme/tokens';
import { useAuthSession } from '@/features/auth/session-context';

function ClientStack() {
  const pathname = usePathname();
  const { language } = useClientLanguage();
  const { account, loadStatus, retryLoad } = useClientAccount();
  const { signOut } = useAuthSession();
  const identity = useClientIdentityDocuments();
  const [discoveryController] = useState(
    () => clientDependencies.createDiscoveryController(),
  );
  const [clientDataController] = useState(
    () => clientDependencies.createClientDataController(),
  );
  if (loadStatus === 'loading' || identity.loading) return null;
  if (loadStatus === 'error' || identity.loadFailed) return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: palette.canvas }}>
      <Text accessibilityRole="alert">We couldn’t load your saved registration. Check your connection and try again.</Text>
      <KonjoButton label="Retry" onPress={() => { void retryLoad(); void identity.refresh(); }} />
      <KonjoButton label="Sign out" onPress={() => { void signOut(); }} />
    </View>
  );
  const isOnboarding = pathname.startsWith('/client/onboarding');
  const isIdentity = pathname === '/client/onboarding/identity';
  const isLocation = pathname === '/client/onboarding/location';
  if (!identity.complete && !isIdentity) return <Redirect href={'/client/onboarding/identity' as Href} />;
  if (!account && (!isOnboarding || (!isIdentity && !isLocation))) {
    return <Redirect href={'/client/onboarding/identity' as Href} />;
  }
  if (!account && isLocation && !identity.complete) {
    return <Redirect href={'/client/onboarding/identity' as Href} />;
  }
  if (account && identity.complete && isOnboarding) return <Redirect href={'/home' as Href} />;
  return (
    <DiscoveryProvider controller={discoveryController}>
      <ClientDataProvider controller={clientDataController}>
        <NotificationProvider language={account?.profile.preferredLanguage ?? language} role="client">
          <View style={{ flex: 1 }}>
            <Stack
              screenOptions={{
                animation: 'fade',
                contentStyle: { backgroundColor: palette.canvas },
                headerShown: false,
              }}
            />
            <NotificationBanner />
          </View>
        </NotificationProvider>
      </ClientDataProvider>
    </DiscoveryProvider>
  );
}

function ClientRoutes() {
  const { session, status } = useAuthSession();
  const [identityDocumentController] = useState(
    () => clientDependencies.createClientIdentityDocumentController(),
  );
  if (status === 'restoring') return null;
  if (status !== 'authenticated' || session?.role !== 'client') return <Redirect href={'/welcome' as Href} />;
  return (
    <ClientIdentityDocumentProvider controller={identityDocumentController}>
      <ClientStack />
    </ClientIdentityDocumentProvider>
  );
}

export default function AppLayout() {
  const { language } = useClientLanguage();
  const [clientAccountController] = useState(
    () => clientDependencies.createClientAccountController(language),
  );
  return (
    <ClientAccountProvider controller={clientAccountController}>
      <ClientRoutes />
    </ClientAccountProvider>
  );
}
