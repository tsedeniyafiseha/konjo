import { Stack } from 'expo-router';

import { palette } from '@/theme/tokens';

export default function PublicLayout() {
  return (
    <Stack
      screenOptions={{
        animation: 'fade',
        contentStyle: { backgroundColor: palette.canvas },
        headerShown: false,
      }}
    />
  );
}
