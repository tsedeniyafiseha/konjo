import type { Href } from 'expo-router';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClientAuthError } from '@/application/auth/client-auth-contracts';
import { KonjoButton } from '@/components/ui/konjo-button';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view';
import { recordLegalAcceptance } from '@/features/support/legal-acceptance';
import { LegalConsentSheet } from '@/features/support/legal-consent-sheet';
import { legalLabels } from '@/features/support/legal-content';
import { LegalLinks } from '@/features/support/legal-links';
import { KonjoIcon } from '@/components/ui/konjo-icon';
import { ClientLanguageToggle } from '@/localization/client-language-toggle';
import { usePublicClientCopy } from '@/localization/use-public-client-copy';
import { useClientAuthentication } from './client-auth-context';
import { useAuthSession } from './session-context';
import { fontFamilies, palette, radii, spacing } from '@/theme/tokens';

/**
 * Client account entry. Clients register and sign in with email + password and
 * are signed in immediately after registering ("Confirm email" is disabled in
 * Supabase Auth). Password-reset links are delivered by email and land back on
 * this screen (web: same browser, native: the konjoclient:// deep link). The
 * check-email / confirm modes remain only as a fallback should confirmation be
 * re-enabled later.
 */
const PASSWORD_MIN_LENGTH = 10;
const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
          <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.content}>
              <View style={styles.topBar}>
                <Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/role-select' as Href)} style={styles.backButton}>
                  <KonjoIcon color={palette.text} name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={20} />
                </Pressable>
                <ClientLanguageToggle />
              </View>
              {children}
            </View>
          </KeyboardAwareScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

export function ClientAuthLandingScreen() {
  const { isAmharic, t } = usePublicClientCopy();
  const ethiopic = isAmharic ? styles.ethiopicRegular : undefined;
  return <AuthShell>
    <View style={styles.brand}><Text style={styles.brandName}>Konjo</Text></View>
    <View style={styles.authIntro}>
      <Text accessibilityRole="header" style={[styles.title, isAmharic && styles.ethiopicSemibold]}>{t('authWelcomeTitle')}</Text>
      <Text style={[styles.subtitle, ethiopic]}>{t('clientAuthLandingBody')}</Text>
    </View>
    <View style={styles.actions}>
      <KonjoButton label={t('createAccount')} onPress={() => router.push('/client-email?mode=signup' as Href)} variant="dark" />
      <KonjoButton label={t('signIn')} onPress={() => router.push('/client-email?mode=login' as Href)} />
    </View>
    <Text style={[styles.privacy, ethiopic]}>{t('termsPrivacy')}</Text>
    <LegalLinks color={palette.textSecondary} language={isAmharic ? 'am' : 'en'} />
  </AuthShell>;
}

type Mode = 'signup' | 'login' | 'forgot' | 'reset' | 'confirm' | 'check-email';
function TextAction({ label, onPress, disabled, ethiopic }: { label: string; onPress: () => void; disabled: boolean; ethiopic?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.textButton}><Text style={[styles.textButtonStrong, ethiopic && styles.ethiopicSemibold]}>{label}</Text></Pressable>;
}

type EmailAuthParams = { mode?: string; code?: string; token?: string; token_hash?: string; type?: string; error_description?: string };
export function ClientEmailAuthScreen() {
  const params = useLocalSearchParams<EmailAuthParams>();
  // Native email links may update an already-mounted route. A new callback
  // must open its confirmation/reset form, not leave the old login form visible.
  return <ClientEmailForm key={`${params.mode ?? ''}:${params.code ?? params.token_hash ?? params.token ?? ''}`} params={params} />;
}

function initialModeFor(params: EmailAuthParams): Mode {
  if (params.mode === 'reset' || params.type === 'recovery') return 'reset';
  if (params.mode === 'confirm' || params.code || params.token_hash) return 'confirm';
  if (params.mode === 'login') return 'login';
  if (params.mode === 'forgot') return 'forgot';
  return 'signup';
}

