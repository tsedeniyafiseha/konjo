import type {
  ApiDevicePlatform,
  ApiDeviceRegistration,
  ApiNotificationRecord,
} from '../../../shared/api-contracts';
import { apiRequest } from '@/services/api-client';
import { liveUpdatesGateway } from '@/bootstrap/client-composition-root';

export const notificationService = {
  async registerDevice(token: string, platform: ApiDevicePlatform, accessToken: string) {
    const response = await apiRequest<{ device: ApiDeviceRegistration }>('/v1/devices', {
      method: 'POST',
      token: accessToken,
      body: { token, platform },
    });
    return response.device;
  },

  unregisterDevice(registrationId: string, accessToken: string): Promise<void> {
    return apiRequest(`/v1/devices/${encodeURIComponent(registrationId)}`, {
      method: 'DELETE',
      token: accessToken,
    });
  },

  async listNotifications(accessToken: string) {
    const response = await apiRequest<{ notifications: ApiNotificationRecord[] }>('/v1/notifications', {
      token: accessToken,
    });
    return response.notifications;
  },

  /** Marks inbox records as read. Backed by Supabase; a no-op elsewhere. */
  async markRead(ids: readonly string[]): Promise<void> {
    await liveUpdatesGateway.markNotificationsRead(ids);
  },
};
