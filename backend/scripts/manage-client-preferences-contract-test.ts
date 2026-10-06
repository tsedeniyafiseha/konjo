import assert from 'node:assert/strict';
import { ManageClientPreferences } from '../src/application/manage-client-preferences.ts';
import type { ClientPreferenceCommandStore, Clock, IdGenerator } from '../src/application/ports.ts';

const now = new Date('2026-09-18T23:00:00.000Z');
const calls: unknown[] = [];
const preferences = { bookingUpdates: true, promotions: false, chatMessages: true, smsReminders: true };
const store: ClientPreferenceCommandStore = {
  setFavorite(input) { calls.push(input); return 'updated'; },
  updateNotificationPreferences(input) { calls.push(input); return input.preferences; },
  registerDevice(input) { calls.push(input); return { id: input.registrationId, platform: input.platform, tokenPreview: '…123456', createdAt: input.occurredAt }; },
  unregisterDevice(input) { calls.push(input); return true; },
};
const ids: IdGenerator = { next: () => 'device-1' };
const clock: Clock = { now: () => now };
const manager = new ManageClientPreferences(store, ids, clock);
assert.equal(await manager.setFavorite('client-1', 'professional-1', true), 'updated');
assert.deepEqual(await manager.updateNotifications('client-1', preferences), preferences);
assert.equal((await manager.registerDevice('client-1', 'android', 'push-token-123456')).id, 'device-1');
assert.equal(await manager.unregisterDevice('client-1', 'device-1'), true);
assert.equal(calls.length, 4);
assert.ok(calls.every((call) => (call as { occurredAt: string }).occurredAt === now.toISOString()));
console.log('Client preference application contract passed.');
