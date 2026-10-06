import assert from 'node:assert/strict';

import { SupabaseEventWorkerRepository } from '../src/adapters/supabase-event-worker-repository.ts';
import type { NotificationDeliveryJob } from '../src/application/contracts.ts';

const occurredAt = '2026-09-19T00:00:00.000Z';
const job: NotificationDeliveryJob = {
  id: '98000000-0000-4000-8000-000000000001',
  channel: 'push',
  template: 'booking_requested',
  payload: { bookingId: 'booking-1' },
  destination: 'ExpoPushToken[test]',
  attempt: 1,
};
const calls: Array<{ name: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
const results: unknown[] = [
  true,
  [{
    eventId: '97000000-0000-4000-8000-000000000001', eventType: 'BookingRequested',
    schemaVersion: 1, aggregateType: 'booking', aggregateId: 'booking-1',
    aggregateVersion: 1, occurredAt, correlationId: 'request-1', causationId: null,
    payload: {}, attempt: 1,
  }],
  true,
  true,
  [],
  'replayed',
  [{ bookingId: 'booking-1', professionalId: 'professional-2' }],
  2,
  [job],
  null,
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
  const repository = new SupabaseEventWorkerRepository('https://project.supabase.co/', 'sb_secret_server_only');
  assert.equal(await repository.enqueueNotification(
    '96000000-0000-4000-8000-000000000001', 'booking:booking-1:client:requested',
    'push', 'booking_requested', { bookingId: 'booking-1' }, occurredAt,
  ), true);
  assert.equal((await repository.claimDomainEvents({
    workerId: 'worker-1', now: occurredAt, lockedUntil: '2026-09-19T00:00:30.000Z', limit: 50,
  })).length, 1);
  assert.equal(await repository.markDomainEventProcessed(
    '97000000-0000-4000-8000-000000000001', 'worker-1', occurredAt,
  ), true);
  assert.equal(await repository.recordDomainEventFailure({
    eventId: '97000000-0000-4000-8000-000000000001', workerId: 'worker-1',
    failedAt: occurredAt, availableAt: '2026-09-19T00:00:01.000Z',
    errorMessage: 'temporary failure', terminal: false,
  }), true);
  assert.deepEqual(await repository.listFailedDomainEvents(50), []);
  assert.equal(await repository.replayFailedDomainEvent(
    '97000000-0000-4000-8000-000000000001',
    '95000000-0000-4000-8000-000000000001', occurredAt,
  ), 'replayed');
  assert.equal((await repository.reassignOverdueBookings(new Date(occurredAt))).length, 1);
  assert.equal(await repository.enqueueDueBookingReminders(new Date(occurredAt)), 2);
  assert.deepEqual(await repository.listDueNotificationJobs(occurredAt), [job]);
  await repository.recordNotificationDelivery(job, { delivered: true, providerReference: 'push-1' }, new Date(occurredAt));

  assert.deepEqual(calls.map((call) => call.name), [
    'enqueue_notification', 'claim_domain_events', 'mark_domain_event_processed',
    'record_domain_event_failure', 'list_failed_domain_events', 'replay_failed_domain_event',
    'reassign_overdue_bookings', 'enqueue_due_booking_reminders',
    'claim_due_notification_jobs', 'record_notification_delivery',
  ]);
  for (const call of calls) {
    assert.equal(call.headers.apikey, 'sb_secret_server_only');
    assert.equal(call.headers.Authorization, undefined);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Supabase event-worker adapter contract passed.');
