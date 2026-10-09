import assert from 'node:assert/strict';

import type { AuthSession, SessionStorage } from '../../src/application/auth/session-controller.ts';
import { ClientAuthError } from '../../src/application/auth/client-auth-contracts.ts';
import { PhoneAuthError } from '../../src/application/auth/phone-auth-contracts.ts';
import { VerifiedSessionRetry } from '../../src/application/auth/verified-session-retry.ts';
import { toE164PhoneNumber, isValidEthiopianMobileNumber } from '../../src/features/auth/phone-number.ts';
import {
  SupabaseClientAuthGateway,
  SupabaseProfessionalAuthGateway,
  type SupabaseAuthIdentity,
  type SupabaseAuthPort,
} from '../../src/adapters/supabase/supabase-client-auth-gateway.ts';
import { SupabaseAdminAuthGateway } from '../../src/adapters/supabase/supabase-admin-auth-gateway.ts';
import {
  SupabaseAwareSessionRevocationGateway,
  SupabaseAwareSessionStorage,
  SupabaseExternalSessionSource,
} from '../../src/adapters/supabase/supabase-session-adapters.ts';
import { SupabasePhoneAuthGateway } from '../../src/adapters/supabase/supabase-phone-auth-gateway.ts';
import { normalizeNativeAuthPath } from '../../src/features/auth/auth-callback-url.ts';

const identity: SupabaseAuthIdentity = {
  userId: 'client-1',
  role: 'client',
  email: 'client@example.com',
  displayName: 'Client One',
  accessToken: 'supabase-token',
  expiresAt: 2_000_000_000_000,
  authMethod: 'email_password',
};

{
  assert.equal(
    normalizeNativeAuthPath('konjoclient://client-email?mode=reset&code=one-time-code'),
    '/client-email?mode=reset&code=one-time-code',
  );
  assert.equal(
    normalizeNativeAuthPath('https://konjoet.com/client-email?mode=reset&code=one-time-code'),
    '/client-email?mode=reset&code=one-time-code',
  );
  assert.equal(
    normalizeNativeAuthPath('https://attacker.example/client-email?mode=reset&code=stolen'),
    'https://attacker.example/client-email?mode=reset&code=stolen',
  );
  assert.equal(
    normalizeNativeAuthPath('konjoclient:///client-email?mode=confirm&token_hash=email-hash&type=email'),
    '/client-email?mode=confirm&token_hash=email-hash&type=email',
  );
  assert.equal(
    normalizeNativeAuthPath('konjoclient://client-email?mode=reset#error=access_denied&error_code=otp_expired&error_description=Link+expired'),
    '/client-email?mode=reset&error=access_denied&error_code=otp_expired&error_description=Link+expired',
  );
  assert.equal(
    normalizeNativeAuthPath('konjoclient://client-email?mode=reset#access_token=secret&refresh_token=more-secret'),
    '/client-email?mode=reset',
    'Session credentials must never be copied into Expo Router state.',
  );
  assert.equal(normalizeNativeAuthPath('/client-email?mode=login'), '/client-email?mode=login');
}

{
  for (const value of ['912345678', '0912345678', '+251 912 345 678', '00251912345678']) {
    assert.equal(isValidEthiopianMobileNumber(value), true);
    assert.equal(toE164PhoneNumber(value), '+251912345678');
  }
}

{
  const retry = new VerifiedSessionRetry<{ userId: string }>();
  let exchanges = 0;
  let fail = true;
  const exchange = async () => { exchanges++; return { userId: 'professional-1' }; };
  const next = async (session: { userId: string }) => {
    if (fail) throw new Error('Profile temporarily unavailable');
    return session.userId;
  };
  await assert.rejects(retry.resolve('one-time-code', exchange, async () => true, next), /Profile temporarily unavailable/);
  fail = false;
  assert.equal(await retry.resolve('one-time-code', exchange, async () => true, next), 'professional-1');
  assert.equal(exchanges, 1, 'A consumed code must not be verified again after a profile or password-save failure.');
  await retry.resolve('one-time-code', exchange, async () => false, next);
  assert.equal(exchanges, 2, 'Cached proof cannot be reused after the session changes.');
  retry.clear();
  await retry.resolve('one-time-code', exchange, async () => true, next);
  assert.equal(exchanges, 3, 'Signing out or requesting a new code clears the proof.');
}

