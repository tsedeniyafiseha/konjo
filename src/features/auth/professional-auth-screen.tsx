import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { OtpChallenge } from '@/application/auth/phone-auth-contracts';
import type { AuthSession } from '@/application/auth/session-controller';
import { KonjoButton } from '@/components/ui/konjo-button';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view';
import { usePhoneAuthentication, useProfessionalAuthentication } from '@/features/auth/client-auth-context';
import { formatLocalPhoneNumber, isValidEthiopianMobileNumber, toE164PhoneNumber } from '@/features/auth/phone-number';
import { useAuthSession } from '@/features/auth/session-context';
import { fontFamilies, layout, onboardingPalette as colors, radii, spacing } from '@/theme/tokens';

/**
 * Professional account entry.
 *
 * - choice:   log in or create an account (reached after choosing a language)
 * - signin:   phone number + password
 * - signup:   phone number → SMS code → set password → registration form
 * - recovery: phone number → SMS code → new password (existing account kept)
 *
 * Sign-up and recovery share the same three steps; only the copy and whether an
 * account may be created differ. The SMS code is always consumed before a
 * password is chosen, so an unverified phone can never own a professional login.
 */
type Mode = 'choice' | 'signin' | 'signup' | 'recovery';
const PASSWORD_MIN_LENGTH = 10;

function AuthLink({ label, onPress, disabled, ethiopic }: { label: string; onPress: () => void; disabled: boolean; ethiopic: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.link}><Text style={[styles.linkText, ethiopic && styles.ethiopic]}>{label}</Text></Pressable>;
}

