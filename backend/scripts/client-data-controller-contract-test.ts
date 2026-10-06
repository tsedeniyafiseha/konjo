import assert from 'node:assert/strict';

import type {
  ApiBooking,
  ApiClientData,
  ApiNotificationPreferences,
} from '../../shared/api-contracts.ts';
import type { AuthSession } from '../../src/application/auth/session-controller.ts';
import {
  ClientDataController,
  type ClientBookingGateway,
  type ClientDataControllerLogger,
  type ClientDataRuntime,
  type ClientDataScheduler,
  type ClientPreferencesGateway,
} from '../../src/application/client-data/client-data-controller.ts';
import type { NewClientBooking } from '../../src/application/client-data/client-data-contracts.ts';

const apiSession: AuthSession = {
  userId: 'client-1',
  expiresAt: 2_000_000_000_000,
  source: 'api',
  role: 'client',
  authMethod: 'email_password',
  accessToken: 'client-token',
};

const developmentSession: AuthSession = {
  ...apiSession,
  userId: 'development-client',
  source: 'development',
  accessToken: undefined,
};

const apiBooking: ApiBooking = {
  id: 'booking-1',
  clientId: 'client-1',
  professionalId: 'hanan',
  serviceId: 'box-braids',
  serviceName: 'Box braids',
  dateIso: '2026-09-20',
  time: '10:00 AM',
  addressLabel: 'Home',
  addressZone: 'Bole',
  addressDetail: 'Apartment 10',
  femaleOnly: false,
  paymentMethod: 'telebirr',
  servicePrice: 1_800,
  travelFee: 0,
  total: 1_800,
  commissionRateBps: 1_800,
  status: 'accepted',
  cancellationPolicy: null,
  startedAt: null,
  completedAt: null,
  createdAt: '2026-09-18T12:00:00.000Z',
};

const notificationPreferences: ApiNotificationPreferences = {
  bookingUpdates: false,
  promotions: true,
  smsReminders: true,
};

const clientData: ApiClientData = {
  account: null,
  favouriteIds: ['hanan'],
  notificationPreferences,
};

