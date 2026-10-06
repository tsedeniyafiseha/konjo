import type {
  ClientBookingGateway,
  ClientDataRuntime,
  ClientDataScheduler,
  ClientPreferencesGateway,
} from '@/application/client-data/client-data-controller';
import { AppState } from 'react-native';

import { bookingService } from '@/features/booking/booking-service';
import { clientDataService } from '@/features/client/client-data-service';

export const clientBookingGateway: ClientBookingGateway = {
  list: (accessToken) => bookingService.listBookings(accessToken),
  cancel: (bookingId, accessToken) => bookingService.cancelBooking(bookingId, accessToken),
  archive: (bookingId, accessToken) => bookingService.archiveBooking(bookingId, accessToken),
  reschedule: (bookingId, dateIso, time, accessToken) => (
    bookingService.rescheduleBooking(bookingId, dateIso, time, accessToken)
  ),
  initiatePayment: (bookingId, accessToken) => bookingService.initiatePayment(bookingId, accessToken),
  verifyPayment: (bookingId, accessToken) => bookingService.verifyPayment(bookingId, accessToken),
  async submitReview(bookingId, input, accessToken) {
    await bookingService.submitReview(bookingId, input, accessToken);
  },
};

export const clientPreferencesGateway: ClientPreferencesGateway = {
  load: (accessToken) => clientDataService.getClientData(accessToken),
  setFavorite: (accessToken, professionalId, favorite) => (
    clientDataService.setFavorite(accessToken, professionalId, favorite)
  ),
  updateNotificationPreferences: (accessToken, preferences) => (
    clientDataService.updateNotificationPreferences(accessToken, preferences)
  ),
};

export const systemClientDataScheduler: ClientDataScheduler = {
  every(milliseconds, task) {
    // Skip ticks while backgrounded and catch up the moment the app returns.
    const interval = setInterval(() => { if (AppState.currentState === 'active') task(); }, milliseconds);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') task(); });
    return () => { clearInterval(interval); subscription.remove(); };
  },
};

export const systemClientDataRuntime: ClientDataRuntime = {
  dateLabel(dateIso) {
    const date = new Date(`${dateIso}T12:00:00`);
    return Number.isNaN(date.getTime())
      ? dateIso
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },
};
