import type { ApiPasswordResetRequest } from '../../../shared/api-contracts';
import type { AuthSession } from './session-controller';

export interface EmailCredentials {
  email: string;
  password: string;
}

export interface EmailRegistration extends EmailCredentials {
  fullName: string;
}

export interface PhonePasswordCredentials {
  phoneNumber: string;
  password: string;
}

export type ClientAuthErrorCode =
  | 'invalid_input'
  | 'confirmation_required'
  | 'service_unavailable';

export class ClientAuthError extends Error {
  readonly code: ClientAuthErrorCode;
  readonly providerCode?: string;

  constructor(code: ClientAuthErrorCode, message: string, providerCode?: string) {
    super(message);
    this.name = 'ClientAuthError';
    this.code = code;
    this.providerCode = providerCode;
  }
}

export interface ClientAuthenticationGateway {
  readonly googleSignInAvailable: boolean;
  registerWithEmail(input: EmailRegistration): Promise<AuthSession>;
  confirmEmail(code: string, tokenHash?: string): Promise<AuthSession>;
  resendEmailConfirmation(email: string): Promise<void>;
  signInWithEmail(input: EmailCredentials): Promise<AuthSession>;
  signInWithPhone(input: PhonePasswordCredentials): Promise<AuthSession>;
  updatePassword(password: string): Promise<void>;
  signInWithGoogle(): Promise<AuthSession>;
  requestPasswordReset(email: string): Promise<ApiPasswordResetRequest>;
  confirmPasswordReset(token: string, password: string, tokenHash?: string): Promise<void>;
}
