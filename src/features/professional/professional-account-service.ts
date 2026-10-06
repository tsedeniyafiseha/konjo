import { apiRequest } from '@/services/api-client';

/** Account-level actions for the signed-in professional. */
export const professionalAccountService = {
  /** Permanently deletes the professional's account (the API keeps completed bookings for accounting). */
  async deleteAccount(token: string): Promise<void> {
    await apiRequest('/v1/me', { method: 'DELETE', token });
  },
};
