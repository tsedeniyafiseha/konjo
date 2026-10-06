import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import { AdminLoginScreen } from '@/features/admin/admin-login-screen';

/** The operations console is a web tool; the store apps never expose it. */
export default function AdminLoginRoute() {
  if (Platform.OS !== 'web' && !__DEV__) return <Redirect href="/welcome" />;
  return <AdminLoginScreen />;
}
