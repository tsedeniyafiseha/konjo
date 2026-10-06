/**
 * Chapa issues test-mode secret keys under several prefixes:
 * `CHASECK_TEST-…` (classic dashboard), `sk_test_…` (legacy) and
 * `CHAPA_TEST_PRIV_…` (current dashboard). Anything else is a live key.
 */
export const CHAPA_TEST_KEY_PATTERN = /^(CHASECK_TEST-|sk_test_|CHAPA_TEST_)/i;

export function chapaKeyMode(secretKey: string): 'test' | 'live' {
  return CHAPA_TEST_KEY_PATTERN.test(secretKey) ? 'test' : 'live';
}
