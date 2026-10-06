import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { VerifiedSessionRetry } from '@/application/auth/verified-session-retry';

import { ClientAuthError, type EmailCredentials, type EmailRegistration, type PhonePasswordCredentials } from '@/application/auth/client-auth-contracts';
import type {
  SupabaseAuthIdentity,
  SupabaseAuthPort,
} from '@/adapters/supabase/supabase-client-auth-gateway';
import type { Database, Tables } from '@/services/supabase-database.types';
import { supabase } from '@/services/supabase';

let passwordRecoveryInProgress = false;
// Suppresses the auto-login Supabase performs on phone sign-up (when "Confirm
// phone" is off) until the user has entered the SMS code.
let phoneRegistrationInProgress = false;
const phoneProof = new VerifiedSessionRetry<Session>();
const emailProof = new VerifiedSessionRetry<Session>();

type ProfileRow = Pick<
  Tables<'profiles'>,
  'user_id' | 'account_role' | 'full_name' | 'email' | 'phone_number'
> & { phone_verified_at?: string | null };

function operationError(message: string, invalid = false, providerCode?: string): ClientAuthError {
  return new ClientAuthError(invalid ? 'invalid_input' : 'service_unavailable', message, providerCode);
}

async function isActiveSession(session: Session): Promise<boolean> {
  const current = (await requireClient().auth.getSession()).data.session;
  return current?.user.id === session.user.id && current.access_token === session.access_token;
}

async function exchangeEmailLink(code: string, tokenHash: string | undefined, type: 'email' | 'recovery'): Promise<Session> {
  const client = requireClient();
  if (!code.trim() && !tokenHash) throw operationError('Open the latest link in your email to continue.', true);
  const { data, error } = tokenHash
    ? await client.auth.verifyOtp({ token_hash: tokenHash, type })
    : await client.auth.exchangeCodeForSession(code.trim());
  if (error || !data.session) throw operationError(error?.message ?? 'This email link is invalid or expired. Request a new link.', true, error?.code);
  return data.session;
}

