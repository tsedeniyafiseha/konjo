import type { AdminAuthenticationGateway } from '@/application/auth/admin-auth-contracts';
import type { EmailCredentials } from '@/application/auth/client-auth-contracts';
import {
  sessionFromSupabase,
  type SupabaseAuthPort,
} from './supabase-client-auth-gateway.ts';

export class SupabaseAdminAuthGateway implements AdminAuthenticationGateway {
  private readonly port: SupabaseAuthPort;

  constructor(port: SupabaseAuthPort) {
    this.port = port;
  }

  async signInWithEmail(input: EmailCredentials) {
    const identity = await this.port.signInWithPassword(input);
    if (identity.role !== 'admin') {
      await this.port.signOut();
      throw new Error('The account is not an administrator.');
    }
    return sessionFromSupabase(identity);
  }
}
