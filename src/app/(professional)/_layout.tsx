import type { Href } from 'expo-router';
import { router, Stack, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { KonjoButton } from '@/components/ui/konjo-button';

import { clientDependencies } from '@/bootstrap/client-composition-root';
import { ProfessionalLiveLocation } from '@/features/location/professional-live-location';
import { NotificationBanner } from '@/features/notifications/notification-banner';
import { NotificationProvider } from '@/features/notifications/notification-context';
import { ProfessionalToast } from '@/features/professional/professional-components';
import { ProfessionalDataProvider } from '@/features/professional/professional-data-context';
import { ProfessionalDocumentProvider } from '@/features/professional/documents/professional-document-context';
import { ProfessionalRegistrationProvider, useProfessionalRegistration } from '@/features/professional/registration/professional-registration-context';
import { professionalPalette } from '@/theme/tokens';
import { useAuthSession } from '@/features/auth/session-context';
import { professionalRouteRedirect } from '@/application/professional-registration/professional-entry-route';
import { professionalCopy } from '@/localization/professional-copy';
import { resolveProfessionalLanguage } from '@/localization/use-professional-copy';

function normalizePathname(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

function ProfessionalRoutes() {
  const { session, status, signOut } = useAuthSession();
  const [professionalDataController] = useState(
    clientDependencies.createProfessionalDataController,
  );
  const [professionalDocumentController] = useState(
    clientDependencies.createProfessionalDocumentController,
  );
  const pathname = normalizePathname(usePathname());
  const { application, draft, loadStatus, retryLoad } = useProfessionalRegistration();
  const language = resolveProfessionalLanguage(application, draft);
  const copy = professionalCopy[language];

  const authenticated = status === 'authenticated' && session?.role === 'professional';
  const phoneProven = Boolean(session?.phoneNumber) && session?.phoneVerified !== false;
  // Leaving the professional area entirely.
  const exit = status === 'restoring'
    ? null
    : !authenticated
      ? '/welcome'
      : !phoneProven
        ? '/professional-auth?intent=recovery'
        : null;
  // Moving between professional routes (onboarding ↔ pending ↔ dashboard).
  const redirect = exit ?? (authenticated && phoneProven && loadStatus === 'ready'
    ? professionalRouteRedirect(application, pathname)
    : null);

  // Navigate from an effect and keep the Stack mounted. Replacing the navigator
  // with a <Redirect> while a transition was in flight (for example right after
  // submitting the application) made Expo Router restore the previous route on
  // web and loop until React raised "Maximum update depth exceeded".
  useEffect(() => {
    if (redirect && redirect !== pathname) router.replace(redirect as Href);
  }, [redirect, pathname]);

  if (status === 'restoring' || exit) return null;
  if (loadStatus === 'loading') return null;
  if (loadStatus === 'error') return (
    <View style={styles.errorState}>
      <Text accessibilityRole="alert">{copy.loadError}</Text>
      <KonjoButton label={copy.retry} onPress={() => { void retryLoad(); }} />
      <KonjoButton label={copy.signOut} onPress={() => { void signOut(); }} />
    </View>
  );

  return (
    <ProfessionalDocumentProvider controller={professionalDocumentController}>
      <ProfessionalDataProvider controller={professionalDataController}>
        <NotificationProvider language={language} role="professional">
          <View style={styles.container}>
            <Stack screenOptions={{ animation: 'fade', contentStyle: { backgroundColor: professionalPalette.canvas }, headerShown: false }} />
            {redirect ? <View pointerEvents="none" style={styles.transition} /> : null}
            <NotificationBanner />
          </View>
          {application?.status === 'approved' ? <ProfessionalLiveLocation /> : null}
          <ProfessionalToast />
        </NotificationProvider>
      </ProfessionalDataProvider>
    </ProfessionalDocumentProvider>
  );
}

export default function ProfessionalLayout() {
  const [registrationController] = useState(
    clientDependencies.createProfessionalRegistrationController,
  );
  return (
    <ProfessionalRegistrationProvider controller={registrationController}>
      <ProfessionalRoutes />
    </ProfessionalRegistrationProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: professionalPalette.canvas },
  // Covers the outgoing screen for the one frame before the replace lands.
  transition: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: professionalPalette.canvas },
  errorState: { flex: 1, justifyContent: 'center', padding: 24, gap: 16, backgroundColor: professionalPalette.canvas },
});
