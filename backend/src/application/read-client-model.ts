import type { ClientBookingReadStore, ClientDataReadStore, ClientIdentityReadStore, ClientReadStore } from './ports.ts';

export class ReadClientModel {
  private readonly identityStore: ClientIdentityReadStore;
  private readonly bookingStore: ClientBookingReadStore;
  private readonly dataStore: ClientDataReadStore;

  constructor(
    store: ClientReadStore,
    identityStore: ClientIdentityReadStore = store,
    bookingStore: ClientBookingReadStore = store,
    dataStore: ClientDataReadStore = store,
  ) {
    this.identityStore = identityStore;
    this.bookingStore = bookingStore;
    this.dataStore = dataStore;
  }

  getAccount(userId: string) {
    return this.dataStore.getClientData(userId);
  }

  getIdentity(userId: string) {
    return this.identityStore.getIdentityStatus(userId);
  }

  listBookings(userId: string) {
    return this.bookingStore.listBookings(userId);
  }

  getRewards(userId: string) {
    return this.bookingStore.getRewards(userId);
  }

  getPaymentIntent(userId: string, paymentIntentId: string) {
    return this.bookingStore.getPaymentIntent(userId, paymentIntentId);
  }

  auditPaymentLedger(userId: string, paymentIntentId: string) {
    return this.dataStore.auditPaymentLedger(userId, paymentIntentId);
  }

  listNotifications(userId: string) {
    return this.dataStore.listNotifications(userId);
  }
}
