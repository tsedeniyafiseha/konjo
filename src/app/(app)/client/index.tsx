import type { Href } from 'expo-router';
import { Redirect } from 'expo-router';
import { useClientAccount } from '@/features/client/account/client-account-context';

export default function ClientEntryRoute() {
  const { account, loadStatus } = useClientAccount();
  if (loadStatus === 'loading') return null;
  return <Redirect href={(account ? '/home' : '/client/onboarding/identity') as Href} />;
}
