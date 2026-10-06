import assert from 'node:assert/strict';

import type { RecordBookingLocationStoreInput } from '../src/application/contracts.ts';
import type { BookingTrackingStore, Clock } from '../src/application/ports.ts';
import { BookingTrackingHandler, areaLabel } from '../src/application/record-booking-location.ts';

const occurredAt = '2026-09-22T09:00:00.000Z';
const recorded: RecordBookingLocationStoreInput[] = [];
const store: BookingTrackingStore = {
  recordLocation(input) {
    recorded.push(input);
    return input.bookingId === 'booking-idle' ? 'not_active' : input.bookingId === 'missing' ? 'not_found' : 'updated';
  },
  getTracking(userId, bookingId) {
    if (bookingId === 'missing') return undefined;
    if (userId !== 'client-1' && userId !== 'professional-1') return undefined;
    return bookingId === 'booking-quiet' ? null : {
      latitude: 9.01, longitude: 38.75, accuracyMeters: 12, heading: 90, speedMps: 4, areaLabel: 'Bole, Addis Ababa', recordedAt: occurredAt,
    };
  },
};
const clock: Clock = { now: () => new Date(occurredAt) };
const handler = new BookingTrackingHandler(store, clock);

assert.equal(await handler.record({
  professionalId: 'professional-1', bookingId: 'booking-1',
  latitude: 9.0192, longitude: 38.7525, accuracyMeters: 8, heading: 400, speedMps: -1, areaLabel: '  Saris,\n  Addis Ababa ',
}), 'updated');
assert.deepEqual(recorded, [{
  professionalId: 'professional-1', bookingId: 'booking-1',
  latitude: 9.0192, longitude: 38.7525, accuracyMeters: 8, heading: null, speedMps: null, areaLabel: 'Saris, Addis Ababa', recordedAt: occurredAt,
}], 'out-of-range heading and negative speed are dropped, the label is tidied, the clock stamps the point');
assert.equal(areaLabel(undefined), null);
assert.equal(areaLabel('x'), null, 'single characters are noise');
assert.equal(areaLabel('a'.repeat(120))?.length, 80, 'long labels are capped, not rejected');

assert.equal(await handler.record({ professionalId: 'professional-1', bookingId: 'booking-idle', latitude: 9, longitude: 38 }), 'not_active');
assert.equal(await handler.record({ professionalId: 'professional-1', bookingId: 'missing', latitude: 9, longitude: 38 }), 'not_found');
await assert.rejects(
  () => handler.record({ professionalId: 'professional-1', bookingId: 'booking-1', latitude: 91, longitude: 0 }),
  RangeError,
  'coordinates outside the globe never reach the store',
);
assert.equal(recorded.length, 3);

assert.deepEqual(await handler.get('client-1', 'booking-1'), {
  latitude: 9.01, longitude: 38.75, accuracyMeters: 12, heading: 90, speedMps: 4, areaLabel: 'Bole, Addis Ababa', recordedAt: occurredAt,
});
assert.equal(await handler.get('client-1', 'booking-quiet'), null, 'a participant with no point yet sees null');
assert.equal(await handler.get('stranger', 'booking-1'), undefined, 'non-participants get nothing');

console.log('Booking live-location application contracts passed.');
