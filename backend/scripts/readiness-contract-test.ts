import assert from 'node:assert/strict';

import { SupabaseReadinessProbe } from '../src/adapters/supabase-readiness-probe.ts';
import { CheckReadiness } from '../src/application/check-readiness.ts';

let checks = 0;
assert.equal(await new CheckReadiness({
  check: () => { checks += 1; },
}).execute(), true);
assert.equal(checks, 1);

assert.equal(await new CheckReadiness({
  check: () => { throw new Error('offline'); },
}).execute(), false);

const calls: Array<{ url: string; init?: RequestInit }> = [];
const probe = new SupabaseReadinessProbe(
  'https://project.supabase.co/',
  'server-secret',
  async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response('[]', { status: 200 });
  },
);
await probe.check();
assert.equal(calls.length, 1);
assert.equal(
  calls[0].url,
  'https://project.supabase.co/rest/v1/platform_settings?select=key&limit=1',
);
assert.equal(new Headers(calls[0].init?.headers).get('apikey'), 'server-secret');
assert.equal(new Headers(calls[0].init?.headers).get('authorization'), null, 'Opaque secret keys must not be used as bearer JWTs.');
await new SupabaseReadinessProbe('https://project.supabase.co', 'eyJ.legacy.service-role', async (_input, init) => {
  assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer eyJ.legacy.service-role');
  return new Response('[]', { status: 200 });
}).check();

await assert.rejects(
  () => new SupabaseReadinessProbe(
    'https://project.supabase.co',
    'server-secret',
    async () => new Response('{}', { status: 503 }),
  ).check(),
  /rejected the readiness check/,
);
await assert.rejects(
  () => new SupabaseReadinessProbe(
    'https://project.supabase.co',
    'server-secret',
    async () => { throw new Error('network unavailable'); },
  ).check(),
  /persistence provider is unavailable/,
);

console.log('Persistence readiness contracts passed.');
