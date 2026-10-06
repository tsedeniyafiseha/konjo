import type { AuthSession } from './session-controller.ts';

export interface OtpChallenge {
  id: string;
  phoneNumber: string;
  expiresAt: number;
  codeLength: 4 | 6;
  developmentCode?: string;
}

export type AccountRole = 'client' | 'professional';

export interface ClientPhoneRegistration {
  fullName: string;
  password: string;
}

export interface PhoneOtpRequestContext {
  session?: AuthSession;
  registration?: ClientPhoneRegistration;
  resend?: boolean;
  shouldCreateUser?: boolean;
}

export interface VerifyOtpInput {
  shouldCreateUser?: boolean;
  challengeId: string;
  phoneNumber: string;
  code: string;
  role: AccountRole;
  session?: AuthSession;
}

export interface PhoneAuthenticationGateway {
  requestOtp(phoneNumber: string, role: AccountRole, context?: PhoneOtpRequestContext): Promise<OtpChallenge>;
  verifyOtp(input: VerifyOtpInput): Promise<AuthSession>;
}

export type PhoneAuthErrorCode = 'invalid_code' | 'invalid_request' | 'account_role_mismatch' | 'rate_limited' | 'service_unavailable' | 'account_not_found';

export class PhoneAuthError extends Error {
  readonly code: PhoneAuthErrorCode;

  constructor(code: PhoneAuthErrorCode, message: string) {
    super(message);
    this.name = 'PhoneAuthError';
    this.code = code;
  }
}
