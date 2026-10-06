import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClientAccountGateway } from '@/application/client-account/client-account-controller';
import type { ApiClientAccount } from '../../../shared/api-contracts';
import type { Database, Json } from '@/services/supabase-database.types';

/** Ownership-bound registration; other account operations retain the API gateway. */
export function supabaseClientRegistrationGateway(
  client: SupabaseClient<Database>,
  accountGateway: ClientAccountGateway,
): ClientAccountGateway {
  return {
    ...accountGateway,
    async load() {
      const { data, error } = await client.rpc('get_my_client_account');
      if (error) throw new Error(error.message);
      return data as unknown as ApiClientAccount | null;
    },
    async completeOnboarding(_token, input) {
      const { data, error } = await client.rpc('complete_my_client_onboarding', {
        p_full_name: input.fullName,
        p_preferred_language: input.preferredLanguage,
        p_address: (input.address ?? null) as Json,
      });
      if (error) throw new Error(error.message);
      const result = data as { result?: string; account?: unknown } | null;
      if (result?.result === 'identity_documents_required') {
        throw new Error('Upload your passport or both sides of your ID before continuing.');
      }
      if (result?.result === 'service_zone_unavailable') throw new Error('Choose an active Konjo service zone.');
      if (result?.result !== 'completed' || !result.account) throw new Error('Your registration could not be saved. Please try again.');
      return result.account as ApiClientAccount;
    },
  };
}
