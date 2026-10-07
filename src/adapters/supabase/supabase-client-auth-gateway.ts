import type { AuthSession } from '../../application/auth/session-controller';
import type { AccountRole, ClientPhoneRegistration } from '../../application/auth/phone-auth-contracts.ts';
import {
  ClientAuthError,
  type ClientAuthenticationGateway,
  type EmailCredentials,
  type EmailRegistration,
  type PhonePasswordCredentials,
} from '../../application/auth/client-auth-contracts.ts';

export interface SupabaseAuthIdentity {
  userId: string;
  role: 'client' | 'professional' | 'admin';
  email?: string;
  phoneNumber?: string;
  phoneVerified?: boolean;
  displayName?: string;
  accessToken: string;
  expiresAt: number;
  authMethod: AuthSession['authMethod'];
}

export interface SupabaseAuthPort {
  registerWithEmail(
    input: EmailRegistration,
    role: 'client' | 'professional',
  ): Promise<SupabaseAuthIdentity | null>;
  confirmEmail(code: string, tokenHash?: string): Promise<SupabaseAuthIdentity>;
  resendEmailConfirmation(email: string, role: 'client' | 'professional'): Promise<void>;
  signInWithPassword(input: EmailCredentials): Promise<SupabaseAuthIdentity>;
  signInWithPhonePassword(input: PhonePasswordCredentials): Promise<SupabaseAuthIdentity>;
  updatePassword(password: string): Promise<void>;
  restore(): Promise<SupabaseAuthIdentity | null>;
  signInWithGoogle(): Promise<SupabaseAuthIdentity>;
  requestPasswordReset(email: string, role: 'client' | 'professional'): Promise<void>;
  preparePasswordReset(token: string, role?: AccountRole, tokenHash?: string): Promise<void>;
  confirmPasswordReset(token: string, password: string, role?: AccountRole, tokenHash?: string): Promise<void>;
  requestPhoneOtp(
    phoneNumber: string,
    role: AccountRole,
    options?: {
      changeExistingPhone?: boolean;
      registration?: ClientPhoneRegistration;
      resend?: boolean;
      shouldCreateUser?: boolean;
    },
  ): Promise<void>;
  verifyPhoneOtp(
    phoneNumber: string,
    token: string,
    role: AccountRole,
    changeExistingPhone?: boolean,
  ): Promise<SupabaseAuthIdentity>;
  ownsUser(userId: string): Promise<boolean>;
  signOut(): Promise<void>;
  subscribe(listener: (identity: SupabaseAuthIdentity | null) => void): () => void;
}

export function sessionFromSupabase(identity: SupabaseAuthIdentity): AuthSession {
  return {
    userId: identity.userId,
    expiresAt: identity.expiresAt,
    source: 'api',
    role: identity.role,
    authMethod: identity.authMethod,
    ...(identity.email ? { email: identity.email } : {}),
    ...(identity.phoneNumber ? { phoneNumber: identity.phoneNumber } : {}),
    ...(identity.phoneVerified !== undefined ? { phoneVerified: identity.phoneVerified } : {}),
    ...(identity.displayName ? { displayName: identity.displayName } : {}),
    accessToken: identity.accessToken,
  };
}

function authError(error: unknown, fallback: string): ClientAuthError {
  if (error instanceof ClientAuthError) return error;
  return new ClientAuthError('service_unavailable', fallback);
}

export class SupabaseRoleAuthGateway implements ClientAuthenticationGateway {
  readonly googleSignInAvailable = false;
  private readonly port: SupabaseAuthPort;
  private readonly role: 'client' | 'professional';

  constructor(port: SupabaseAuthPort, role: 'client' | 'professional') {
    this.port = port;
    this.role = role;
  }

  async registerWithEmail(input: EmailRegistration): Promise<AuthSession> {
    try {
      const identity = await this.port.registerWithEmail(input, this.role);
      if (!identity) {
        throw new ClientAuthError(
          'confirmation_required',
          'Check your email to confirm your account, then sign in.',
        );
      }
      if (identity.role !== this.role) {
        throw new ClientAuthError('invalid_input', `This account is not a ${this.role} account.`);
      }
      return sessionFromSupabase(identity);
    } catch (error) {
      throw authError(error, 'We could not create your account. Please try again.');
    }
  }

  async confirmEmail(code: string, tokenHash?: string): Promise<AuthSession> {
    try {
      const identity = await this.port.confirmEmail(code, tokenHash);
      if (identity.role !== this.role) {
        await this.port.signOut();
        throw new ClientAuthError('invalid_input', `This account is not a ${this.role} account.`);
      }
      return sessionFromSupabase(identity);
    } catch (error) {
      throw authError(error, 'This confirmation link is invalid or expired.');
    }
  }

  async resendEmailConfirmation(email: string): Promise<void> {
    try {
      await this.port.resendEmailConfirmation(email, this.role);
    } catch (error) {
      throw authError(error, 'We could not resend the confirmation email.');
    }
  }

  async signInWithEmail(input: EmailCredentials): Promise<AuthSession> {
    try {
      const identity = await this.port.signInWithPassword(input);
      if (identity.role !== this.role) {
        await this.port.signOut();
        throw new ClientAuthError('invalid_input', `This account is not a ${this.role} account.`);
      }
      return sessionFromSupabase(identity);
    } catch (error) {
      throw authError(error, 'The email or password is not valid.');
    }
  }

  async signInWithPhone(input: PhonePasswordCredentials): Promise<AuthSession> {
    try {
      const identity = await this.port.signInWithPhonePassword(input);
      if (identity.role !== this.role) {
        await this.port.signOut();
        throw new ClientAuthError('invalid_input', `This account is not a ${this.role} account.`);
      }
      return sessionFromSupabase(identity);
    } catch (error) {
      throw authError(error, 'The phone number or password is not valid.');
    }
  }

  async updatePassword(password: string): Promise<void> {
    try {
      await this.port.updatePassword(password);
    } catch (error) {
      throw authError(error, 'We could not change your password. Please try again.');
    }
  }

  async signInWithGoogle(): Promise<AuthSession> {
    try {
      const identity = await this.port.signInWithGoogle();
      if (identity.role !== this.role) {
        await this.port.signOut();
        throw new ClientAuthError('invalid_input', `This account is not a ${this.role} account.`);
      }
      return sessionFromSupabase(identity);
    } catch (error) {
      throw authError(error, 'Google sign-in is temporarily unavailable.');
    }
  }

  async requestPasswordReset(email: string): Promise<{ accepted: true }> {
    try {
      await this.port.requestPasswordReset(email, this.role);
      return { accepted: true };
    } catch (error) {
      throw authError(error, 'Password recovery is temporarily unavailable.');
    }
  }

  async preparePasswordReset(token: string, tokenHash?: string): Promise<void> {
    try {
      await this.port.preparePasswordReset(token, this.role, tokenHash);
    } catch (error) {
      throw authError(error, 'The password reset link is invalid or expired.');
    }
  }

  async confirmPasswordReset(token: string, password: string, tokenHash?: string): Promise<void> {
    try {
      await this.port.confirmPasswordReset(token, password, this.role, tokenHash);
    } catch (error) {
      throw authError(error, 'The password reset link is invalid or expired.');
    }
  }
}

export class SupabaseClientAuthGateway extends SupabaseRoleAuthGateway {
  constructor(port: SupabaseAuthPort) {
    super(port, 'client');
  }
}

export class SupabaseProfessionalAuthGateway extends SupabaseRoleAuthGateway {
  constructor(port: SupabaseAuthPort) {
    super(port, 'professional');
  }
}
