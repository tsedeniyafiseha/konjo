import type { ClientAccountGateway } from '@/application/client-account/client-account-controller';
import { clientDataService } from '@/features/client/client-data-service';
import { apiRequest } from '@/services/api-client';

export const apiClientAccountGateway: ClientAccountGateway = {
  async load(token) {
    const data = await clientDataService.getClientData(token);
    return data.account;
  },

  completeOnboarding(token, input) {
    return clientDataService.completeOnboarding(token, input);
  },

  createAddress(token, address) {
    return clientDataService.createAddress(token, address);
  },

  updateAddress(token, addressId, address) {
    return clientDataService.updateAddress(token, addressId, address);
  },

  deleteAddress(token, addressId) {
    return clientDataService.deleteAddress(token, addressId);
  },

  setDefaultAddress(token, addressId) {
    return clientDataService.setDefaultAddress(token, addressId);
  },

  async updateProfile(token, profile) {
    await apiRequest('/v1/me', {
      method: 'PATCH',
      token,
      body: {
        fullName: profile.fullName,
        phoneNumber: profile.phoneNumber,
        preferredLanguage: profile.preferredLanguage,
      },
    });
  },

  async deleteAccount(token) {
    await apiRequest('/v1/me', { method: 'DELETE', token });
  },
};
