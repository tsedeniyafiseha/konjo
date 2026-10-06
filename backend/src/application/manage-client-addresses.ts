import type { ClientAddressCommandResult } from './contracts.ts';
import type { ClientAddressCommandStore, Clock, IdGenerator } from './ports.ts';

export class ManageClientAddresses {
  private readonly store: ClientAddressCommandStore;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;

  constructor(
    store: ClientAddressCommandStore,
    ids: IdGenerator,
    clock: Clock,
  ) {
    this.store = store;
    this.ids = ids;
    this.clock = clock;
  }

  create(userId: string, input: { label: string; zone: string; detail: string; makeDefault: boolean; latitude?: number | null; longitude?: number | null }): Promise<ClientAddressCommandResult> {
    return Promise.resolve(this.store.createAddress({ addressId: this.ids.next(), userId, ...input, occurredAt: this.clock.now().toISOString() }));
  }

  update(userId: string, addressId: string, input: { label: string; zone: string; detail: string; latitude?: number | null; longitude?: number | null }): Promise<ClientAddressCommandResult> {
    return Promise.resolve(this.store.updateAddress({ addressId, userId, ...input, occurredAt: this.clock.now().toISOString() }));
  }

  delete(userId: string, addressId: string): Promise<boolean> {
    return Promise.resolve(this.store.deleteAddress({ userId, addressId, occurredAt: this.clock.now().toISOString() }));
  }

  setDefault(userId: string, addressId: string): Promise<boolean> {
    return Promise.resolve(this.store.setDefaultAddress({ userId, addressId, occurredAt: this.clock.now().toISOString() }));
  }
}
