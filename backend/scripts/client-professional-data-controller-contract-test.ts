import assert from 'node:assert/strict';

import type {
  ApiProfessionalCatalogSettings,
  ApiProfessionalDashboard,
  ApiProfessionalJob,
} from '../../shared/api-contracts.ts';
import type { AuthSession } from '../../src/application/auth/session-controller.ts';
import {
  ProfessionalDataController,
  type ProfessionalDataGateway,
  type ProfessionalDataRuntime,
  type ProfessionalDataScheduler,
  type ProfessionalDataSnapshot,
} from '../../src/application/professional-data/professional-data-controller.ts';
import type { ProfessionalDataApplication } from '../../src/application/professional-data/professional-data-contracts.ts';

const apiSession: AuthSession = {
  userId: 'professional-1',
  expiresAt: 2_000_000_000_000,
  source: 'api',
  role: 'professional',
  authMethod: 'email_password',
  accessToken: 'professional-token',
};

const developmentSession: AuthSession = {
  ...apiSession,
  source: 'development',
  accessToken: undefined,
};

const apiJob: ApiProfessionalJob = {
  id: 'booking-1',
  clientName: 'Meron Gebre',
  serviceName: 'Box braids',
  servicePrice: 1_800,
  travelFee: 150,
  total: 1_950,
  commissionRateBps: 1_800,
  paymentMethod: 'telebirr',
  dateIso: '2026-09-20',
  time: '10:00 AM',
  addressLabel: 'Home',
  addressZone: 'Bole',
  addressDetail: 'Apartment 10',
  status: 'requested',
  startedAt: null,
  completedAt: null,
};

const dashboard: ApiProfessionalDashboard = {
  jobs: [apiJob],
  recentJobs: [],
  available: true,
  completedCount: 4,
  weekEarnings: 8_400,
  rating: 4.5,
  reviewCount: 3,
  travelFeeCap: 500,
};

const catalog: ApiProfessionalCatalogSettings = {
  services: [{
    id: 'box-braids',
    category: 'Braids',
    name: 'Box braids',
    durationMinutes: 180,
    price: 1_800,
    note: 'Hair included',
    popular: true,
  }],
  workingDays: [{ day: 'Monday', hours: '9–6', enabled: true }],
  travelZones: [{ id: 'bole', label: 'Bole', active: true }],
  sameDayBookings: true,
};

const application: ProfessionalDataApplication = {
  id: 'application-1',
  status: 'approved',
  ...catalog,
};