function ClientEmailForm({ params }: { params: EmailAuthParams }) {
  const auth = useClientAuthentication();
  const { completeSignIn, signOut, session } = useAuthSession();
  const { isAmharic, t } = usePublicClientCopy();
  const [mode, setMode] = useState<Mode>(() => initialModeFor(params));
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const legal = legalLabels[isAmharic ? 'am' : 'en'];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(params.error_description ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [developmentToken, setDevelopmentToken] = useState('');
  const pending = useRef(false);
  const autoConfirmed = useRef(false);
  const callbackCode = params.code ?? params.token ?? developmentToken;
  const hasCallback = Boolean(params.code || params.token || params.token_hash);
  const validEmail = EMAIL_PATTERN.test(email.trim());
  const ethiopic = isAmharic ? styles.ethiopicRegular : undefined;

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError(null);
    setMessage(null);
    try { await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : t('continueError')); }
    finally { pending.current = false; setLoading(false); }
  }

  function changeMode(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
    setPassword('');
    setConfirmation('');
  }

  function validateNewPassword() {
    if (password.length < PASSWORD_MIN_LENGTH) throw new Error(t('weakSignupPassword'));
    if (password !== confirmation) throw new Error(t('passwordMismatch'));
  }

  function confirmEmail() {
    void run(async () => {
      if (!hasCallback) throw new Error(t('confirmationFailed'));
      const next = await auth.confirmEmail(callbackCode, params.token_hash);
      await completeSignIn(next);
      router.replace('/client' as Href);
    });
  }

  // A confirmation link carries everything needed: activate the account as
  // soon as the screen opens instead of asking for one more tap.
  useEffect(() => {
    if (mode === 'confirm' && hasCallback && !autoConfirmed.current) {
      autoConfirmed.current = true;
      confirmEmail();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    void run(async () => {
      if (mode === 'confirm') {
        if (!hasCallback) throw new Error(t('confirmationFailed'));
        const next = await auth.confirmEmail(callbackCode, params.token_hash);
        await completeSignIn(next);
        router.replace('/client' as Href);
        return;
      }
      if (mode !== 'reset' && !validEmail) throw new Error(t('invalidSignupEmail'));
      if (mode === 'forgot') {
        const result = await auth.requestPasswordReset(email.trim().toLowerCase());
        setMessage(t('resetEmailSentBody'));
        if (result.developmentToken) setDevelopmentToken(result.developmentToken);
        return;
      }
      if (!password) throw new Error(t('enterPassword'));
      if (mode === 'login') {
        const next = await auth.signInWithEmail({ email: email.trim().toLowerCase(), password });
        await completeSignIn(next);
        router.replace('/client' as Href);
        return;
      }
      validateNewPassword();
      if (mode === 'reset') {
        if (!hasCallback && !developmentToken) throw new Error(t('confirmationFailed'));
        await auth.confirmPasswordReset(callbackCode, password, params.token_hash);
        await signOut();
        changeMode('login');
        router.setParams({ mode: 'login', code: undefined, token: undefined, token_hash: undefined, type: undefined });
        setMessage(t('passwordChanged'));
        return;
      }
      if (fullName.trim().length < 2) throw new Error(t('invalidSignupName'));
      if (!acceptedTerms) throw new Error(t('termsRequired'));
      try {
        const next = await auth.registerWithEmail({ fullName: fullName.trim(), email: email.trim().toLowerCase(), password });
        await completeSignIn(next);
        void recordLegalAcceptance();
        router.replace('/client' as Href);
      } catch (failure) {
        if (failure instanceof ClientAuthError && failure.code === 'confirmation_required') {
          changeMode('check-email');
        } else throw failure;
      }
    });
  }

  function resendConfirmation() {
    void run(async () => {
      if (!validEmail) throw new Error(t('invalidSignupEmail'));
      await auth.resendEmailConfirmation(email.trim().toLowerCase());
      setMessage(t('confirmationResent'));
    });
  }

  const titles: Record<Mode, string> = {
    signup: t('createAccountTitle'), login: t('welcomeBack'), forgot: t('resetPasswordTitle'), reset: t('resetPasswordTitle'),
    confirm: t('confirmingEmailTitle'), 'check-email': t('checkEmailTitle'),
  };
  const descriptions: Record<Mode, string> = {
    signup: t('emailSignupBody'),
    login: t('loginBody'),
    forgot: t('forgotPasswordBody'),
    reset: t('resetPasswordBody'),
    confirm: t('confirmingEmailBody'),
    'check-email': t('checkEmailBody').replace('{email}', email.trim() || t('emailAddress').toLowerCase()),
  };
  const wrongRole = session && session.role !== 'client' && mode !== 'confirm' && mode !== 'reset';
  const needsPassword = mode === 'signup' || mode === 'login' || mode === 'reset';
  const confirming = mode === 'confirm' && loading;
  const primaryLabel = mode === 'signup' ? t('createAccount')
    : mode === 'login' ? t('signIn')
    : mode === 'forgot' ? t('sendResetInstructions')
    : mode === 'reset' ? t('saveNewPassword')
    : t('confirmEmailContinue');
  return <AuthShell>
    <View style={styles.emailHeader}>
      <Text accessibilityRole="header" style={[styles.title, styles.emailTitle, isAmharic && styles.ethiopicSemibold]}>{titles[mode]}</Text>
      <Text style={[styles.subtitle, styles.emailSubtitle, ethiopic]}>{descriptions[mode]}</Text>
    </View>
    <View style={styles.formCard}>
      {wrongRole ? <>
        <Text style={[styles.subtitle, ethiopic]}>{t('wrongRoleClient').replace('{role}', session.role)}</Text>
        <KonjoButton label={t('logOut')} loading={loading} onPress={() => void run(signOut)} />
      </> : confirming ? (
        <View style={styles.confirming}><ActivityIndicator color={palette.olive} /><Text style={[styles.subtitle, ethiopic]}>{t('connecting')}</Text></View>
      ) : <>
        {mode === 'signup' && <Field label={t('fullName')} value={fullName} onChangeText={setFullName} placeholder={t('fullNamePlaceholder')} autoComplete="name" textContentType="name" editable={!loading} ethiopic={isAmharic} />}
        {(mode === 'signup' || mode === 'login' || mode === 'forgot' || mode === 'check-email') && (
          <Field label={t('emailAddress')} value={email} onChangeText={setEmail} placeholder="you@example.com" inputMode="email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" editable={!loading} ethiopic={isAmharic} />
        )}
        {needsPassword && <>
          <Field label={mode === 'reset' ? t('newPassword') : t('password')} value={password} onChangeText={setPassword} placeholder={mode === 'login' ? t('passwordCurrentPlaceholder') : t('passwordNewPlaceholder')} secureTextEntry={!showPassword} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} autoCapitalize="none" autoCorrect={false} editable={!loading} helper={mode !== 'login' ? t('passwordRequirement') : undefined} ethiopic={isAmharic} />
          {mode !== 'login' && <Field label={t('confirmPassword')} value={confirmation} onChangeText={setConfirmation} placeholder={t('confirmPasswordPlaceholder')} secureTextEntry={!showPassword} autoComplete="new-password" autoCapitalize="none" autoCorrect={false} editable={!loading} ethiopic={isAmharic} />}
          <TextAction ethiopic={isAmharic} label={showPassword ? t('hidePassword') : t('showPassword')} disabled={loading} onPress={() => setShowPassword(!showPassword)} />
        </>}
        {mode === 'signup' && <Pressable accessibilityRole="button" accessibilityState={{ checked: acceptedTerms }} disabled={loading} onPress={() => setConsentOpen(true)} style={styles.termsRow}>
          <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>{acceptedTerms && <Text style={{ color: palette.white }}>✓</Text>}</View>
          <Text style={[styles.termsText, ethiopic]}>{acceptedTerms ? legal.accepted : legal.readPrompt}</Text>
        </Pressable>}
        {mode === 'signup' && <LegalConsentSheet language={isAmharic ? 'am' : 'en'} onAccept={() => { setAcceptedTerms(true); setConsentOpen(false); }} onClose={() => setConsentOpen(false)} visible={consentOpen} />}
        {mode === 'signup' && <LegalLinks align="left" color={palette.olive} language={isAmharic ? 'am' : 'en'} />}
        {mode !== 'check-email' && <KonjoButton label={primaryLabel} loading={loading} variant="dark" onPress={submit} />}
        {(mode === 'check-email' || (mode === 'confirm' && !loading)) && <TextAction ethiopic={isAmharic} label={t('resendConfirmation')} disabled={loading} onPress={resendConfirmation} />}
        {mode === 'login' && <TextAction ethiopic={isAmharic} label={t('forgotPassword')} disabled={loading} onPress={() => changeMode('forgot')} />}
        {mode === 'forgot' && developmentToken && <TextAction label="Development only: open reset form" disabled={loading} onPress={() => changeMode('reset')} />}
        {(mode === 'forgot' || mode === 'reset' || mode === 'confirm') && <TextAction ethiopic={isAmharic} label={t('backToSignIn')} disabled={loading} onPress={() => changeMode('login')} />}
        {(mode === 'login' || mode === 'signup' || mode === 'check-email') && <TextAction ethiopic={isAmharic} label={mode === 'login' ? `${t('newToKonjo')} ${t('createAccount')}` : `${t('alreadyRegistered')} ${t('signIn')}`} disabled={loading} onPress={() => changeMode(mode === 'login' ? 'signup' : 'login')} />}
        {error && <Text accessibilityRole="alert" style={[styles.error, ethiopic]}>{error}</Text>}
        {message && <Text accessibilityLiveRegion="polite" style={[styles.success, ethiopic]}>{message}</Text>}
      </>}
    </View>
  </AuthShell>;
}

