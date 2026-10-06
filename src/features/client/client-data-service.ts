import type {
  ApiClientAccount,
  ApiClientAddress,
  ApiClientData,
  ApiClientPreferredLanguage,
  ApiNotificationPreferences,
} from '../../../shared/api-contracts';
import { apiRequest } from '@/services/api-client';

interface AddressInput {
  label: string;
  zone: string;
  detail: string;
}

export const clientDataService = {
  getClientData(token: string) {
    return apiRequest<ApiClientData>('/v1/client-data', { token });
  },

  async completeOnboarding(token: string, input: {
    fullName: string;
    phoneNumber: string | null;
    preferredLanguage: ApiClientPreferredLanguage;
    address?: AddressInput;
  }): Promise<ApiClientAccount> {
    const response = await apiRequest<{ account: ApiClientAccount }>('/v1/client/account', {
      method: 'PUT',
      token,
      body: input,
    });
    return response.account;
  },

  async createAddress(token: string, address: AddressInput): Promise<ApiClientAddress> {
    const response = await apiRequest<{ address: ApiClientAddress }>('/v1/client/addresses', {
      method: 'POST',
      token,
      body: { ...address },
    });
    return response.address;
  },

  async updateAddress(token: string, addressId: string, address: AddressInput): Promise<ApiClientAddress> {
    const response = await apiRequest<{ address: ApiClientAddress }>(
      `/v1/client/addresses/${encodeURIComponent(addressId)}`,
      { method: 'PATCH', token, body: { ...address } },
    );
    return response.address;
  },

  deleteAddress(token: string, addressId: string): Promise<void> {
    return apiRequest(`/v1/client/addresses/${encodeURIComponent(addressId)}`, {
      method: 'DELETE',
      token,
    });
  },

  setDefaultAddress(token: string, addressId: string): Promise<void> {
    return apiRequest(`/v1/client/addresses/${encodeURIComponent(addressId)}/default`, {
      method: 'POST',
      token,
    });
  },

  setFavorite(token: string, professionalId: string, favorite: boolean): Promise<void> {
    return apiRequest(`/v1/client/favorites/${encodeURIComponent(professionalId)}`, {
      method: favorite ? 'PUT' : 'DELETE',
      token,
    });
  },

  async updateNotificationPreferences(
    token: string,
    preferences: ApiNotificationPreferences,
  ): Promise<ApiNotificationPreferences> {
    const response = await apiRequest<{ notificationPreferences: ApiNotificationPreferences }>(
      '/v1/client/notification-preferences',
      { method: 'PATCH', token, body: { ...preferences } },
    );
    return response.notificationPreferences;
  },
};
