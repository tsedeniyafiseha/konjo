import type { EmailCredentials } from '@/application/auth/client-auth-contracts';
import type { AuthSession } from '@/application/auth/session-controller';

export interface AdminAuthenticationGateway {
  signInWithEmail(input: EmailCredentials): Promise<AuthSession>;
}
