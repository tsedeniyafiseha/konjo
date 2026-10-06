import assert from 'node:assert/strict';

import type { ApiProfessionalCatalogSettings } from '../../shared/api-contracts.ts';
import { SupabaseProfessionalOperationsRepository } from '../src/adapters/supabase-professional-operations-repository.ts';

const professionalId = '95000000-0000-4000-8000-000000000001';
const bookingId = '95000000-0000-4000-8000-000000000020';
const occurredAt = '2026-09-19T00:00:00.000Z';
const settings: ApiProfessionalCatalogSettings = {
  services: [{
    id: 'service-1', category: 'Hair styling', name: 'Silk press',
    durationMinutes: 60, price: 1200, note: '', popular: true,
  }],
  workingDays: [{ day: 'Monday', hours: '9:00 AM – 6:00 PM', enabled: true }],
  travelZones: [{ id: 'bole', label: 'Bole', active: true }],
  sameDayBookings: true,
};
const dashboard = { jobs: [], recentJobs: [], available: true, completedCount: 1, weekEarnings: 1104, rating: 4.5, reviewCount: 2, travelFeeCap: 500 };
const calls: Array<{ name: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
const results: unknown[] = [dashboard, settings, [], { result: 'updated', settings }, true, 'updated', 'invalid_travel_fee', 'updated'];
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
  const repository = new SupabaseProfessionalOperationsRepository(
    'https://project.supabase.co/',
    'sb_secret_server_only',
  );
  assert.deepEqual(await repository.getDashboard(professionalId, occurredAt), dashboard);
  assert.deepEqual(await repository.getCatalogSettings(professionalId), settings);
  assert.deepEqual(await repository.listPayouts(professionalId), []);
  assert.deepEqual(await repository.updateCatalog({ professionalId, settings, occurredAt }), {
    result: 'updated', settings,
  });
  assert.equal(await repository.setAvailability({ professionalId, available: true, occurredAt }), true);
  assert.equal(await repository.transitionBooking({
    professionalId, bookingId, action: 'complete', occurredAt,
  }), 'updated');
  assert.equal(await repository.transitionBooking({
    professionalId, bookingId, action: 'accept', travelFee: 250, occurredAt,
  }), 'invalid_travel_fee');
  assert.equal(await repository.transitionBooking({
    professionalId, bookingId, action: 'decline', occurredAt,
  }), 'updated');

  assert.deepEqual(calls.map((call) => call.name), [
    'get_professional_dashboard',
    'get_professional_catalog_settings',
    'list_professional_payouts',
    'update_professional_catalog',
    'set_professional_availability',
    'transition_professional_booking',
    'transition_professional_booking',
    'decline_professional_booking_request',
  ]);
  assert.equal(calls[5].body.p_travel_fee, undefined, 'non-accept transitions must not send a travel fee');
  assert.deepEqual(calls[6].body, {
    p_professional_id: professionalId,
    p_booking_id: bookingId,
    p_action: 'accept',
    p_occurred_at: occurredAt,
    p_travel_fee: 250,
  });
  assert.deepEqual(calls[3].body, {
    p_professional_id: professionalId,
    p_settings: {
      ...settings,
      services: [{ ...settings.services[0], category: 'hair' }],
      workingDays: [{
        ...settings.workingDays[0], weekday: 1,
        startsAt: '09:00:00', endsAt: '18:00:00',
      }],
    },
    p_occurred_at: occurredAt,
  });
  assert.deepEqual(calls[7].body, {
    p_professional_id: professionalId,
    p_booking_id: bookingId,
    p_occurred_at: occurredAt,
  });
  for (const call of calls) {
    assert.equal(call.headers.apikey, 'sb_secret_server_only');
    assert.equal(call.headers.Authorization, undefined);
  }
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Supabase professional operations adapter contract passed.');
