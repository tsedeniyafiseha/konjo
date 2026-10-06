import assert from 'node:assert/strict';

import {
  MockProfessionalRegistrationError,
  SupabaseProfessionalMockAuth,
} from '../src/adapters/supabase-professional-mock-auth.ts';

const requests: Array<{ url: string; init?: RequestInit }> = [];
const responses = [
  new Response(JSON.stringify({ id: 'professional-1' }), { status: 201 }),
  new Response(null, { status: 204 }),
  new Response(JSON.stringify({ access_token: 'access-token', refresh_token: 'refresh-token' }), { status: 200 }),
];
const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
  requests.push({ url: String(input), init });
  const response = responses.shift();
  if (!response) throw new Error('Unexpected request.');
  return response;
};
const auth = new SupabaseProfessionalMockAuth(
  'https://project.supabase.co',
  'service-secret',
  'publishable-key',
  fetcher,
);
assert.deepEqual(await auth.register('+251912345678'), {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
});
assert.equal(requests.length, 3);
assert.match(requests[0].url, /\/auth\/v1\/admin\/users$/);
assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
  phone: '+251912345678',
  password: JSON.parse(String(requests[0].init?.body)).password,
  phone_confirm: true,
  user_metadata: { role: 'professional', full_name: '' },
});
assert.match(requests[1].url, /\/rest\/v1\/profiles\?user_id=eq\.professional-1$/);
assert.match(requests[2].url, /\/auth\/v1\/token\?grant_type=password$/);
assert.equal(
  JSON.parse(String(requests[2].init?.body)).password,
  JSON.parse(String(requests[0].init?.body)).password,
  'The one-use password must only bridge account creation to session issuance.',
);

const duplicate = new SupabaseProfessionalMockAuth(
  'https://project.supabase.co',
  'service-secret',
  'publishable-key',
  async () => new Response(null, { status: 422 }),
);
await assert.rejects(
  duplicate.register('+251912345678'),
  (error: unknown) => error instanceof MockProfessionalRegistrationError && error.failure === 'phone_in_use',
);

const cleanupRequests: string[] = [];
const failingResponses = [
  new Response(JSON.stringify({ id: 'professional-2' }), { status: 201 }),
  new Response(null, { status: 204 }),
  new Response(null, { status: 503 }),
  new Response(null, { status: 204 }),
];
const failing = new SupabaseProfessionalMockAuth(
  'https://project.supabase.co',
  'service-secret',
  'publishable-key',
  async (input) => {
    cleanupRequests.push(String(input));
    return failingResponses.shift()!;
  },
);
await assert.rejects(failing.register('+251922345678'), MockProfessionalRegistrationError);
assert.match(cleanupRequests.at(-1) ?? '', /\/auth\/v1\/admin\/users\/professional-2$/);

console.log('Supabase professional mock authentication contracts passed.');

