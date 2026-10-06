import { BodoniModa_400Regular } from '@expo-google-fonts/bodoni-moda/400Regular';
import { BodoniModa_500Medium } from '@expo-google-fonts/bodoni-moda/500Medium';
import { BodoniModa_600SemiBold } from '@expo-google-fonts/bodoni-moda/600SemiBold';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { NotoSansEthiopic_400Regular } from '@expo-google-fonts/noto-sans-ethiopic/400Regular';
import { NotoSansEthiopic_600SemiBold } from '@expo-google-fonts/noto-sans-ethiopic/600SemiBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import '@/features/location/live-location-reporter';

import { clientDependencies } from '@/bootstrap/client-composition-root';
import { SessionProvider, useAuthSession } from '@/features/auth/session-context';
import { ClientAuthProvider } from '@/features/auth/client-auth-context';
import { ClientLanguageProvider } from '@/localization/client-language-context';
import { palette } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

const rootScreenOptions = {
  animation: 'fade' as const,
  contentStyle: { backgroundColor: palette.canvas },
  headerShown: false,
};

function RootNavigator() {
  const { status } = useAuthSession();

  useEffect(() => {
    if (status !== 'restoring') SplashScreen.hideAsync();
  }, [status]);

  if (status === 'restoring') return null;

  // Keep the root route table stable while auth state changes. Rebuilding
  // Protected groups during OTP completion can make Expo Router rehydrate in
  // a loop on web; nested layouts enforce access for each role.
  return (
    <Stack screenOptions={rootScreenOptions} initialRouteName="index">
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(public)" options={{ headerShown: false }} />
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
      <Stack.Screen name="(professional)" options={{ headerShown: false }} />
      <Stack.Screen name="(admin)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BodoniModa_400Regular,
    BodoniModa_500Medium,
    BodoniModa_600SemiBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    NotoSansEthiopic_400Regular,
    NotoSansEthiopic_600SemiBold,
  });

  useEffect(() => {
    if (fontError && __DEV__) console.error('Unable to load the Konjo fonts.', fontError);
  }, [fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <KeyboardProvider>
      <ClientLanguageProvider controller={clientDependencies.languageController}>
        <ClientAuthProvider
          gateway={clientDependencies.clientAuthenticationGateway}
          professionalGateway={clientDependencies.professionalAuthenticationGateway}
          phoneGateway={clientDependencies.phoneAuthenticationGateway}>
          <SessionProvider controller={clientDependencies.sessionController}>
            <RootNavigator />
          </SessionProvider>
        </ClientAuthProvider>
      </ClientLanguageProvider>
    </KeyboardProvider>
  );
}
