import assert from 'node:assert/strict';

import type {
  BookingCreationResult,
  BookingQuote,
  CreateBookingCommandInput,
} from '../src/application/contracts.ts';
import { CreateBookingHandler } from '../src/application/create-booking.ts';
import type { BookingCommandStore } from '../src/application/ports.ts';

const input: CreateBookingCommandInput = {
  requestId: 'booking-request-123',
  clientId: 'client-1',
  professionalId: 'professional-1',
  serviceId: 'service-1',
  dateIso: '2026-09-20',
  time: '2:30 PM',
  addressLabel: 'Home',
  addressZone: 'Bole',
  addressDetail: 'Blue gate near the main road',
  femaleOnly: false,
  paymentMethod: 'telebirr',
};
const quote: BookingQuote = {
  serviceName: 'Box braids',
  addressZone: 'Bole',
  servicePrice: 1800,
  serviceFee: 324,
  travelFee: 0,
  total: 2124,
  commissionRateBps: 1800,
};
const created: BookingCreationResult = {
  booking: {
    id: 'booking-1',
    clientId: input.clientId,
    professionalId: input.professionalId,
    serviceId: input.serviceId,
    serviceName: quote.serviceName,
    dateIso: input.dateIso,
    time: input.time,
    addressLabel: input.addressLabel,
    addressZone: input.addressZone,
    addressDetail: input.addressDetail,
    femaleOnly: input.femaleOnly,
    paymentMethod: input.paymentMethod,
    servicePrice: quote.servicePrice,
    serviceFee: quote.serviceFee,
    travelFee: quote.travelFee,
    total: quote.total,
    commissionRateBps: quote.commissionRateBps,
    status: 'requested',
    cancellationPolicy: null,
    startedAt: null,
    completedAt: null,
    createdAt: '2026-09-17T18:00:00.000Z',
  },
  paymentIntent: null,
  duplicate: false,
};

let existing: BookingCreationResult | null = null;
let quoted: BookingQuote | null = quote;
const store: BookingCommandStore = {
  findBookingByRequest(clientId, requestId) {
    assert.equal(clientId, input.clientId);
    assert.equal(requestId, input.requestId);
    return existing;
  },
  quoteBooking(received) {
    assert.deepEqual(received, input);
    return quoted;
  },
  explainQuoteFailure(received) {
    assert.deepEqual(received, input);
    return quoted ? null : 'time_unavailable';
  },
  commitBooking(received, receivedQuote) {
    assert.deepEqual(received, input);
    assert.deepEqual(receivedQuote, quote);
    return created;
  },
};
const handler = new CreateBookingHandler(store);

assert.deepEqual(await handler.execute(input), created);

existing = { ...created, duplicate: true };
assert.deepEqual(await handler.execute(input), existing);

existing = null;
assert.equal(await handler.explainUnavailability(input), null);
quoted = null;
assert.equal(await handler.execute(input), null);
assert.equal(await handler.explainUnavailability(input), 'time_unavailable');

console.log('Create-booking request creates no payment before professional acceptance.');
