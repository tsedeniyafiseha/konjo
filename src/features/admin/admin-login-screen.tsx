import type { Href } from 'expo-router';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { clientDependencies } from '@/bootstrap/client-composition-root';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view';
import { useAuthSession } from '@/features/auth/session-context';
import { fontFamilies, palette, radii, spacing } from '@/theme/tokens';

export function AdminLoginScreen() {
  const { completeSignIn } = useAuthSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!email.trim() || !password || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await completeSignIn(await clientDependencies.adminAuthenticationGateway.signInWithEmail({
        email,
        password,
      }));
      router.replace('/admin' as Href);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Administrator sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardAvoider}>
        <KeyboardAwareScrollView contentContainerStyle={styles.screen}>
          <View style={styles.card}>
            <Text style={styles.wordmark}>Konjo</Text>
            <Text accessibilityRole="header" style={styles.title}>Operations console</Text>
            <Text style={styles.copy}>Restricted access for provisioned Konjo administrators.</Text>
            <TextInput
              accessibilityLabel="Administrator email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={palette.textMuted}
              style={styles.input}
              value={email}
            />
            <TextInput
              accessibilityLabel="Administrator password"
              autoCapitalize="none"
              onChangeText={setPassword}
              onSubmitEditing={submit}
              placeholder="Password"
              placeholderTextColor={palette.textMuted}
              secureTextEntry
              style={styles.input}
              value={password}
            />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={!email.trim() || !password || submitting}
              onPress={submit}
              style={[styles.button, (!email.trim() || !password || submitting) && styles.disabled]}>
              <Text style={styles.buttonLabel}>{submitting ? 'Signing in…' : 'Sign in securely'}</Text>
            </Pressable>
          </View>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.canvas },
  keyboardAvoider: { flex: 1 },
  screen: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 430, borderWidth: 1, borderColor: palette.border, borderRadius: radii.lg, backgroundColor: palette.surface, padding: 28 },
  wordmark: { color: palette.olive, fontFamily: fontFamilies.display.medium, fontSize: 22 },
  title: { color: palette.text, fontFamily: fontFamilies.display.medium, fontSize: 30, marginTop: spacing.md },
  copy: { color: palette.textSecondary, fontFamily: fontFamilies.body.regular, fontSize: 14, lineHeight: 21, marginBottom: spacing.lg, marginTop: spacing.xs },
  input: { minHeight: 50, borderWidth: 1, borderColor: palette.border, borderRadius: radii.sm, color: palette.text, fontFamily: fontFamilies.body.regular, fontSize: 14, marginTop: spacing.sm, paddingHorizontal: spacing.md },
  error: { color: palette.error, fontFamily: fontFamilies.body.regular, fontSize: 13, marginTop: spacing.sm },
  button: { minHeight: 50, borderRadius: radii.sm, backgroundColor: palette.olive, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  buttonLabel: { color: palette.white, fontFamily: fontFamilies.body.semibold, fontSize: 14 },
  disabled: { opacity: 0.45 },
});
