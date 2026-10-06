// Read-only checks. Never signs in, creates users, runs jobs, or changes decisions.
import { backendConfig } from '../src/config.ts';
import { supabaseServiceHeaders } from '../src/adapters/supabase-service-headers.ts';

const config = backendConfig;
const apiUrl = `http://${config.host}:${config.port}`;
async function jsonRequest(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Read-only check returned HTTP ${response.status} for ${new URL(url).pathname}.`);
  return response.json();
}

async function check(): Promise<void> {
  if (config.authMode !== 'provider' || !config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error('Configure provider mode and the backend Supabase credentials first.');
  }
  const frontendUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  if (frontendUrl && frontendUrl !== config.supabaseUrl) throw new Error('Frontend and backend point to different Supabase projects.');
  const health = await jsonRequest(`${apiUrl}/health`) as { authMode?: string; backgroundJobsEnabled?: boolean };
  if (health.authMode !== 'provider') throw new Error('The running backend must be restarted in provider mode.');
  await jsonRequest(`${apiUrl}/ready`);
  console.log(`Running backend: Supabase provider mode, ready; background jobs ${health.backgroundJobsEnabled ? 'enabled' : 'disabled'}.`);
  const secretHeaders = supabaseServiceHeaders(config.supabaseSecretKey, { 'Content-Type': 'application/json' });
  await jsonRequest(`${config.supabaseUrl}/rest/v1/rpc/get_admin_summary`, { method: 'POST', headers: secretHeaders, body: '{}' });
  const applications = await jsonRequest(`${config.supabaseUrl}/rest/v1/rpc/list_professional_applications`, {
    method: 'POST', headers: secretHeaders, body: JSON.stringify({ p_status: 'pending' }),
  });
  if (!Array.isArray(applications)) throw new Error('The admin review queue returned an unexpected response.');
  console.log(`Admin summary and pending review queue are available (${applications.length} pending applications).`);
  const admins = await jsonRequest(`${config.supabaseUrl}/rest/v1/profiles?select=user_id&account_role=eq.admin&limit=1`, { headers: secretHeaders });
  console.log(Array.isArray(admins) && admins.length > 0
    ? 'An administrator profile exists in this Supabase project.'
    : 'No administrator profile exists. An authorized operator must provision one before admin sign-in.');
  for (const path of ['/v1/admin/summary', '/v1/admin/professional-applications?status=pending']) {
    const response = await fetch(`${apiUrl}${path}`, { signal: AbortSignal.timeout(10_000) });
    if (response.status !== 401) throw new Error('An administrator endpoint did not reject an unauthenticated request.');
  }
  console.log('Admin endpoints reject unauthenticated access. No application decisions or account data were changed.');
}

check().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Provider integration check failed.');
  process.exitCode = 1;
});