function port(overrides: Partial<SupabaseAuthPort> = {}): SupabaseAuthPort {
  return {
    async registerWithEmail() { return identity; },
    async confirmEmail() { return identity; },
    async resendEmailConfirmation() {},
    async signInWithPassword() { return identity; },
    async signInWithPhonePassword() { return { ...identity, phoneNumber: '+251912345678' }; },
    async updatePassword() {},
    async restore() { return identity; },
    async signInWithGoogle() { return { ...identity, authMethod: 'google' }; },
    async requestPasswordReset() {},
    async preparePasswordReset() {},
    async confirmPasswordReset() {},
    async requestPhoneOtp() {},
    async verifyPhoneOtp() { return { ...identity, phoneNumber: '+251912345678' }; },
    async ownsUser(userId) { return userId === identity.userId; },
    async signOut() {},
    subscribe() { return () => undefined; },
    ...overrides,
  };
}

{
  const calls: unknown[] = [];
  const auth = new SupabaseClientAuthGateway(port({
    async signInWithPassword(input) { calls.push(input); return identity; },
    async preparePasswordReset(code, role, tokenHash) { calls.push({ prepare: true, code, role, tokenHash }); },
    async confirmPasswordReset(code, password, role, tokenHash) { calls.push({ code, password, role, tokenHash }); },
    async confirmEmail(code, tokenHash) { calls.push({ code, tokenHash }); return identity; },
  }));
  const session = await auth.signInWithEmail({ email: 'international@example.com', password: 'valid-client-password' });
  assert.equal(session.phoneNumber, undefined, 'Email-only clients do not need an Ethiopian phone.');
  await auth.confirmEmail('', 'email-token-hash');
  await auth.preparePasswordReset('email-link-code', 'reset-token-hash');
  await auth.confirmPasswordReset('email-link-code', 'new-client-password', 'reset-token-hash');
  assert.deepEqual(calls, [
    { email: 'international@example.com', password: 'valid-client-password' },
    { code: '', tokenHash: 'email-token-hash' },
    { prepare: true, code: 'email-link-code', role: 'client', tokenHash: 'reset-token-hash' },
    { code: 'email-link-code', password: 'new-client-password', role: 'client', tokenHash: 'reset-token-hash' },
  ]);
}

{
  for (const [failure, expected] of [
    [new ClientAuthError('invalid_input', 'Code expired', 'otp_expired'), 'invalid_code'],
    [new ClientAuthError('invalid_input', 'Account is disabled', 'user_banned'), 'invalid_request'],
    [new ClientAuthError('service_unavailable', 'Profile could not be loaded'), 'service_unavailable'],
  ] as const) {
    const auth = new SupabasePhoneAuthGateway(port({ async verifyPhoneOtp() { throw failure; } }));
    await assert.rejects(auth.verifyOtp({ challengeId: 'challenge', phoneNumber: '+251912345678', code: '123456', role: 'professional' }),
      (error: unknown) => error instanceof PhoneAuthError && error.code === expected && error.message === failure.message);
  }
  const auth = new SupabasePhoneAuthGateway(port());
  await assert.rejects(auth.verifyOtp({ challengeId: 'challenge', phoneNumber: '+251912345678', code: '123456', role: 'professional' }),
    (error: unknown) => error instanceof PhoneAuthError && error.code === 'account_role_mismatch', 'A client account is not an incorrect professional SMS code.');
}

{
  const requests: unknown[] = [];
  const gateway = new SupabasePhoneAuthGateway(port({
    async requestPhoneOtp(phoneNumber, role, options) {
      requests.push({ phoneNumber, role, options });
    },
    async verifyPhoneOtp(phoneNumber, _token, role) {
      return {
        ...identity,
        role,
        phoneNumber,
        userId: `${role}-phone-user`,
        authMethod: 'phone_otp',
      };
    },
  }));
  const challenge = await gateway.requestOtp('+251912345678', 'professional');
  assert.equal(challenge.codeLength, 6);
  assert.deepEqual(requests, [{
    phoneNumber: '+251912345678',
    role: 'professional',
    options: { changeExistingPhone: false, shouldCreateUser: true },
  }]);
  const verified = await gateway.verifyOtp({
    challengeId: challenge.id,
    phoneNumber: challenge.phoneNumber,
    code: '123456',
    role: 'professional',
  });
  assert.equal(verified.role, 'professional');
  assert.equal(verified.phoneNumber, '+251912345678');
  await gateway.requestOtp('+251912345678', 'professional', { shouldCreateUser: false });
  assert.deepEqual(requests.at(-1), {
    phoneNumber: '+251912345678', role: 'professional',
    options: { changeExistingPhone: false, shouldCreateUser: false },
  }, 'Returning professionals must request sign-in without creating an account.');
}