const fallback: ProfessionalDataSnapshot = {
  jobs: [{
    id: 'fallback-job',
    name: 'Fallback Client',
    initials: 'FC',
    service: 'Fallback service',
    description: 'Development job',
    price: 700,
    payment: 'Cash',
    time: 'Today',
    address: 'Bole',
    addressDetail: 'Blue gate',
    travelFee: 0,
    status: 'offer',
  }],
  recentJobs: [],
  dashboardLoaded: true,
  rating: 0,
  reviewCount: 0,
  available: true,
  completedCount: 9,
  weekEarnings: 12_400,
  travelFeeCap: 500,
  sessionStartedAt: null,
  ...catalog,
  toast: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function gateway(overrides: Partial<ProfessionalDataGateway> = {}): ProfessionalDataGateway {
  return {
    async loadDashboard() { return dashboard; },
    async setAvailability(_token, available) { return available; },
    async loadCatalog() { return catalog; },
    async updateCatalog(_token, settings) { return settings; },
    async transitionBooking(_token, _bookingId, action) {
      const statuses: Record<string, ApiProfessionalJob['status']> = {
        accept: 'accepted',
        decline: 'cancelled',
        travel: 'on_the_way',
        'check-in': 'in_progress',
        complete: 'completed',
        'no-show': 'cancelled',
      };
      return { ...dashboard, jobs: [{ ...apiJob, status: statuses[action] }] };
    },
    ...overrides,
  };
}

function manualScheduler() {
  const intervals: Array<() => void> = [];
  const timers: Array<{ task: () => void; cancelled: boolean }> = [];
  let intervalCancellations = 0;
  const scheduler: ProfessionalDataScheduler = {
    every(_milliseconds, task) {
      intervals.push(task);
      return () => { intervalCancellations += 1; };
    },
    after(_milliseconds, task) {
      const timer = { task, cancelled: false };
      timers.push(timer);
      return () => { timer.cancelled = true; };
    },
  };
  return { scheduler, intervals, timers, intervalCancellations: () => intervalCancellations };
}

const runtime: ProfessionalDataRuntime = {
  now: () => 123_456,
  dateLabel: (dateIso) => `label:${dateIso}`,
};

function controller(
  dataGateway: ProfessionalDataGateway,
  scheduler: ProfessionalDataScheduler,
) {
  return new ProfessionalDataController(
    dataGateway,
    scheduler,
    runtime,
    fallback,
    { pollingIntervalMs: 10_000, toastDurationMs: 2_800 },
  );
}

{
  let gatewayCalls = 0;
  const schedule = manualScheduler();
  const data = controller(gateway({
    async loadDashboard() { gatewayCalls += 1; return dashboard; },
    async loadCatalog() { gatewayCalls += 1; return catalog; },
  }), schedule.scheduler);
  await data.activate(developmentSession, application);
  assert.equal(gatewayCalls, 0);
  assert.equal(schedule.intervals.length, 0);
  assert.equal(data.getSnapshot().jobs.length, 0);
  assert.equal(data.getSnapshot().available, false);
  assert.equal(data.getSnapshot().services[0].id, 'box-braids');
}

{
  const schedule = manualScheduler();
  const data = controller(gateway(), schedule.scheduler);
  await data.activate(apiSession, application);
  const restored = data.getSnapshot();
  assert.equal(restored.jobs[0].initials, 'MG');
  assert.equal(restored.jobs[0].time, 'label:2026-09-20 at 10:00 AM');
  assert.equal(restored.jobs[0].scheduledStartAt, Date.parse('2026-09-20T10:00:00+03:00'));
  assert.equal(restored.jobs[0].payment, 'Telebirr');
  assert.equal(restored.completedCount, 4);
  assert.equal(schedule.intervals.length, 1);
  data.deactivate();
  assert.equal(schedule.intervalCancellations(), 1);
}

{
  let transitionCalls = 0;
  const schedule = manualScheduler();
  const data = controller(gateway({
    async loadDashboard() {
      return { ...dashboard, jobs: [{ ...apiJob, status: 'accepted' }] };
    },
    async transitionBooking() {
      transitionCalls += 1;
      return dashboard;
    },
  }), schedule.scheduler);
  await data.activate(apiSession, application);
  await data.startTravel('booking-1');
  assert.equal(transitionCalls, 1, 'an accepted booking can set off at any time, so the controller asks the API');
}

{
  const poll = deferred<ApiProfessionalDashboard>();
  let loads = 0;
  const schedule = manualScheduler();
  const data = controller(gateway({
    async loadDashboard() {
      loads += 1;
      return loads === 1 ? dashboard : poll.promise;
    },
  }), schedule.scheduler);
  await data.activate(apiSession, application);
  schedule.intervals[0]();
  schedule.intervals[0]();
  assert.equal(loads, 2);
  await data.acceptJob();
  assert.equal(data.getSnapshot().jobs[0].status, 'accepted');
  poll.resolve(dashboard);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(data.getSnapshot().jobs[0].status, 'accepted');
}

{
  const schedule = manualScheduler();
  const data = controller(gateway(), schedule.scheduler);
  await data.activate(developmentSession, null);
  await data.acceptJob();
  assert.equal(data.getSnapshot().jobs[0].status, 'accepted');
  await data.startTravel();
  assert.equal(data.getSnapshot().jobs[0].status, 'traveling');
  await data.checkIn();
  assert.equal(data.getSnapshot().sessionStartedAt, 123_456);
  await data.completeJob();
  assert.equal(data.getSnapshot().jobs.length, 0);
  assert.equal(data.getSnapshot().completedCount, 10);
  assert.equal(data.getSnapshot().weekEarnings, 13_100);
  assert.match(data.getSnapshot().toast ?? '', /final payment requested/);
}

{
  const firstSave = deferred<ApiProfessionalCatalogSettings>();
  const updates: ApiProfessionalCatalogSettings[] = [];
  const schedule = manualScheduler();
  const data = controller(gateway({
    async updateCatalog(_token, settings) {
      updates.push(settings);
      return updates.length === 1 ? firstSave.promise : settings;
    },
  }), schedule.scheduler);
  await data.activate(apiSession, application);
  const first = data.toggleWorkingDay('Monday');
  const second = data.toggleWorkingDay('Monday');
  assert.equal(data.getSnapshot().workingDays[0].enabled, true);
  await Promise.resolve();
  assert.equal(updates.length, 1);
  firstSave.resolve(updates[0]);
  await Promise.all([first, second]);
  assert.equal(updates.length, 2);
  assert.equal(data.getSnapshot().workingDays[0].enabled, true);
}

{
  const schedule = manualScheduler();
  const data = controller(gateway(), schedule.scheduler);
  await data.activate(developmentSession, null);
  data.showToast('First');
  data.showToast('Second');
  assert.equal(schedule.timers[0].cancelled, true);
  schedule.timers[0].task();
  assert.equal(data.getSnapshot().toast, 'Second');
  data.showToast('Latest');
  schedule.timers[2].task();
  assert.equal(data.getSnapshot().toast, null);
}

console.log('Client professional-data controller contract tests passed.');
