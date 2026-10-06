import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/services/supabase-database.types';
import type { LegalAcceptanceGateway } from '@/application/legal/legal-acceptance-gateway';

export function createSupabaseLegalAcceptanceGateway(client: SupabaseClient<Database> | null): LegalAcceptanceGateway {
  return {
    async recordAcceptance(version) {
      if (!client) return;
      // The RPC is newer than the generated database types; call it untyped.
      const { error } = await (client as unknown as SupabaseClient).rpc('accept_konjo_legal_terms', { p_version: version });
      if (error) throw new Error(`Legal acceptance could not be recorded: ${error.message}`);
    },
  };
}
