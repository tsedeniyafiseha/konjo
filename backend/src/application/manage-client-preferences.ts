import type { ApiDevicePlatform, ApiDeviceRegistration, ApiNotificationPreferences } from '../../../shared/api-contracts.ts';
import type { ClientPreferenceCommandStore, Clock, IdGenerator } from './ports.ts';

export class ManageClientPreferences {
  private readonly store: ClientPreferenceCommandStore;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;
  constructor(store: ClientPreferenceCommandStore, ids: IdGenerator, clock: Clock) { this.store = store; this.ids = ids; this.clock = clock; }

  setFavorite(userId: string, professionalId: string, favorite: boolean) {
    return Promise.resolve(this.store.setFavorite({ userId, professionalId, favorite, occurredAt: this.clock.now().toISOString() }));
  }
  updateNotifications(userId: string, preferences: ApiNotificationPreferences) {
    return Promise.resolve(this.store.updateNotificationPreferences({ userId, preferences, occurredAt: this.clock.now().toISOString() }));
  }
  registerDevice(userId: string, platform: ApiDevicePlatform, token: string): Promise<ApiDeviceRegistration> {
    return Promise.resolve(this.store.registerDevice({ registrationId: this.ids.next(), userId, platform, token, occurredAt: this.clock.now().toISOString() }));
  }
  unregisterDevice(userId: string, registrationId: string): Promise<boolean> {
    return Promise.resolve(this.store.unregisterDevice({ userId, registrationId, occurredAt: this.clock.now().toISOString() }));
  }
}