{
  const realOtpRequests: unknown[] = [];
  const mockRequests: string[] = [];
  const mockVerifications: unknown[] = [];
  const professionalIdentity: SupabaseAuthIdentity = {
    ...identity,
    userId: 'mock-professional',
    role: 'professional',
    phoneNumber: '+251912345678',
    phoneVerified: true,
    authMethod: 'phone_otp',
  };
  const gateway = new SupabasePhoneAuthGateway(
    port({ async requestPhoneOtp(...input) { realOtpRequests.push(input); } }),
    {
      async requestOtp(phoneNumber) {
        mockRequests.push(phoneNumber);
        return {
          id: 'professional-mock-challenge',
          phoneNumber,
          expiresAt: Date.now() + 60_000,
          codeLength: 6,
          developmentCode: '247124',
        };
      },
      async verifyOtp(input) {
        mockVerifications.push(input);
        return professionalIdentity;
      },
    },
  );
  const challenge = await gateway.requestOtp('+251912345678', 'professional', { shouldCreateUser: true });
  assert.equal(challenge.developmentCode, '247124');
  assert.deepEqual(mockRequests, ['+251912345678']);
  assert.equal(realOtpRequests.length, 0, 'Mock professional registration must not send an SMS.');
  const session = await gateway.verifyOtp({
    challengeId: challenge.id,
    phoneNumber: challenge.phoneNumber,
    code: challenge.developmentCode!,
    role: 'professional',
  });
  assert.equal(session.userId, 'mock-professional');
  assert.equal(mockVerifications.length, 1);
}

{
  const requests: unknown[] = [];
  const passwords: string[] = [];
  const credentials = { phoneNumber: '+251912345678', password: 'professional-test-password' };
  const professionalPort = port({
    async signInWithPhonePassword(input) {
      assert.deepEqual(input, credentials);
      return { ...identity, userId: 'existing-professional', role: 'professional', phoneNumber: input.phoneNumber, phoneVerified: true };
    },
    async requestPhoneOtp(phoneNumber, role, options) { requests.push({ phoneNumber, role, options }); },
    async updatePassword(password) { passwords.push(password); },
  });
  const auth = new SupabaseProfessionalAuthGateway(professionalPort);
  const loggedIn = await auth.signInWithPhone(credentials);
  assert.equal(loggedIn.userId, 'existing-professional');
  assert.equal(loggedIn.role, 'professional');
  assert.equal(loggedIn.phoneVerified, true);
  assert.equal(requests.length, 0, 'Password login must not send an SMS or create an account.');

  const phoneAuth = new SupabasePhoneAuthGateway(professionalPort);
  await phoneAuth.requestOtp(credentials.phoneNumber, 'professional', {
    registration: { fullName: '', password: credentials.password }, shouldCreateUser: true,
  });
  assert.deepEqual(requests[0], {
    phoneNumber: credentials.phoneNumber, role: 'professional',
    options: { changeExistingPhone: false, registration: { fullName: '', password: credentials.password }, shouldCreateUser: true },
  });
  await phoneAuth.requestOtp(credentials.phoneNumber, 'professional', { resend: true, shouldCreateUser: false });
  assert.deepEqual(requests[1], {
    phoneNumber: credentials.phoneNumber, role: 'professional',
    options: { changeExistingPhone: false, resend: true, shouldCreateUser: false },
  }, 'Resending must use the existing account, without signing up or replacing its password.');
  await auth.updatePassword('new-professional-password');
  assert.deepEqual(passwords, ['new-professional-password']);
}