const copyByLanguage = {
  en: {
    welcome: 'Your professional account', choice: 'Already registered? Log in to continue where you left off. New to Konjo? Create your account.',
    signin: 'Log in', signup: 'Create account', recovery: 'Reset password',
    loginHelp: 'Use your registered phone number and password.',
    signupHelp: 'We will send an SMS code to verify your phone number. Then set your password and complete your professional information.',
    recoveryHelp: 'Verify your registered phone number by SMS, then choose a new password. Your existing account and application will be kept.',
    setPassword: 'Set your password', newPassword: 'Choose a new password', phoneVerified: 'Phone number verified.',
    phone: 'Phone number', password: 'Password', confirm: 'Confirm password', passwordHint: 'Use at least 10 characters.',
    send: 'Send verification code', verify: 'Verify code', code: 'SMS verification code', codeHelp: 'Enter the code sent to', mockCodeHelp: 'SMS is temporarily in test mode. Enter this code:', resend: 'Resend code', back: 'Back', language: 'Change language',
    invalidPhone: 'Enter the 9-digit Ethiopian mobile number beginning with 7 or 9, without +251 or the leading 0.', weak: 'Use a password with at least 10 characters.', mismatch: 'The passwords do not match.', missing: 'Enter your password.', invalidCode: 'Enter the complete verification code.',
    unverified: 'Your phone number is not verified yet. We sent you a new SMS code.',
    unavailable: 'Professional phone-and-password authentication requires Supabase. Please contact support.', failed: 'We could not complete this step. Please try again.', switchAccount: 'You are signed in to another account type. Sign out to continue as a professional.', signout: 'Sign out', save: 'Save password & continue',
  },
  am: {
    welcome: 'የባለሙያ መለያዎ', choice: 'አስቀድመው ተመዝግበዋል? ይግቡ እና ካቆሙበት ይቀጥሉ። አዲስ ከሆኑ መለያ ይፍጠሩ።',
    signin: 'ይግቡ', signup: 'መለያ ይፍጠሩ', recovery: 'የይለፍ ቃል ይቀይሩ',
    loginHelp: 'በተመዘገቡበት ስልክ ቁጥር እና የይለፍ ቃል ይግቡ።',
    signupHelp: 'ስልክ ቁጥርዎን ለማረጋገጥ የSMS ኮድ እንልክልዎታለን። ከዚያ የይለፍ ቃል ያዘጋጁ እና የባለሙያ መረጃዎን ይሙሉ።',
    recoveryHelp: 'የተመዘገበውን ስልክ በSMS ያረጋግጡ፣ ከዚያ አዲስ የይለፍ ቃል ያዘጋጁ። መለያዎ እና ማመልከቻዎ ይቀመጣሉ።',
    setPassword: 'የይለፍ ቃል ያዘጋጁ', newPassword: 'አዲስ የይለፍ ቃል ይምረጡ', phoneVerified: 'ስልክ ቁጥርዎ ተረጋግጧል።',
    phone: 'ስልክ ቁጥር', password: 'የይለፍ ቃል', confirm: 'የይለፍ ቃል ያረጋግጡ', passwordHint: 'ቢያንስ 10 ቁምፊዎችን ይጠቀሙ።',
    send: 'የማረጋገጫ ኮድ ላክ', verify: 'ኮዱን አረጋግጥ', code: 'የSMS ማረጋገጫ ኮድ', codeHelp: 'ወደዚህ የተላከውን ኮድ ያስገቡ', mockCodeHelp: 'SMS ለጊዜው በሙከራ ሁኔታ ነው። ይህን ኮድ ያስገቡ፦', resend: 'ኮድ እንደገና ላክ', back: 'ተመለስ', language: 'ቋንቋ ቀይር',
    invalidPhone: 'በ7 ወይም 9 የሚጀምር ባለ9 አሃዝ ስልክ ቁጥር፣ ያለ +251 ወይም 0 ያስገቡ።', weak: 'ቢያንስ 10 ቁምፊዎች ያሉት የይለፍ ቃል ይጠቀሙ።', mismatch: 'የይለፍ ቃሎቹ አይዛመዱም።', missing: 'የይለፍ ቃልዎን ያስገቡ።', invalidCode: 'ሙሉ የማረጋገጫ ኮዱን ያስገቡ።',
    unverified: 'ስልክ ቁጥርዎ ገና አልተረጋገጠም። አዲስ የSMS ኮድ ልከንልዎታል።',
    unavailable: 'በስልክ እና የይለፍ ቃል መግባት Supabase ይፈልጋል። ድጋፍ ያግኙ።', failed: 'ይህን ደረጃ ማጠናቀቅ አልተቻለም። እንደገና ይሞክሩ።', switchAccount: 'በሌላ ዓይነት መለያ ገብተዋል። እንደ ባለሙያ ለመቀጠል ይውጡ።', signout: 'ውጣ', save: 'የይለፍ ቃል አስቀምጥ እና ቀጥል',
  },
  om: {
    welcome: 'Akkaawuntii ogeessaa keessan', choice: 'Dura galmooftaniittuu? Seenaatii bakka dhaabdan irraa itti fufaa. Haaraa yoo taatan akkaawuntii uumadhaa.',
    signin: 'Seenaa', signup: 'Akkaawuntii uumaa', recovery: 'Jecha icciitii jijjiiraa',
    loginHelp: 'Lakkoofsa bilbilaa galmeessitanii fi jecha icciitii fayyadamaa.',
    signupHelp: 'Lakkoofsa bilbilaa keessan mirkaneessuuf koodii SMS isiniif ergina. Achiis jecha icciitii kaa’aa, odeeffannoo ogeessaa guutaa.',
    recoveryHelp: 'Lakkoofsa bilbilaa galmeessitan SMSn mirkaneessaa, achiis jecha icciitii haaraa filadhaa. Akkaawuntii fi iyyanni keessan ni eegamu.',
    setPassword: 'Jecha icciitii kaa’aa', newPassword: 'Jecha icciitii haaraa filadhaa', phoneVerified: 'Lakkoofsi bilbilaa keessan mirkanaa’eera.',
    phone: 'Lakkoofsa bilbilaa', password: 'Jecha icciitii', confirm: 'Jecha icciitii mirkaneessaa', passwordHint: 'Yoo xiqqaate qubee 10 fayyadamaa.',
    send: 'Koodii mirkaneessaa ergi', verify: 'Koodii mirkaneessi', code: 'Koodii mirkaneessaa SMS', codeHelp: 'Koodii lakkoofsa kanaaf ergame galchaa', mockCodeHelp: 'SMS yeroo ammaa haala yaalii keessa jira. Koodii kana galchaa:', resend: 'Koodii irra deebi’ii ergi', back: 'Duubatti', language: 'Afaan jijjiiri',
    invalidPhone: 'Lakkoofsa bilbilaa Itoophiyaa dijiitii 9, 7 ykn 9 irraa jalqabu, +251 fi 0 malee galchaa.', weak: 'Jecha icciitii yoo xiqqaate qubee 10 qabu fayyadamaa.', mismatch: 'Jechoonni icciitii wal hin fakkaatan.', missing: 'Jecha icciitii galchaa.', invalidCode: 'Koodii mirkaneessaa guutuu galchaa.',
    unverified: 'Lakkoofsi bilbilaa keessan ammallee hin mirkanoofne. Koodii SMS haaraa isiniif ergineerra.',
    unavailable: 'Bilbilaa fi jecha icciitiin seenuun Supabase barbaada. Deeggarsa gaafadhaa.', failed: 'Tarkaanfii kana xumuruu hin dandeenye. Irra deebi’ii yaalaa.', switchAccount: 'Akkaawuntii gosa biraatiin seentaniittu. Akka ogeessaatti itti fufuuf keessaa ba’aa.', signout: 'Ba’i', save: 'Jecha icciitii olkaa’iitii itti fufi',
  },
};

