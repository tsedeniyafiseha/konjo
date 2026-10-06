import assert from 'node:assert/strict';

import type { AdminRefundStoreInput } from '../src/application/contracts.ts';
import type { AdminRefundStore, Clock, IdGenerator } from '../src/application/ports.ts';
import { RefundBookingAsAdminHandler } from '../src/application/refund-booking-as-admin.ts';

const occurredAt = '2026-09-18T07:00:00.000Z';
const calls: AdminRefundStoreInput[] = [];
const store: AdminRefundStore = {
  refundBooking(input) {
    calls.push(input);
    return { result: 'not_found' };
  },
};
const ids: IdGenerator = { next: () => 'audit-1' };
const clock: Clock = { now: () => new Date(occurredAt) };
const handler = new RefundBookingAsAdminHandler(store, ids, clock);

assert.deepEqual(await handler.execute('admin-1', 'booking-1'), { result: 'not_found' });
assert.deepEqual(calls, [{
  auditId: 'audit-1',
  adminId: 'admin-1',
  bookingId: 'booking-1',
  occurredAt,
}]);

console.log('Administrator refund application command contracts passed.');
