import { supabaseServiceHeaders } from '../src/adapters/supabase-service-headers.ts';

const projectUrl = (
  process.env.KONJO_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
).trim().replace(/\/$/, '');
const publishableKey = (
  process.env.KONJO_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  ''
).trim();
const secretKey = (process.env.KONJO_SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '');
const providerMode = process.env.KONJO_AUTH_MODE === 'provider';

async function checkPublishableAccess(): Promise<boolean> {
  const response = await fetch(`${projectUrl}/rest/v1/zones?select=id&limit=1`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
    },
    signal: AbortSignal.timeout(5_000),
  });
  if (response.ok) {
    console.log('Supabase preflight passed: project credentials and Konjo schema are available.');
    return true;
  }
  const body = await response.text();
  const schemaMissing = response.status === 404 && body.includes('public.zones');
  console.error(schemaMissing
    ? 'Supabase preflight failed: the project is reachable, but the Konjo migration is not applied.'
    : `Supabase preflight failed: project returned HTTP ${response.status}.`);
  return false;
}

// Never prints the key; only reports whether it grants service-role access.
async function checkSecretAccess(): Promise<boolean> {
  if (!secretKey) {
    console.error(providerMode
      ? 'Supabase secret check failed: KONJO_AUTH_MODE=provider requires KONJO_SUPABASE_SECRET_KEY.'
      : 'Supabase secret check skipped: KONJO_SUPABASE_SECRET_KEY is not set.');
    return !providerMode;
  }
  if (publishableKey && secretKey === publishableKey) {
    console.error('Supabase secret check failed: KONJO_SUPABASE_SECRET_KEY is the publishable key.');
    return false;
  }
  const response = await fetch(`${projectUrl}/rest/v1/rpc/list_professional_applications`, {
    method: 'POST',
    headers: supabaseServiceHeaders(secretKey, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ p_status: 'pending' }),
    signal: AbortSignal.timeout(5_000),
  });
  if (response.ok) {
    console.log('Supabase secret check passed: the backend has service-role access.');
    return true;
  }
  console.error(
    response.status === 401 || response.status === 403
      ? 'Supabase secret check failed: the key was rejected or lacks service-role access.'
      : `Supabase secret check failed: project returned HTTP ${response.status}.`,
  );
  return false;
}

if (!projectUrl || !publishableKey) {
  console.error('Supabase preflight failed: configure the project URL and publishable key.');
  process.exitCode = 1;
} else {
  try {
    const publicOk = await checkPublishableAccess();
    const secretOk = await checkSecretAccess();
    if (!publicOk || !secretOk) process.exitCode = 1;
  } catch (error) {
    console.error(
      'Supabase preflight failed:',
      error instanceof Error ? error.message : 'unknown connection error',
    );
    process.exitCode = 1;
  }
}
