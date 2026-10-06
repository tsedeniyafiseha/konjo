// Creates (or promotes) the Konjo operations administrator in Supabase.
// Reads KONJO_SUPABASE_URL, KONJO_SUPABASE_SECRET_KEY, KONJO_ADMIN_EMAIL and
// KONJO_ADMIN_PASSWORD from .env. Never prints secrets or the password.
import { supabaseServiceHeaders } from '../src/adapters/supabase-service-headers.ts';

const projectUrl = (process.env.KONJO_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
const secretKey = (process.env.KONJO_SUPABASE_SECRET_KEY ?? '').trim();
const email = (process.env.KONJO_ADMIN_EMAIL ?? '').trim().toLowerCase();
const password = process.env.KONJO_ADMIN_PASSWORD ?? '';

function fail(message: string): never {
  console.error(`Admin provisioning failed: ${message}`);
  process.exit(1);
}

if (!projectUrl || !secretKey) fail('set KONJO_SUPABASE_URL and KONJO_SUPABASE_SECRET_KEY.');
if (!/^\S+@\S+\.\S+$/.test(email)) fail('set KONJO_ADMIN_EMAIL to a valid email address.');
if (password.length < 12 || password.startsWith('replace-')) {
  fail('set KONJO_ADMIN_PASSWORD to a unique password of at least 12 characters.');
}

const json = { 'Content-Type': 'application/json' };

const created = await fetch(`${projectUrl}/auth/v1/admin/users`, {
  method: 'POST',
  headers: supabaseServiceHeaders(secretKey, json),
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Konjo Operations' },
  }),
});
if (created.ok) {
  console.log('Created the administrator sign-in account.');
} else if (created.status === 422) {
  console.log('The administrator sign-in account already exists; ensuring the admin role.');
} else {
  fail(`Supabase Auth returned HTTP ${created.status}.`);
}

const promoted = await fetch(
  `${projectUrl}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`,
  {
    method: 'PATCH',
    headers: supabaseServiceHeaders(secretKey, { ...json, Prefer: 'return=representation' }),
    body: JSON.stringify({ account_role: 'admin' }),
  },
);
if (!promoted.ok) fail(`Supabase returned HTTP ${promoted.status} while assigning the admin role.`);
const rows = await promoted.json() as unknown[];
if (!Array.isArray(rows) || rows.length !== 1) {
  fail('no Konjo profile matched that email. Check KONJO_ADMIN_EMAIL.');
}
console.log(`Administrator ready. Sign in at /admin-login with ${email}.`);
