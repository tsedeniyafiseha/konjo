import { Stack } from 'expo-router';
import { useMemo } from 'react';

import { clientDependencies } from '@/bootstrap/client-composition-root';
import { BookingProvider } from '@/features/booking/booking-context';
import { palette } from '@/theme/tokens';

export default function BookingLayout() {
  const bookingDraftController = useMemo(
    () => clientDependencies.createBookingDraftController(),
    [],
  );

  return (
    <BookingProvider controller={bookingDraftController}>
      <Stack
        screenOptions={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: palette.canvas },
          headerShown: false,
        }}
      />
    </BookingProvider>
  );
}
