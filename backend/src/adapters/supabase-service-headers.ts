/**
 * Request headers for server-side Supabase calls.
 *
 * New `sb_secret_…` keys authenticate through the `apikey` header alone and
 * must not be sent as a bearer token. Legacy `service_role` keys are JWTs and
 * must also be sent as the bearer token so PostgREST runs as `service_role`.
 */
export function supabaseServiceHeaders(
  secretKey: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    apikey: secretKey,
    ...(secretKey.startsWith('eyJ') ? { Authorization: `Bearer ${secretKey}` } : {}),
    ...extra,
  };
}
