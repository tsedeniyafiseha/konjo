import * as Location from 'expo-location';

import type { ApiSafetyIncident } from '../../../shared/api-contracts';
import { apiRequest } from '@/services/api-client';

export interface SafetyAlertResult {
  incident: ApiSafetyIncident | null;
  locationShared: boolean;
}

export const safetyService = {
  async raiseAlert(bookingId: string, token?: string): Promise<SafetyAlertResult> {
    let location: { latitude: number; longitude: number; accuracyMeters: number } | null = null;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.granted) {
        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Math.max(0, position.coords.accuracy ?? 0),
        };
      }
    } catch (error) {
      if (__DEV__) console.warn('SOS location capture failed; sending the alert without coordinates.', error);
    }

    if (!token) return { incident: null, locationShared: Boolean(location) };
    const response = await apiRequest<{ safetyIncident: ApiSafetyIncident }>(
      `/v1/bookings/${encodeURIComponent(bookingId)}/sos`,
      { method: 'POST', token, body: location ?? {} },
    );
    return { incident: response.safetyIncident, locationShared: Boolean(location) };
  },
};
