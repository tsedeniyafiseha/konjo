import assert from 'node:assert/strict';

import {
  BookingDraftController,
  type BookingDraftControllerLogger,
  type BookingDraftStorage,
} from '../../src/application/booking/booking-draft-controller.ts';
import type {
  BookingDraft,
  BookingReceipt,
} from '../../src/application/booking/booking-contracts.ts';

const storedDraft: BookingDraft = {
  requestId: 'booking-stored-request',
  professionalId: 'professional-1',
  serviceIndex: 1,
  dateIso: '2026-09-20',
  time: '10:00',
  addressId: 'address-1',
  paymentMethod: 'cash',
};

const receipt: BookingReceipt = {
  bookingId: 'booking-1',
  paymentStatus: 'pending',
  requestStatus: 'requested',
  createdAt: '2026-09-18T12:00:00.000Z',
  servicePrice: 1_000,
  travelFee: 150,
  total: 1_150,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function memoryStorage(initial: Readonly<Record<string, BookingDraft>> = {}) {
  const drafts = new Map(Object.entries(initial));
  const storage: BookingDraftStorage = {
    async read(userId) { return drafts.get(userId) ?? null; },
    async write(userId, draft) { drafts.set(userId, draft); },
    async delete(userId) { drafts.delete(userId); },
  };
  return { drafts, storage };
}

{
  const { storage } = memoryStorage({ 'client-1': storedDraft });
  const controller = new BookingDraftController(storage, { generate: () => 'unused' });
  await controller.setUser('client-1');
  assert.deepEqual(controller.getSnapshot(), { draft: { ...storedDraft, paymentMethod: 'telebirr' }, receipt: null });
}

{
  const { drafts, storage } = memoryStorage();
  let generated = 0;
  const controller = new BookingDraftController(storage, {
    generate: () => `booking-request-${++generated}`,
  });
  await controller.setUser('client-1');
  await controller.startBooking('professional-2', 0, 'address-default');
  await controller.selectDate('2026-09-22');
  await controller.selectTime('14:30');
  await controller.selectAddress('address-2');
  await controller.selectPaymentMethod('telebirr');

  const completedDraft = controller.getSnapshot().draft;
  assert.deepEqual(completedDraft, {
    requestId: 'booking-request-1',
    professionalId: 'professional-2',
    serviceIndex: 0,
    dateIso: '2026-09-22',
    time: '14:30',
    addressId: 'address-2',
    paymentMethod: 'telebirr',
  });
  assert.deepEqual(drafts.get('client-1'), completedDraft);

  controller.setReceipt(receipt);
  await controller.startBooking('professional-2', 0, 'another-address');
  assert.equal(controller.getSnapshot().draft?.requestId, 'booking-request-1');
  assert.equal(controller.getSnapshot().receipt, null);
  assert.equal(generated, 1);

  await controller.clearBooking();
  assert.deepEqual(controller.getSnapshot(), { draft: null, receipt: null });
  assert.equal(drafts.has('client-1'), false);
}

{
  const firstRead = deferred<BookingDraft | null>();
  const secondDraft = { ...storedDraft, requestId: 'booking-client-2' };
  const controller = new BookingDraftController({
    async read(userId) { return userId === 'client-1' ? firstRead.promise : secondDraft; },
    async write() {},
    async delete() {},
  }, { generate: () => 'unused' });

  const firstLoad = controller.setUser('client-1');
  await controller.setUser('client-2');
  firstRead.resolve(storedDraft);
  await firstLoad;
  assert.deepEqual(controller.getSnapshot(), { draft: { ...secondDraft, paymentMethod: 'telebirr' }, receipt: null });
}

{
  const read = deferred<BookingDraft | null>();
  const { drafts, storage } = memoryStorage();
  const controller = new BookingDraftController({
    ...storage,
    async read() { return read.promise; },
  }, { generate: () => 'booking-new-request' });

  const loading = controller.setUser('client-1');
  await controller.startBooking('professional-new', 2, null);
  read.resolve(storedDraft);
  await loading;
  assert.equal(controller.getSnapshot().draft?.requestId, 'booking-new-request');
  assert.equal(drafts.get('client-1')?.requestId, 'booking-new-request');
}

{
  const errors: string[] = [];
  const logger: BookingDraftControllerLogger = {
    error(message) { errors.push(message); },
  };
  const controller = new BookingDraftController({
    async read() { return null; },
    async write() { throw new Error('storage full'); },
    async delete() { throw new Error('storage unavailable'); },
  }, { generate: () => 'booking-failed-persistence' }, logger);

  await controller.setUser('client-1');
  await controller.startBooking('professional-1', 0, null);
  assert.equal(controller.getSnapshot().draft?.requestId, 'booking-failed-persistence');
  await controller.clearBooking();
  assert.deepEqual(controller.getSnapshot(), { draft: null, receipt: null });
  assert.equal(errors.length, 2);
}

console.log('Client booking-draft controller contracts passed.');
