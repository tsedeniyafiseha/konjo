import assert from 'node:assert/strict';

import { SupabaseAccountAssetCleaner } from '../src/adapters/supabase-account-asset-cleaner.ts';
import { AccountAssetDeletionProjector } from '../src/application/account-asset-deletion-projector.ts';
import type { AccountAssetCleaner } from '../src/application/ports.ts';
import { KonjoDatabase } from '../src/database.ts';
import { domainEventTypes, type AccountDeletedEvent } from '../src/domain/events.ts';

const userId = '97000000-0000-4000-8000-000000000099';
const occurredAt = '2026-09-18T23:00:00.000Z';

const database = new KonjoDatabase(':memory:');
try {
  database.accountAuthenticationStore.createClient({
    userId,
    email: 'delete-contract@konjo.local',
    fullName: 'Deletion Contract',
    passwordHash: 'test-only-hash',
    createdAt: occurredAt,
  });
  assert.equal(database.clientAccountCommandStore.deleteAccount({
    userId,
    role: 'client',
    occurredAt,
  }), true);
  const events = await database.domainEventStore.claimDomainEvents({
    workerId: 'deletion-worker',
    now: occurredAt,
    lockedUntil: '2026-09-18T23:00:30.000Z',
    limit: 10,
  });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    eventId: events[0].eventId,
    eventType: domainEventTypes.accountDeleted,
    schemaVersion: 1,
    aggregateType: 'account',
    aggregateId: userId,
    aggregateVersion: 1,
    occurredAt,
    correlationId: `account:${userId}:deletion`,
    causationId: null,
    payload: { userId, role: 'client' },
    attempt: 1,
  });
} finally {
  database.close();
}

const projected: Array<{ userId: string; role: string }> = [];
const assets: AccountAssetCleaner = {
  async deletePrivateAssets(projectedUserId, role) {
    projected.push({ userId: projectedUserId, role });
  },
};
const projector = new AccountAssetDeletionProjector(assets);
const accountEvent: AccountDeletedEvent = {
  eventId: 'event-1',
  eventType: domainEventTypes.accountDeleted,
  schemaVersion: 1,
  aggregateType: 'account',
  aggregateId: userId,
  aggregateVersion: 1,
  occurredAt,
  correlationId: `account:${userId}:deletion`,
  causationId: null,
  payload: { userId, role: 'professional' },
  attempt: 1,
};
await projector.handle(accountEvent);
assert.deepEqual(projected, [{ userId, role: 'professional' }]);
await assert.rejects(
  projector.handle({ ...accountEvent, aggregateId: 'different-user' }),
  /invalid payload/,
);

const requests: Array<{
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}> = [];
const storageFetch: typeof fetch = async (input, init = {}) => {
  const call = {
    url: String(input),
    method: init.method ?? 'GET',
    headers: init.headers as Record<string, string>,
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
  };
  requests.push(call);
  if (call.method === 'DELETE') return Response.json([]);
  const prefix = String(call.body.prefix);
  if (prefix.endsWith('/government_id')) {
    return Response.json([{ id: 'object-1', name: 'identity.jpg' }]);
  }
  if (prefix.endsWith('/portfolio')) {
    return Response.json([{ id: 'object-2', name: 'work.webp' }]);
  }
  return Response.json([]);
};
const cleaner = new SupabaseAccountAssetCleaner(
  'https://project.supabase.co/',
  'sb_secret_server_only',
  storageFetch,
);
await cleaner.deletePrivateAssets(userId, 'client');
assert.equal(requests.length, 3, 'Client identity storage must be inspected for deletion.');
assert.deepEqual(requests.map((call) => call.body.prefix), [
  `${userId}/national_id_front`,
  `${userId}/national_id_back`,
  `${userId}/passport`,
]);
await cleaner.deletePrivateAssets(userId, 'professional');
assert.equal(requests.length, 10);
assert.deepEqual(requests.slice(3, 9).map((call) => call.body.prefix), [
  `${userId}/government_id`,
  `${userId}/national_id_front`,
  `${userId}/national_id_back`,
  `${userId}/selfie`,
  `${userId}/portfolio`,
  `${userId}/certificate`,
]);
assert.deepEqual(requests[9].body, {
  prefixes: [
    `${userId}/government_id/identity.jpg`,
    `${userId}/portfolio/work.webp`,
  ],
});
for (const call of requests) {
  assert.equal(call.headers.apikey, 'sb_secret_server_only');
  assert.equal(call.headers.Authorization, 'Bearer sb_secret_server_only');
}

const rejectedCleaner = new SupabaseAccountAssetCleaner(
  'https://project.supabase.co',
  'sb_secret_server_only',
  async () => Response.json({ error: 'unavailable' }, { status: 503 }),
);
await assert.rejects(
  rejectedCleaner.deletePrivateAssets(userId, 'professional'),
  /rejected private-asset cleanup/,
);
await assert.rejects(
  cleaner.deletePrivateAssets('../invalid', 'professional'),
  /asset prefix is invalid/,
);

console.log('Retention-aware account deletion contracts passed.');
