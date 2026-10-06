import type { Href } from 'expo-router';
import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';
import { Platform } from 'react-native';

import { clientDependencies } from '@/bootstrap/client-composition-root';
import { AdminDocumentProvider } from '@/features/admin/documents/admin-document-context';
import { useAuthSession } from '@/features/auth/session-context';

export default function AdminLayout() {
  const { session, status } = useAuthSession();
  const [documentController] = useState(
    clientDependencies.createAdminDocumentController,
  );
  // The operations console ships only in the web build (and development).
  if (Platform.OS !== 'web' && !__DEV__) return <Redirect href={'/welcome' as Href} />;
  if (status !== 'authenticated' || session?.role !== 'admin') return <Redirect href={'/admin-login' as Href} />;
  return (
    <AdminDocumentProvider controller={documentController}>
      <Stack screenOptions={{ headerShown: false }} />
    </AdminDocumentProvider>
  );
}