const newBooking: NewClientBooking = {
  receipt: {
    bookingId: 'booking-new',
    paymentStatus: 'pending',
    requestStatus: 'requested',
    createdAt: '2026-09-18T13:00:00.000Z',
    servicePrice: 900,
    travelFee: 150,
    total: 1_050,
  },
  professionalId: 'selam',
  serviceId: 'cornrows',
  serviceName: 'Cornrows',
  dateIso: '2026-09-22',
  dateLabel: 'Sep 22',
  time: '2:30 PM',
  total: 1_050,
  address: 'Office 4',
  paymentMethod: 'telebirr',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function bookingGateway(overrides: Partial<ClientBookingGateway> = {}): ClientBookingGateway {
  return {
    async list() { return [apiBooking]; },
    async cancel() {},
    async archive() {},
    async reschedule() {},
    async initiatePayment(bookingId) {
      return {
        id: 'payment-1', bookingId, provider: 'telebirr', providerReference: 'provider-1',
        status: 'pending', amount: 1800, refundedAmount: 0, currency: 'ETB',
        createdAt: '2026-09-18T12:01:00.000Z', updatedAt: '2026-09-18T12:01:00.000Z',
      };
    },
    async submitReview() {},
    async verifyPayment() { return null; },
    ...overrides,
  };
}

function preferencesGateway(
  overrides: Partial<ClientPreferencesGateway> = {},
): ClientPreferencesGateway {
  return {
    async load() { return clientData; },
    async setFavorite() {},
    async updateNotificationPreferences(_token, preferences) { return preferences; },
    ...overrides,
  };
}

function manualScheduler() {
  const tasks: Array<() => void> = [];
  let cancellations = 0;
  const scheduler: ClientDataScheduler = {
    every(_milliseconds, task) {
      tasks.push(task);
      return () => { cancellations += 1; };
    },
  };
  return { scheduler, tasks, cancellations: () => cancellations };
}

const runtime: ClientDataRuntime = {
  dateLabel: (dateIso) => `label:${dateIso}`,
};

function controller(
  bookings: ClientBookingGateway,
  preferences: ClientPreferencesGateway,
  scheduler: ClientDataScheduler,
  logger?: ClientDataControllerLogger,
) {
  return new ClientDataController(
    bookings,
    preferences,
    scheduler,
    runtime,
    { pollingIntervalMs: 10_000 },
    logger,
  );
}

{
  let gatewayCalls = 0;
  const schedule = manualScheduler();
  const data = controller(
    bookingGateway({ async list() { gatewayCalls += 1; return []; } }),
    preferencesGateway({ async load() { gatewayCalls += 1; return clientData; } }),
    schedule.scheduler,
  );
  await data.setSession(developmentSession);
  assert.equal(gatewayCalls, 0);
  assert.equal(schedule.tasks.length, 0);
  data.addBooking(newBooking);
  assert.equal(data.getSnapshot().bookings[0].id, 'booking-new');
  await data.toggleFavourite('selam');
  assert.equal(data.getSnapshot().favouriteIds.has('selam'), true);
  await data.toggleNotificationPreference('promotions');
  assert.equal(data.getSnapshot().notificationPreferences.promotions, true);
}

{
  const schedule = manualScheduler();
  const data = controller(
    bookingGateway(),
    preferencesGateway(),
    schedule.scheduler,
  );
  await data.setSession(apiSession);
  const restored = data.getSnapshot().bookings[0];
  assert.equal(restored.id, 'booking-1');
  assert.equal(restored.dateLabel, 'label:2026-09-20');
  assert.equal(restored.status, 'accepted');
  assert.equal(data.getSnapshot().favouriteIds.has('hanan'), true);
  assert.deepEqual(data.getSnapshot().notificationPreferences, notificationPreferences);
  assert.equal(schedule.tasks.length, 1);
  data.deactivate();
  assert.equal(schedule.cancellations(), 1);
}

{
  const bookings = deferred<readonly ApiBooking[]>();
  const preferences = deferred<ApiClientData>();
  const schedule = manualScheduler();
  const data = controller(
    bookingGateway({ async list() { return bookings.promise; } }),
    preferencesGateway({ async load() { return preferences.promise; } }),
    schedule.scheduler,
  );
  const restoring = data.setSession(apiSession);
  data.addBooking(newBooking);
  await data.toggleFavourite('selam');
  bookings.resolve([apiBooking]);
  preferences.resolve(clientData);
  await restoring;
  assert.equal(data.getSnapshot().bookings[0].id, 'booking-new');
  assert.equal(data.getSnapshot().favouriteIds.has('selam'), true);
  assert.deepEqual(data.getSnapshot().notificationPreferences, notificationPreferences);
}

{
  const poll = deferred<readonly ApiBooking[]>();
  let listCalls = 0;
  const schedule = manualScheduler();
  const data = controller(
    bookingGateway({
      async list() {
        listCalls += 1;
        return listCalls === 1 ? [apiBooking] : poll.promise;
      },
    }),
    preferencesGateway(),
    schedule.scheduler,
  );
  await data.setSession(apiSession);
  schedule.tasks[0]();
  schedule.tasks[0]();
  assert.equal(listCalls, 2);
  data.updateBookingStatus('booking-1', 'in_progress');
  poll.resolve([{ ...apiBooking, status: 'accepted' }]);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(data.getSnapshot().bookings[0].status, 'in_progress');
}

{
  const calls: string[] = [];
  const favoriteStates: boolean[] = [];
  const schedule = manualScheduler();
  const data = controller(
    bookingGateway({
      async cancel(id) { calls.push(`cancel:${id}`); },
      async reschedule(id, dateIso, time) { calls.push(`reschedule:${id}:${dateIso}:${time}`); },
      async submitReview(id) { calls.push(`review:${id}`); },
      async initiatePayment(id) {
        calls.push(`payment:${id}`);
        return {
          id: 'payment-after-acceptance', bookingId: id, provider: 'telebirr',
          providerReference: 'provider-after-acceptance', status: 'pending', amount: 1800,
          refundedAmount: 0, currency: 'ETB', createdAt: '2026-09-18T12:01:00.000Z',
          updatedAt: '2026-09-18T12:01:00.000Z',
        };
      },
    }),
    preferencesGateway({
      async setFavorite(_token, _professionalId, favorite) { favoriteStates.push(favorite); },
    }),
    schedule.scheduler,
  );
  await data.setSession(apiSession);
  await data.initiatePayment('booking-1');
  assert.equal(data.getSnapshot().bookings[0].paymentIntentId, 'payment-after-acceptance');
  assert.equal(data.getSnapshot().bookings[0].paymentStatus, 'pending');
  await data.cancelBooking('booking-1');
  assert.equal(data.getSnapshot().bookings[0].status, 'cancelled');
  await data.rescheduleBooking('booking-1', '2026-09-24', '4:30 PM');
  assert.equal(data.getSnapshot().bookings[0].dateLabel, 'label:2026-09-24');
  await data.rateBooking('booking-1', {
    techniqueRating: 5,
    professionalismRating: 4,
    tags: ['Professional'],
    reviewText: 'Excellent service',
  });
  assert.equal(data.getSnapshot().bookings[0].rating, 4.5);
  assert.deepEqual(calls, [
    'payment:booking-1',
    'cancel:booking-1',
    'reschedule:booking-1:2026-09-24:4:30 PM',
    'review:booking-1',
  ]);

  await Promise.all([
    data.toggleFavourite('hanan'),
    data.toggleFavourite('hanan'),
  ]);
  assert.deepEqual(favoriteStates, [false, true]);
  assert.equal(data.getSnapshot().favouriteIds.has('hanan'), true);
}

{
  const errors: string[] = [];
  const schedule = manualScheduler();
  const data = controller(
    bookingGateway(),
    preferencesGateway({
      async setFavorite() { throw new Error('network unavailable'); },
      async updateNotificationPreferences() { throw new Error('network unavailable'); },
    }),
    schedule.scheduler,
    { error(message) { errors.push(message); } },
  );
  await data.setSession(apiSession);
  await data.toggleFavourite('hanan');
  await data.toggleNotificationPreference('promotions');
  assert.equal(data.getSnapshot().favouriteIds.has('hanan'), true);
  assert.equal(data.getSnapshot().notificationPreferences.promotions, true);
  assert.equal(errors.length, 2);
}

console.log('Client data controller contracts passed.');
