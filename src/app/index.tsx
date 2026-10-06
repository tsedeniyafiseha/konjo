import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';
import { useAuthSession } from '@/features/auth/session-context';
import { WelcomeScreen } from '@/features/onboarding/welcome-screen';

export default function EntryRoute() {
  const { session, status } = useAuthSession();

  // Still restoring session — render nothing so the splash screen stays up.
  if (status === 'restoring') return null;

  // Already signed in — skip the welcome screen and go straight to the dashboard.
  if (status === 'authenticated' && session?.role) {
    const target: Href =
      session.role === 'professional' ? '/pro' :
      session.role === 'admin' ? '/admin' :
      '/home';
    return <Redirect href={target} />;
  }

  return <WelcomeScreen />;
}
