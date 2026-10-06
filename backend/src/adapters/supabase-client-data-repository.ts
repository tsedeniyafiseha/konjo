import { supabaseServiceHeaders } from './supabase-service-headers.ts';
import type {
  ApiClientData,
  ApiDeviceRegistration,
  ApiNotificationPreferences,
  ApiNotificationRecord,
  ApiUser,
} from '../../../shared/api-contracts.ts';
import type {
  ClientAddressCommandResult,
  CompleteClientOnboardingResult,
  CompleteClientOnboardingStoreInput,
  CreateClientAddressStoreInput,
  DeleteAccountStoreInput,
  SelectClientAddressStoreInput,
  UpdateClientAddressStoreInput,
  UpdateClientProfileStoreInput,
} from '../application/contracts.ts';
import type {
  ClientAccountCommandStore,
  ClientAddressCommandStore,
  ClientDataReadStore,
  ClientPaymentLedgerAudit,
  ClientPreferenceCommandStore,
} from '../application/ports.ts';

type JsonRecord = Record<string, unknown>;

export class SupabaseClientDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseClientDataError';
  }
}

export class SupabaseClientDataRepository
implements
  ClientAccountCommandStore,
  ClientAddressCommandStore,
  ClientPreferenceCommandStore,
  ClientDataReadStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(baseUrl: string, secretKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
  }

  async getClientData(userId: string): Promise<ApiClientData> {
    return await this.rpc('get_client_data', { p_client_id: userId }) as ApiClientData;
  }

  async updateProfile(input: UpdateClientProfileStoreInput): Promise<ApiUser | null> {
    return await this.rpc('update_client_profile', {
      p_client_id: input.userId,
      p_full_name: input.fullName,
      p_phone_number: input.phoneNumber,
      p_preferred_language: input.preferredLanguage ?? null,
      p_occurred_at: input.occurredAt,
    }) as ApiUser | null;
  }

  async completeOnboarding(
    input: CompleteClientOnboardingStoreInput,
  ): Promise<CompleteClientOnboardingResult> {
    return await this.rpc('complete_client_onboarding', {
      p_client_id: input.userId,
      p_full_name: input.fullName,
      p_phone_number: input.phoneNumber,
      p_preferred_language: input.preferredLanguage,
      p_address: input.address ?? null,
      p_occurred_at: input.occurredAt,
    }) as CompleteClientOnboardingResult;
  }

  async deleteAccount(input: DeleteAccountStoreInput): Promise<boolean> {
    return await this.booleanRpc('delete_konjo_account', {
      p_user_id: input.userId,
      p_role: input.role,
      p_occurred_at: input.occurredAt,
    });
  }

  async createAddress(input: CreateClientAddressStoreInput): Promise<ClientAddressCommandResult> {
    return await this.rpc('create_client_address', {
      p_client_id: input.userId,
      p_address_id: input.addressId,
      p_label: input.label,
      p_zone: input.zone,
      p_detail: input.detail,
      p_make_default: input.makeDefault,
      p_occurred_at: input.occurredAt,
    }) as ClientAddressCommandResult;
  }

  async updateAddress(input: UpdateClientAddressStoreInput): Promise<ClientAddressCommandResult> {
    return await this.rpc('update_client_address', {
      p_client_id: input.userId,
      p_address_id: input.addressId,
      p_label: input.label,
      p_zone: input.zone,
      p_detail: input.detail,
      p_occurred_at: input.occurredAt,
    }) as ClientAddressCommandResult;
  }

  async deleteAddress(input: SelectClientAddressStoreInput): Promise<boolean> {
    return await this.booleanRpc('delete_client_address', {
      p_client_id: input.userId,
      p_address_id: input.addressId,
      p_occurred_at: input.occurredAt,
    });
  }

  async setDefaultAddress(input: SelectClientAddressStoreInput): Promise<boolean> {
    return await this.booleanRpc('set_default_client_address', {
      p_client_id: input.userId,
      p_address_id: input.addressId,
      p_occurred_at: input.occurredAt,
    });
  }

  async setFavorite(input: {
    userId: string;
    professionalId: string;
    favorite: boolean;
    occurredAt: string;
  }): Promise<'updated' | 'professional_not_found'> {
    return await this.rpc('set_client_favorite', {
      p_client_id: input.userId,
      p_professional_id: input.professionalId,
      p_favorite: input.favorite,
      p_occurred_at: input.occurredAt,
    }) as 'updated' | 'professional_not_found';
  }

  async updateNotificationPreferences(input: {
    userId: string;
    preferences: ApiNotificationPreferences;
    occurredAt: string;
  }): Promise<ApiNotificationPreferences> {
    return await this.rpc('update_client_notification_preferences', {
      p_client_id: input.userId,
      p_preferences: input.preferences,
      p_occurred_at: input.occurredAt,
    }) as ApiNotificationPreferences;
  }

  async registerDevice(input: {
    registrationId: string;
    userId: string;
    platform: ApiDeviceRegistration['platform'];
    token: string;
    occurredAt: string;
  }): Promise<ApiDeviceRegistration> {
    return await this.rpc('register_client_device', {
      p_client_id: input.userId,
      p_registration_id: input.registrationId,
      p_platform: input.platform,
      p_token: input.token,
      p_occurred_at: input.occurredAt,
    }) as ApiDeviceRegistration;
  }

  async unregisterDevice(input: {
    userId: string;
    registrationId: string;
    occurredAt: string;
  }): Promise<boolean> {
    return await this.booleanRpc('unregister_client_device', {
      p_client_id: input.userId,
      p_registration_id: input.registrationId,
      p_occurred_at: input.occurredAt,
    });
  }

  async auditPaymentLedger(
    userId: string,
    paymentIntentId: string,
  ): Promise<ClientPaymentLedgerAudit | null> {
    return await this.rpc('audit_client_payment_ledger', {
      p_client_id: userId,
      p_payment_intent_id: paymentIntentId,
    }) as ClientPaymentLedgerAudit | null;
  }

  async listNotifications(userId: string): Promise<ReadonlyArray<ApiNotificationRecord>> {
    const result = await this.rpc('list_client_notifications', { p_client_id: userId });
    if (!Array.isArray(result)) {
      throw new SupabaseClientDataError('Supabase returned an invalid notification history.');
    }
    return result as ApiNotificationRecord[];
  }

  private async booleanRpc(name: string, body: JsonRecord): Promise<boolean> {
    const result = await this.rpc(name, body);
    if (typeof result !== 'boolean') {
      throw new SupabaseClientDataError(`Supabase returned an invalid ${name} result.`);
    }
    return result;
  }

  private async rpc(name: string, body: JsonRecord): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: supabaseServiceHeaders(this.secretKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
    } catch {
      throw new SupabaseClientDataError('Supabase client data is unavailable.');
    }
    if (!response.ok) {
      throw new SupabaseClientDataError('Supabase rejected the client-data operation.');
    }
    return response.json();
  }
}