function platformRedirect(configured: string | undefined, role: 'client' | 'professional', mode: 'confirm' | 'reset'): string {
  // A native app deep link cannot handle a reset started in the web app.
  if (configured && (Platform.OS !== 'web' || /^https?:\/\//i.test(configured))) return configured;
  return Linking.createURL(roleAuthRoute(role), { queryParams: { mode } });
}

function requireClient(): SupabaseClient<Database> {
  if (!supabase) throw operationError('Supabase authentication is not configured.');
  return supabase;
}

function roleAuthRoute(role: 'client' | 'professional'): 'client-email' | 'professional-email' {
  return role === 'professional' ? 'professional-email' : 'client-email';
}

function emailConfirmationRedirectUrl(role: 'client' | 'professional'): string {
  const configured = role === 'professional'
    ? process.env.EXPO_PUBLIC_PROFESSIONAL_EMAIL_CONFIRM_REDIRECT_URL?.trim()
    : process.env.EXPO_PUBLIC_EMAIL_CONFIRM_REDIRECT_URL?.trim();
  return platformRedirect(configured, role, 'confirm');
}

function passwordResetRedirectUrl(role: 'client' | 'professional'): string {
  const configured = role === 'professional'
    ? process.env.EXPO_PUBLIC_PROFESSIONAL_PASSWORD_RESET_REDIRECT_URL?.trim()
    : process.env.EXPO_PUBLIC_PASSWORD_RESET_REDIRECT_URL?.trim();
  return platformRedirect(configured, role, 'reset');
}

async function identityFromSession(
  client: SupabaseClient<Database>,
  session: Session,
  user: User = session.user,
): Promise<SupabaseAuthIdentity> {
  const { data, error } = await client
    .from('profiles')
    .select('user_id,account_role,full_name,email,phone_number,phone_verified_at')
    .eq('user_id', user.id)
    .single();
  if (error || !data) {
    throw operationError('Your Konjo profile could not be loaded.');
  }
  const profile = data as ProfileRow;
  const provider = typeof user.app_metadata?.provider === 'string'
    ? user.app_metadata.provider
    : 'email';
  return {
    userId: profile.user_id,
    role: profile.account_role,
    ...(profile.email ?? user.email ? { email: profile.email ?? user.email } : {}),
    ...(profile.phone_number ?? user.phone ? {
      phoneNumber: profile.phone_number ?? user.phone,
    } : {}),
    phoneVerified: profile.account_role === 'professional'
      ? Boolean(profile.phone_verified_at)
      : profile.account_role !== 'client' || Boolean(profile.phone_verified_at),
    ...(profile.full_name ? { displayName: profile.full_name } : {}),
    accessToken: session.access_token,
    expiresAt: (session.expires_at ?? Math.floor(Date.now() / 1_000) + 3_600) * 1_000,
    authMethod: provider === 'phone'
      ? 'phone_otp'
      : provider === 'google' ? 'google' : 'email_password',
  };
}

export const supabaseAuthPort: SupabaseAuthPort = {
  async registerWithEmail(input: EmailRegistration, role) {
    const client = requireClient();
    const { data, error } = await client.auth.signUp({
      email: input.email.trim().toLowerCase(),
      password: input.password,
      options: {
        emailRedirectTo: emailConfirmationRedirectUrl(role),
        data: { full_name: input.fullName.trim(), role },
      },
    });
    if (error) throw operationError(error.message, error.status !== undefined && error.status < 500);
    return data.session ? identityFromSession(client, data.session, data.user ?? data.session.user) : null;
  },

  async confirmEmail(code: string, tokenHash?: string) {
    const client = requireClient();
    return emailProof.resolve(`confirm:${tokenHash ?? code}`, () => exchangeEmailLink(code, tokenHash, 'email'), isActiveSession,
      (session) => identityFromSession(client, session));
  },

  async resendEmailConfirmation(email: string, role) {
    const client = requireClient();
    const { error } = await client.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: emailConfirmationRedirectUrl(role) },
    });
    if (error) throw operationError(error.message, error.status !== undefined && error.status < 500);
  },

  async signInWithPassword(input: EmailCredentials) {
    const client = requireClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: input.email.trim().toLowerCase(),
      password: input.password,
    });
    if (error) throw operationError(error.message, error.status !== undefined && error.status < 500);
    return identityFromSession(client, data.session, data.user);
  },

  async signInWithPhonePassword(input: PhonePasswordCredentials) {
    const client = requireClient();
    const { data, error } = await client.auth.signInWithPassword({
      phone: input.phoneNumber,
      password: input.password,
    });
    if (error) throw operationError(error.message, error.status !== undefined && error.status < 500);
    return identityFromSession(client, data.session, data.user);
  },

  async updatePassword(password: string) {
    const client = requireClient();
    const { error } = await client.auth.updateUser({ password });
    if (error) throw operationError(error.message, error.status !== undefined && error.status < 500);
  },

  async restore() {
    const client = requireClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw operationError(error.message);
    return data.session ? identityFromSession(client, data.session) : null;
  },

  async signInWithGoogle() {
    throw operationError('Google sign-in needs its provider credentials before it can be connected.');
  },

  async requestPasswordReset(email: string, role) {
    const client = requireClient();
    const { error } = await client.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: passwordResetRedirectUrl(role) },
    );
    if (error) throw operationError(error.message, error.status !== undefined && error.status < 500);
  },

  async confirmPasswordReset(code: string, password: string, role = 'client', tokenHash?: string) {
    const client = requireClient();
    passwordRecoveryInProgress = true;
    try {
      await emailProof.resolve(`reset:${tokenHash ?? code}`, () => exchangeEmailLink(code, tokenHash, 'recovery'), isActiveSession, async (session) => {
        const identity = await identityFromSession(client, session);
        if (identity.role !== role) {
          await client.auth.signOut();
          emailProof.clear();
          throw operationError(`This is not a ${role} account. Use the correct account recovery page.`, true);
        }
        const { error } = await client.auth.updateUser({ password });
        if (error) throw operationError(error.message, error.status !== undefined && error.status < 500, error.code);
      });
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) throw operationError(signOutError.message);
      emailProof.clear();
    } finally {
      passwordRecoveryInProgress = false;
    }
  },

  async requestPhoneOtp(phoneNumber, role, options) {
    const client = requireClient();
    phoneProof.clear();
    if (options?.registration && !options.resend) {
      phoneRegistrationInProgress = true;
      try {
        const { data, error } = await client.auth.signUp({
          phone: phoneNumber,
          password: options.registration.password,
          options: {
            data: { role, full_name: options.registration.fullName.trim() },
          },
        });
        if (error) throw operationError(error.message, error.status !== undefined && error.status < 500);
        if (data.session) {
          // Supabase signed the new account in without a code. Sign out and
          // require the SMS code before the client can use the account.
          await client.auth.signOut();
          const { error: otpError } = await client.auth.signInWithOtp({
            phone: phoneNumber,
            options: { shouldCreateUser: false },
          });
          if (otpError) throw operationError(otpError.message, otpError.status !== undefined && otpError.status < 500);
        }
      } finally {
        phoneRegistrationInProgress = false;
      }
      return;
    }
    const { error } = options?.registration && options.resend
      ? await client.auth.signInWithOtp({
        phone: phoneNumber,
        options: { shouldCreateUser: false },
      })
      : options?.registration
      ? await client.auth.signUp({
        phone: phoneNumber,
        password: options.registration.password,
        options: {
          data: {
            role,
            full_name: options.registration.fullName.trim(),
          },
        },
      })
      : options?.changeExistingPhone
        ? await client.auth.updateUser({ phone: phoneNumber })
        : await client.auth.signInWithOtp({
          phone: phoneNumber,
          options: {
            shouldCreateUser: options?.shouldCreateUser ?? false,
            data: { role },
          },
        });
    if (error) throw operationError(error.message, error.status !== undefined && error.status < 500);
  },

  async verifyPhoneOtp(phoneNumber, token, role, changeExistingPhone) {
    const client = requireClient();
    return phoneProof.resolve(`${role}:${phoneNumber}:${token}:${Boolean(changeExistingPhone)}`, async () => {
      const { data, error } = await client.auth.verifyOtp({
        phone: phoneNumber, token: token.trim(), type: changeExistingPhone ? 'phone_change' : 'sms',
      });
      if (error) throw operationError(error.message, error.status !== undefined && error.status < 500, error.code);
      const session = data.session ?? (await client.auth.getSession()).data.session;
      if (!session) throw operationError('Phone verification did not create a session. Please request a new code.');
      return session;
    }, isActiveSession, (session) => identityFromSession(client, session));
  },

  async ownsUser(userId: string) {
    const client = requireClient();
    const { data } = await client.auth.getSession();
    return data.session?.user.id === userId;
  },

  async signOut() {
    phoneProof.clear();
    emailProof.clear();
    const client = requireClient();
    const { error } = await client.auth.signOut();
    if (error) throw operationError(error.message);
  },

  subscribe(listener) {
    const client = requireClient();
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (passwordRecoveryInProgress || phoneRegistrationInProgress) return;
      if (event === 'SIGNED_OUT') {
        listener(null);
        return;
      }
      if (
        !session ||
        (event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED' && event !== 'USER_UPDATED')
      ) return;
      setTimeout(() => {
        void identityFromSession(client, session)
          .then(listener)
          .catch((error: unknown) => {
            if (__DEV__) console.error('Unable to synchronize the Supabase session.', error);
          });
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  },
};