function initialMode(intent: string | undefined): Mode {
  return intent === 'signup' || intent === 'signin' || intent === 'recovery' ? intent : 'choice';
}

export function ProfessionalAuthScreen() {
  const params = useLocalSearchParams<{ language?: string; intent?: string }>();
  const language = params.language === 'am' || params.language === 'om' ? params.language : 'en';
  const copy = copyByLanguage[language];
  const auth = useProfessionalAuthentication();
  const phoneAuth = usePhoneAuthentication();
  const { session, status, completeSignIn, signOut } = useAuthSession();
  const [mode, setMode] = useState<Mode>(() => initialMode(params.intent));
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState<AuthSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try { await action(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : copy.failed); }
    finally { pending.current = false; setBusy(false); }
  }

  async function finish(nextSession: AuthSession) {
    await completeSignIn(nextSession);
    setPassword('');
    setConfirmation('');
    setCompleted(true);
  }

  function validatePassword() {
    if (password.length < PASSWORD_MIN_LENGTH) throw new Error(copy.weak);
    if (password !== confirmation) throw new Error(copy.mismatch);
  }

  async function sendCode(phoneNumber: string, createAccount: boolean, resend = false) {
    const next = await phoneAuth.requestOtp(phoneNumber, 'professional', {
      shouldCreateUser: createAccount,
      ...(resend ? { resend: true } : {}),
    });
    setChallenge(next);
    setCode('');
  }

  /** Step 1: phone (+ password for login). */
  function submit() {
    void run(async () => {
      if (!auth) throw new Error(copy.unavailable);
      if (!isValidEthiopianMobileNumber(phone)) throw new Error(copy.invalidPhone);
      const phoneNumber = toE164PhoneNumber(phone);
      if (mode === 'signin') {
        if (!password) throw new Error(copy.missing);
        const next = await auth.signInWithPhone({ phoneNumber, password });
        if (next.phoneVerified === false) {
          // Legacy account that never proved its number: verify it now, then
          // let the professional confirm a password before entering the app.
          setPassword('');
          setMode('recovery');
          setNotice(copy.unverified);
          await sendCode(phoneNumber, false);
          return;
        }
        await finish(next);
        return;
      }
      setNotice(null);
      await sendCode(phoneNumber, mode === 'signup');
    });
  }

  /** Step 2: SMS code. A code can only be consumed once, so keep the proof. */
  function verify() {
    void run(async () => {
      if (!auth || !challenge) throw new Error(copy.unavailable);
      if (code.length !== challenge.codeLength) throw new Error(copy.invalidCode);
      const next = await phoneAuth.verifyOtp({
        challengeId: challenge.id, phoneNumber: challenge.phoneNumber, code,
        role: 'professional', shouldCreateUser: false,
      });
      setVerified({ ...next, phoneNumber: challenge.phoneNumber, phoneVerified: true });
      setNotice(copy.phoneVerified);
      setPassword('');
      setConfirmation('');
    });
  }

  /** Step 3: password. Policy failures keep the verified session for a retry. */
  function savePassword() {
    void run(async () => {
      if (!auth || !verified) throw new Error(copy.unavailable);
      validatePassword();
      await auth.updatePassword(password);
      await finish(verified);
    });
  }

  function resend() {
    void run(async () => {
      if (!challenge) return;
      await sendCode(challenge.phoneNumber, mode === 'signup', true);
    });
  }

  function changeMode(next: Mode) {
    void run(async () => {
      if (verified) await signOut();
      setVerified(null);
      setChallenge(null);
      setCode('');
      setPassword('');
      setConfirmation('');
      setNotice(null);
      setMode(next);
    });
  }

  function back() {
    if (mode === 'choice') {
      router.replace('/professional-language');
      return;
    }
    if (challenge && !verified) {
      // Return to the phone step without discarding the chosen mode.
      setChallenge(null);
      setCode('');
      setError(null);
      return;
    }
    changeMode('choice');
  }

  // Wait for explicit completion: Supabase may publish SIGNED_IN as soon as the
  // SMS code is verified, before the password has been saved. One redirect owns navigation.
  if (!busy && (completed || mode === 'choice') && session?.role === 'professional' && session.phoneNumber && session.phoneVerified !== false) {
    return <Redirect href={`/pro?initial=${language}` as Href} />;
  }
  const wrongRole = session && session.role !== 'professional';
  const passwordStep = Boolean(verified);
  const codeStep = Boolean(challenge) && !verified;
  const title = passwordStep
    ? (mode === 'recovery' ? copy.newPassword : copy.setPassword)
    : codeStep ? copy.code : mode === 'choice' ? copy.welcome : copy[mode];
  const body = passwordStep
    ? copy.passwordHint
    : codeStep ? challenge!.developmentCode
      ? `${copy.mockCodeHelp} ${challenge!.developmentCode}`
      : `${copy.codeHelp} ${challenge!.phoneNumber}`
    : mode === 'choice' ? copy.choice : mode === 'signin' ? copy.loginHelp : mode === 'signup' ? copy.signupHelp : copy.recoveryHelp;
  const textStyle = language === 'am' ? styles.ethiopic : undefined;
  const linkProps = { disabled: busy, ethiopic: language === 'am' };
  const passwordFields = (
    <>
      <Text style={[styles.label, textStyle]}>{copy.password}</Text>
      <TextInput accessibilityLabel={copy.password} value={password} onChangeText={setPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" style={styles.input} />
      <Text style={[styles.body, textStyle]}>{copy.passwordHint}</Text>
      <Text style={[styles.label, textStyle]}>{copy.confirm}</Text>
      <TextInput accessibilityLabel={copy.confirm} value={confirmation} onChangeText={setConfirmation} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" style={styles.input} />
    </>
  );
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <KeyboardAwareScrollView contentContainerStyle={styles.container}>
          <View style={styles.form}>
            <AuthLink {...linkProps} label={mode === 'choice' ? copy.language : copy.back} onPress={back} />
            <Text accessibilityRole="header" style={[styles.title, textStyle]}>{title}</Text>
            <Text style={[styles.body, textStyle]}>{body}</Text>
            {notice ? <Text accessibilityRole="text" style={[styles.notice, textStyle]}>{notice}</Text> : null}
            {wrongRole ? <>
              <Text style={[styles.body, textStyle]}>{copy.switchAccount}</Text>
              <KonjoButton label={copy.signout} loading={busy} onPress={() => void run(signOut)} />
            </> : mode === 'choice' ? <>
              <KonjoButton label={copy.signin} variant="dark" disabled={status === 'restoring'} onPress={() => changeMode('signin')} />
              <KonjoButton label={copy.signup} disabled={status === 'restoring'} onPress={() => changeMode('signup')} />
            </> : passwordStep ? <>
              {passwordFields}
              <KonjoButton label={copy.save} variant="dark" loading={busy} onPress={savePassword} />
            </> : codeStep ? <>
              <TextInput accessibilityLabel={copy.code} placeholder={copy.code} value={code} onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, challenge!.codeLength))} editable={!busy} inputMode="numeric" autoComplete="sms-otp" textContentType="oneTimeCode" style={styles.input} />
              <KonjoButton label={copy.verify} variant="dark" loading={busy} onPress={verify} />
              <AuthLink {...linkProps} label={copy.resend} onPress={resend} />
            </> : <>
              <Text style={[styles.label, textStyle]}>{copy.phone}</Text>
              <View style={styles.phoneRow}><Text style={styles.prefix}>+251</Text><TextInput accessibilityLabel={copy.phone} placeholder="9 12 345 678" value={phone} onChangeText={(value) => setPhone(formatLocalPhoneNumber(value))} editable={!busy} inputMode="tel" autoComplete="tel-national" style={[styles.input, styles.phoneInput]} /></View>
              {mode === 'signin' ? <>
                <Text style={[styles.label, textStyle]}>{copy.password}</Text>
                <TextInput accessibilityLabel={copy.password} value={password} onChangeText={setPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" style={styles.input} />
              </> : null}
              <KonjoButton label={mode === 'signin' ? copy.signin : copy.send} variant="dark" loading={busy} disabled={status === 'restoring'} onPress={submit} />
              {mode === 'signin' && <AuthLink {...linkProps} label={copy.recovery} onPress={() => changeMode('recovery')} />}
              <AuthLink {...linkProps} label={mode === 'signin' ? copy.signup : copy.signin} onPress={() => changeMode(mode === 'signin' ? 'signup' : 'signin')} />
            </>}
            {error && <Text accessibilityRole="alert" style={[styles.error, textStyle]}>{error}</Text>}
          </View>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  container: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: layout.horizontalPadding },
  form: { width: '100%', maxWidth: layout.contentMaxWidth, gap: spacing.md, paddingVertical: spacing.lg },
  title: { color: colors.text, fontFamily: fontFamilies.body.semibold, fontSize: 28 },
  body: { color: colors.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 14, lineHeight: 22 },
  notice: { color: colors.olive, fontFamily: fontFamilies.body.semibold, fontSize: 14, lineHeight: 22 },
  label: { color: colors.text, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  input: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.white, paddingHorizontal: 14, color: colors.text, fontSize: 16 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  prefix: { color: colors.text, fontSize: 16 },
  phoneInput: { flex: 1 },
  link: { paddingVertical: 10, minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.olive, fontFamily: fontFamilies.body.semibold, fontSize: 14, textDecorationLine: 'underline' },
  error: { color: '#9B2635', fontSize: 14, lineHeight: 22 },
  ethiopic: { fontFamily: fontFamilies.ethiopic.regular },
});
