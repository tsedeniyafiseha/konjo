import assert from 'node:assert/strict';

import type { ApiUser } from '../../shared/api-contracts.ts';
import {
  AccessTokenAuthenticationUnavailableError,
  AccessTokenAuthenticator,
} from '../src/application/authenticate-access-token.ts';
import { SupabaseAccessTokenResolver } from '../src/adapters/supabase-access-token-resolver.ts';

const client: ApiUser = {
  id: 'client-1',
  role: 'client',
  email: 'client@example.com',
  fullName: 'Client One',
  phoneNumber: null,
  createdAt: '2026-09-18T12:00:00.000Z',
};

{
  let externalCalls = 0;
  let projections = 0;
  const authenticator = new AccessTokenAuthenticator(
    { resolve: () => client },
    { async resolve() { externalCalls += 1; return null; } },
    { synchronize(user) { projections += 1; return user; } },
  );
  assert.equal(await authenticator.authenticate('local-token'), client);
  assert.equal(externalCalls, 0);
  assert.equal(projections, 0);
}

{
  let projected: ApiUser | null = null;
  const authenticator = new AccessTokenAuthenticator(
    { resolve: () => null },
    { async resolve(token) { return token === 'external-token' ? client : null; } },
    { synchronize(user) { projected = user; return user; } },
  );
  assert.equal(await authenticator.authenticate('external-token'), client);
  assert.equal(projected, client);
  assert.equal(await authenticator.authenticate('invalid-token'), null);
}

{
  // Verified external tokens are cached briefly, shared between concurrent
  // requests, and honoured for a bounded time while the provider is down.
  let now = 1_000_000;
  let externalCalls = 0;
  let failing = false;
  const authenticator = new AccessTokenAuthenticator(
    { resolve: () => null },
    { async resolve(token) {
      externalCalls += 1;
      if (failing) throw new AccessTokenAuthenticationUnavailableError('Supabase timed out.');
      return token === 'external-token' ? client : null;
    } },
    { synchronize(user) { return user; } },
    { cacheTtlMs: 60_000, staleTtlMs: 600_000, now: () => now },
  );
  const [first, second] = await Promise.all([authenticator.authenticate('external-token'), authenticator.authenticate('external-token')]);
  assert.equal(first, client);
  assert.equal(second, client);
  assert.equal(externalCalls, 1, 'concurrent requests share one verification');
  now += 30_000;
  assert.equal(await authenticator.authenticate('external-token'), client);
  assert.equal(externalCalls, 1, 'a fresh verification is reused');
  now += 60_000;
  failing = true;
  assert.equal(await authenticator.authenticate('external-token'), client, 'a stale verification carries the API through an outage');
  assert.equal(externalCalls, 2);
  now += 600_000;
  await assert.rejects(authenticator.authenticate('external-token'), AccessTokenAuthenticationUnavailableError, 'but not forever');
  failing = false;
  assert.equal(await authenticator.authenticate('invalid-token'), null);
  assert.equal(await authenticator.authenticate('invalid-token'), null, 'invalid tokens are never cached as valid');
}

{
  const calls: Array<{ url: string; authorization: string | null }> = [];
  const responses = [
    new Response(JSON.stringify({
      id: 'professional-1',
      email: 'pro@example.com',
      phone: '+251911111111',
    }), { status: 200 }),
    new Response(JSON.stringify([{
      user_id: 'professional-1',
      account_role: 'professional',
      full_name: 'Hanan A.',
      email: 'pro@example.com',
      phone_number: '+251911111111',
      created_at: '2026-09-18T12:00:00.000Z',
    }]), { status: 200 }),
  ];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), authorization: headers.get('Authorization') });
    const response = responses.shift();
    if (!response) throw new Error('Unexpected request.');
    return response;
  }) as typeof fetch;
  const resolver = new SupabaseAccessTokenResolver(
    'https://project.supabase.co/',
    'publishable-key',
    fetcher,
  );
  const user = await resolver.resolve('supabase-jwt');
  assert.equal(user?.id, 'professional-1');
  assert.equal(user?.role, 'professional');
  assert.equal(user?.fullName, 'Hanan A.');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].authorization, 'Bearer supabase-jwt');
  assert.match(calls[1].url, /rest\/v1\/profiles/);
}

{
  const resolver = new SupabaseAccessTokenResolver(
    'https://project.supabase.co',
    'publishable-key',
    (async () => new Response('{}', { status: 401 })) as typeof fetch,
  );
  assert.equal(await resolver.resolve('invalid'), null);
}

{
  const resolver = new SupabaseAccessTokenResolver(
    'https://project.supabase.co',
    'publishable-key',
    (async () => new Response('{}', { status: 503 })) as typeof fetch,
  );
  await assert.rejects(
    resolver.resolve('token'),
    AccessTokenAuthenticationUnavailableError,
  );
}

console.log('Access-token authentication contracts passed.');