{
  let signedOut = 0;
  const auth = new SupabaseProfessionalAuthGateway(port({
    async signOut() { signedOut += 1; },
  }));
  await assert.rejects(auth.signInWithPhone({ phoneNumber: '+251912345678', password: 'client-password' }), /not a professional account/);
  assert.equal(signedOut, 1, 'Client credentials cannot become a professional session.');
}

{
  const requests: unknown[] = [];
  const verifications: unknown[] = [];
  const gateway = new SupabasePhoneAuthGateway(port({
    async requestPhoneOtp(phoneNumber, role, options) {
      requests.push({ phoneNumber, role, options });
    },
    async verifyPhoneOtp(phoneNumber, _token, role, changeExistingPhone) {
      verifications.push({ phoneNumber, role, changeExistingPhone });
      return {
        ...identity,
        phoneNumber,
        authMethod: 'phone_otp',
      };
    },
  }));
  const challenge = await gateway.requestOtp('+251912345678', 'client', {
    registration: { fullName: 'Client One', password: 'long-password' },
  });
  assert.deepEqual(requests, [{
    phoneNumber: '+251912345678',
    role: 'client',
    options: {
      changeExistingPhone: false,
      registration: { fullName: 'Client One', password: 'long-password' },
      shouldCreateUser: true,
    },
  }]);
  await gateway.verifyOtp({
    challengeId: challenge.id,
    phoneNumber: challenge.phoneNumber,
    code: '123456',
    role: 'client',
  });
  assert.deepEqual(verifications, [{
    phoneNumber: '+251912345678',
    role: 'client',
    changeExistingPhone: false,
  }]);
}

{
  const requests: unknown[] = [];
  const gateway = new SupabasePhoneAuthGateway(port({
    async requestPhoneOtp(phoneNumber, role, options) {
      requests.push({ phoneNumber, role, options });
    },
  }));
  await gateway.requestOtp('+251912345678', 'client', { shouldCreateUser: false });
  assert.deepEqual(requests, [{
    phoneNumber: '+251912345678',
    role: 'client',
    options: { changeExistingPhone: false, shouldCreateUser: false },
  }]);
}

{
  const gateway = new SupabasePhoneAuthGateway(port({
    async verifyPhoneOtp() {
      throw new ClientAuthError('invalid_input', 'Token has expired or is invalid');
    },
  }));
  await assert.rejects(
    gateway.verifyOtp({
      challengeId: 'challenge-1',
      phoneNumber: '+251912345678',
      code: '000000',
      role: 'client',
    }),
    (error: unknown) => error instanceof Error && error.name === 'PhoneAuthError',
  );
}

{
  const gateway = new SupabaseClientAuthGateway(port());
  const registered = await gateway.registerWithEmail({
    fullName: 'Client One',
    email: 'client@example.com',
    password: 'long-password',
  });
  assert.equal(registered.userId, 'client-1');
  assert.equal(registered.accessToken, 'supabase-token');
  assert.equal(registered.source, 'api');
  assert.equal((await gateway.confirmEmail('authorization-code')).userId, 'client-1');
  assert.equal((await gateway.signInWithPhone({
    phoneNumber: '+251912345678',
    password: 'long-password',
  })).phoneNumber, '+251912345678');
  await gateway.resendEmailConfirmation('client@example.com');
  assert.equal((await gateway.requestPasswordReset('client@example.com')).accepted, true);
}

{
  const gateway = new SupabaseClientAuthGateway(port({
    async registerWithEmail() { return null; },
  }));
  await assert.rejects(
    gateway.registerWithEmail({
      fullName: 'Client One',
      email: 'client@example.com',
      password: 'long-password',
    }),
    (error: unknown) => error instanceof ClientAuthError && error.code === 'confirmation_required',
  );
}

{
  const professionalIdentity: SupabaseAuthIdentity = {
    ...identity,
    userId: 'professional-1',
    role: 'professional',
    email: 'professional@example.com',
  };
  const requestedRoles: string[] = [];
  const gateway = new SupabaseProfessionalAuthGateway(port({
    async registerWithEmail(_input, role) {
      requestedRoles.push(role);
      return professionalIdentity;
    },
    async signInWithPassword() { return professionalIdentity; },
    async confirmEmail() { return professionalIdentity; },
    async resendEmailConfirmation(_email, role) { requestedRoles.push(role); },
    async requestPasswordReset(_email, role) { requestedRoles.push(role); },
  }));
  assert.equal((await gateway.registerWithEmail({
    fullName: 'Professional One',
    email: 'professional@example.com',
    password: 'long-password',
  })).role, 'professional');
  assert.equal((await gateway.signInWithEmail({
    email: 'professional@example.com',
    password: 'long-password',
  })).role, 'professional');
  assert.equal((await gateway.confirmEmail('authorization-code')).role, 'professional');
  await gateway.resendEmailConfirmation('professional@example.com');
  await gateway.requestPasswordReset('professional@example.com');
  assert.deepEqual(requestedRoles, ['professional', 'professional', 'professional']);
}

