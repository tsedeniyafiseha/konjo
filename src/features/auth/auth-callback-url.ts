const AUTH_CALLBACK_ROUTES = new Set(['client-email', 'professional-email']);
const AUTH_CALLBACK_PARAMETERS = new Set([
  'code',
  'error',
  'error_code',
  'error_description',
  'mode',
  'token',
  'token_hash',
  'type',
]);

/**
 * Converts native auth links into Expo Router paths. Supabase can return
 * callback errors in the URL fragment, which Expo Router does not expose as
 * route parameters, so those safe fields are copied into the query string.
 * Session and refresh tokens are intentionally never forwarded through route
 * state; Konjo uses Supabase's PKCE code exchange instead.
 */
export function normalizeNativeAuthPath(path: string): string {
  try {
    const url = new URL(path, 'konjoclient://app');
    if (url.protocol !== 'konjoclient:') return path;

    const route = (url.hostname || url.pathname).replace(/^\/+/, '').split('/')[0];
    if (!AUTH_CALLBACK_ROUTES.has(route)) return path;

    const normalized = new URLSearchParams();
    for (const [key, value] of url.searchParams) {
      if (AUTH_CALLBACK_PARAMETERS.has(key)) normalized.append(key, value);
    }

    const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
    for (const [key, value] of fragment) {
      if (AUTH_CALLBACK_PARAMETERS.has(key) && !normalized.has(key)) {
        normalized.set(key, value);
      }
    }

    const query = normalized.toString();
    return `/${route}${query ? `?${query}` : ''}`;
  } catch {
    return path;
  }
}