type FieldProps = React.ComponentProps<typeof TextInput> & { label: string; helper?: string; ethiopic?: boolean };
function Field({ label, helper, ethiopic, ...props }: FieldProps) {
  return <View style={styles.field}>
    <Text style={[styles.fieldLabel, ethiopic && styles.ethiopicSemibold]}>{label}</Text>
    <View style={styles.inputFrame}><TextInput accessibilityLabel={label} placeholderTextColor={palette.textMuted} style={styles.input} {...props} /></View>
    {helper && <Text style={[styles.fieldHelper, ethiopic && styles.ethiopicRegular]}>{helper}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.canvas }, safeArea: { flex: 1 }, keyboard: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  content: { width: '100%', maxWidth: 460, flex: 1 },
  topBar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  backButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  brand: { alignItems: 'center', marginTop: 26 }, brandName: { color: palette.olive, fontFamily: fontFamilies.display.semibold, fontSize: 28 },
  authIntro: { alignItems: 'center', marginTop: 42 },
  emailHeader: { marginTop: 24, paddingHorizontal: 2 },
  title: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 31, lineHeight: 39, textAlign: 'center' },
  subtitle: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 9 },
  emailTitle: { fontSize: 34, lineHeight: 42, textAlign: 'left' },
  emailSubtitle: { maxWidth: 410, textAlign: 'left' },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
  textButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, textButtonStrong: { color: palette.olive, fontFamily: fontFamilies.body.semibold, fontSize: 13 },
  privacy: { color: palette.textMuted, fontFamily: fontFamilies.body.regular, fontSize: 10.5, lineHeight: 16, textAlign: 'center', marginTop: spacing.md },
  formCard: { marginTop: spacing.lg, padding: spacing.lg, borderWidth: 1, borderColor: palette.border, borderRadius: radii.lg, backgroundColor: palette.surface },
  confirming: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  field: { marginBottom: 16 },
  fieldLabel: { color: palette.text, fontFamily: fontFamilies.body.semibold, fontSize: 13, marginBottom: 8 },
  inputFrame: { minHeight: 54, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: palette.border, borderRadius: radii.md, backgroundColor: palette.surfaceMuted, overflow: 'hidden' },
  input: { minHeight: 52, flex: 1, color: palette.text, fontFamily: fontFamilies.body.regular, fontSize: 15, paddingHorizontal: 15, paddingVertical: 12 },
  fieldHelper: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 11.5, lineHeight: 17, marginTop: 6 },
  termsRow: { minHeight: 48, flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: -2, marginBottom: 12, paddingVertical: 7 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: palette.border, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { borderColor: palette.olive, backgroundColor: palette.olive },
  termsText: { flex: 1, color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 12, lineHeight: 18 },
  error: { color: palette.error, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18, marginBottom: spacing.sm }, success: { color: palette.olive, fontFamily: fontFamilies.body.regular, fontSize: 12.5, lineHeight: 18, marginBottom: spacing.sm },
  ethiopicRegular: { fontFamily: fontFamilies.ethiopic.regular },
  ethiopicSemibold: { fontFamily: fontFamilies.ethiopic.semibold },
});