{
  let signedOut = 0;
  const gateway = new SupabaseClientAuthGateway(port({
    async signInWithPassword() { return { ...identity, role: 'professional' }; },
    async signOut() { signedOut += 1; },
  }));
  await assert.rejects(
    gateway.signInWithEmail({ email: 'pro@example.com', password: 'long-password' }),
    /not a client account/,
  );
  assert.equal(signedOut, 1);
}

{
  const gateway = new SupabaseAdminAuthGateway(port({
    async signInWithPassword() { return { ...identity, userId: 'admin-1', role: 'admin' }; },
  }));
  const session = await gateway.signInWithEmail({
    email: 'admin@konjo.test',
    password: 'long-password',
  });
  assert.equal(session.role, 'admin');
  assert.equal(session.accessToken, 'supabase-token');
}

{
  let signedOut = 0;
  const gateway = new SupabaseAdminAuthGateway(port({
    async signOut() { signedOut += 1; },
  }));
  await assert.rejects(
    gateway.signInWithEmail({ email: 'client@example.com', password: 'long-password' }),
    /not an administrator/,
  );
  assert.equal(signedOut, 1);
}

{
  const fallbackSession: AuthSession = {
    userId: 'legacy-client',
    role: 'client',
    source: 'api',
    authMethod: 'email_password',
    accessToken: 'legacy-token',
    expiresAt: 2_000_000_000_000,
  };
  let fallbackReads = 0;
  let fallbackClears = 0;
  const fallback: SessionStorage = {
    async read() { fallbackReads += 1; return fallbackSession; },
    async write() {},
    async clear() { fallbackClears += 1; },
  };
  const supabaseStorage = new SupabaseAwareSessionStorage(port(), fallback);
  assert.equal((await supabaseStorage.read())?.userId, 'client-1');
  assert.equal(fallbackReads, 0);
  assert.equal(fallbackClears, 1);
  const fallbackStorage = new SupabaseAwareSessionStorage(port({
    async restore() { return null; },
  }), fallback);
  assert.equal(await fallbackStorage.read(), null);
  assert.equal(fallbackReads, 0);
  assert.equal(fallbackClears, 2);
  await fallbackStorage.write(fallbackSession);
  assert.equal(fallbackClears, 3);
}

{
  let supabaseSignOuts = 0;
  let fallbackRevocations = 0;
  const revocation = new SupabaseAwareSessionRevocationGateway(port({
    async signOut() { supabaseSignOuts += 1; },
  }), {
    async revoke() { fallbackRevocations += 1; },
  });
  await revocation.revoke({
    userId: 'client-1', role: 'client', source: 'api', authMethod: 'email_password',
    expiresAt: identity.expiresAt, accessToken: 'old-refreshed-token',
  });
  assert.equal(supabaseSignOuts, 1);
  assert.equal(fallbackRevocations, 0);
}

{
  const holder: {
    authListener?: (identity: SupabaseAuthIdentity | null) => void;
    synchronized?: AuthSession | null;
  } = {};
  const source = new SupabaseExternalSessionSource(port({
    subscribe(listener) {
      holder.authListener = listener;
      return () => { delete holder.authListener; };
    },
  }));
  const unsubscribe = source.subscribe((session) => { holder.synchronized = session; });
  holder.authListener?.({ ...identity, accessToken: 'refreshed-token' });
  assert.equal(holder.synchronized?.accessToken, 'refreshed-token');
  holder.authListener?.(null);
  assert.equal(holder.synchronized, null);
  unsubscribe();
  assert.equal(holder.authListener, undefined);
}

console.log('Client Supabase authentication adapter contracts passed.');
