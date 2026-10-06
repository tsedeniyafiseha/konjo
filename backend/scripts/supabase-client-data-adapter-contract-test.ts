import assert from 'node:assert/strict';

import { SupabaseClientDataRepository } from '../src/adapters/supabase-client-data-repository.ts';

const clientId = '97000000-0000-4000-8000-000000000002';
const professionalId = '97000000-0000-4000-8000-000000000001';
const occurredAt = '2026-09-19T00:00:00.000Z';
const preferences = { bookingUpdates: true, promotions: true, chatMessages: false, smsReminders: true };
const clientData = { account: null, favouriteIds: [], notificationPreferences: preferences };
const address = { id: 'address-1', label: 'Home', zone: 'Bole', detail: 'Apartment 10', fee: 120, isDefault: true, createdAt: occurredAt };
const calls: Array<{ name: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
const results: unknown[] = [
  clientData,
  { id: clientId },
  { result: 'completed', account: {} },
  { result: 'updated', address },
  { result: 'updated', address },
  true,
  true,
  'updated',
  preferences,
  { id: 'device-1', platform: 'android', tokenPreview: '…123456', createdAt: occurredAt },
  true,
  { balanced: true, groups: [] },
  [],
  true,
];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (request, init = {}) => {
  calls.push({
    name: String(request).split('/rpc/')[1],
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
    headers: init.headers as Record<string, string>,
  });
  return Response.json(results.shift());
};

try {
  const repository = new SupabaseClientDataRepository('https://project.supabase.co/', 'sb_secret_server_only');
  assert.deepEqual(await repository.getClientData(clientId), clientData);
  await repository.updateProfile({ userId: clientId, fullName: 'Client', phoneNumber: null, preferredLanguage: 'am', occurredAt });
  await repository.completeOnboarding({ userId: clientId, fullName: 'Client', phoneNumber: null, preferredLanguage: 'am', occurredAt });
  await repository.createAddress({ addressId: 'address-1', userId: clientId, label: 'Home', zone: 'Bole', detail: 'Apartment 10', makeDefault: true, occurredAt });
  await repository.updateAddress({ addressId: 'address-1', userId: clientId, label: 'Home', zone: 'Bole', detail: 'Apartment 11', occurredAt });
  assert.equal(await repository.deleteAddress({ userId: clientId, addressId: 'address-1', occurredAt }), true);
  assert.equal(await repository.setDefaultAddress({ userId: clientId, addressId: 'address-1', occurredAt }), true);
  assert.equal(await repository.setFavorite({ userId: clientId, professionalId, favorite: true, occurredAt }), 'updated');
  assert.deepEqual(await repository.updateNotificationPreferences({ userId: clientId, preferences, occurredAt }), preferences);
  await repository.registerDevice({ registrationId: 'device-1', userId: clientId, platform: 'android', token: 'push-token-123456', occurredAt });
  assert.equal(await repository.unregisterDevice({ userId: clientId, registrationId: 'device-1', occurredAt }), true);
  assert.deepEqual(await repository.auditPaymentLedger(clientId, 'payment-1'), { balanced: true, groups: [] });
  assert.deepEqual(await repository.listNotifications(clientId), []);
  assert.equal(await repository.deleteAccount({ userId: clientId, role: 'client', occurredAt }), true);

  assert.deepEqual(calls.map((call) => call.name), [
    'get_client_data', 'update_client_profile', 'complete_client_onboarding',
    'create_client_address', 'update_client_address', 'delete_client_address',
    'set_default_client_address', 'set_client_favorite',
    'update_client_notification_preferences', 'register_client_device',
    'unregister_client_device', 'audit_client_payment_ledger',
    'list_client_notifications', 'delete_konjo_account',
  ]);
  for (const call of calls) {
    assert.equal(call.headers.apikey, 'sb_secret_server_only');
    assert.equal(call.headers.Authorization, undefined);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Supabase client-data adapter contract passed.');
