import assert from 'node:assert/strict';

import { ReadClientModel } from '../src/application/read-client-model.ts';
import type { ClientReadStore } from '../src/application/ports.ts';

const calls: Array<{ operation: string; userId: string; resourceId?: string }> = [];
const clientData = {
  account: null,
  favouriteIds: ['professional-1'],
  notificationPreferences: {
    bookingUpdates: true,
    promotions: false,
    chatMessages: true,
    smsReminders: true,
  },
};
const identity = { verified: true, faydaLastFour: '1234', verifiedAt: '2026-09-18T23:00:00.000Z' };
const bookings = [{
  id: 'booking-1',
  clientId: 'client-1',
  professionalId: 'professional-1',
  serviceId: 'service-1',
  serviceName: 'Service',
  dateIso: '2026-09-20',
  time: '10:00',
  addressLabel: 'Home',
  addressZone: 'Bole',
  addressDetail: 'Example address',
  femaleOnly: false,
  paymentMethod: 'card' as const,
  servicePrice: 1000,
  travelFee: 0,
  total: 1000,
  commissionRateBps: 1800,
  status: 'accepted' as const,
  cancellationPolicy: null,
  startedAt: null,
  completedAt: null,
  createdAt: '2026-09-18T23:00:00.000Z',
}];
const paymentIntent = {
  id: 'payment-1',
  bookingId: 'booking-1',
  provider: 'card' as const,
  providerReference: 'provider-1',
  status: 'authorized' as const,
  amount: 1000,
  refundedAmount: 0,
  currency: 'ETB' as const,
  createdAt: '2026-09-18T23:00:00.000Z',
  updatedAt: '2026-09-18T23:00:00.000Z',
};
const ledgerAudit = {
  balanced: true,
  groups: [{ entryGroup: 'authorization', total: 0, entries: 2 }],
};
const notifications = [{
  id: 'notification-1',
  channel: 'push' as const,
  template: 'booking.accepted',
  status: 'delivered' as const,
  attempts: 1,
  createdAt: '2026-09-18T23:00:00.000Z',
}];

const rewards = {
  discountRateBps: 2000,
  everyBookings: 10,
  completedBookings: 3,
  bookingsUntilNextCoupon: 7,
  availableCoupons: 0,
  offer: null,
};

const store: ClientReadStore = {
  getClientData(userId) {
    calls.push({ operation: 'account', userId });
    return clientData;
  },
  getIdentityStatus(userId) {
    calls.push({ operation: 'identity', userId });
    return identity;
  },
  listBookings(userId) {
    calls.push({ operation: 'bookings', userId });
    return bookings;
  },
  getRewards(userId) {
    calls.push({ operation: 'rewards', userId });
    return rewards;
  },
  getPaymentIntent(userId, paymentIntentId) {
    calls.push({ operation: 'payment', userId, resourceId: paymentIntentId });
    return paymentIntent;
  },
  auditPaymentLedger(userId, paymentIntentId) {
    calls.push({ operation: 'ledger', userId, resourceId: paymentIntentId });
    return ledgerAudit;
  },
  listNotifications(userId) {
    calls.push({ operation: 'notifications', userId });
    return notifications;
  },
};

const reads = new ReadClientModel(store);
assert.deepEqual(reads.getAccount('client-1'), clientData);
assert.deepEqual(reads.getIdentity('client-1'), identity);
assert.deepEqual(reads.listBookings('client-1'), bookings);
assert.deepEqual(reads.getRewards('client-1'), rewards);
assert.deepEqual(reads.getPaymentIntent('client-1', 'payment-1'), paymentIntent);
assert.deepEqual(reads.auditPaymentLedger('client-1', 'payment-1'), ledgerAudit);
assert.deepEqual(reads.listNotifications('client-1'), notifications);
assert.deepEqual(calls, [
  { operation: 'account', userId: 'client-1' },
  { operation: 'identity', userId: 'client-1' },
  { operation: 'bookings', userId: 'client-1' },
  { operation: 'rewards', userId: 'client-1' },
  { operation: 'payment', userId: 'client-1', resourceId: 'payment-1' },
  { operation: 'ledger', userId: 'client-1', resourceId: 'payment-1' },
  { operation: 'notifications', userId: 'client-1' },
]);

console.log('Client read model application contract passed.');
