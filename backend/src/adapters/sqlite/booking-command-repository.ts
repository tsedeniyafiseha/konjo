import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type {
  ApiBooking,
  ApiProfessionalService,
  ApiPaymentIntent,
} from '../../../../shared/api-contracts.ts';
import type {
  BookingCreationResult,
  BookingPaymentContext,
  BookingQuote,
  BookingQuoteFailureReason,
  CreateBookingCommandInput,
  InitiateBookingPaymentResult,
  PaymentProviderIntent,
} from '../../application/contracts.ts';
import type {
  BookingCommandStore,
  BookingPaymentStore,
  ProfessionalAvailabilityReader,
} from '../../application/ports.ts';
import { domainEventTypes } from '../../domain/events.ts';
import type { SqliteDomainEventOutbox } from './domain-event-outbox.ts';
import {
  type BookingRow,
  type PaymentIntentRow,
  toApiBooking,
  toApiPaymentIntent,
} from './booking-records.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';
import { redeemRewardCoupon, rewardDiscount, rewardOffer } from './client-rewards.ts';

interface ProfessionalBookingRow {
  services_json: string;
  female_only_eligible: number;
}

function bookingQuotesEqual(left: BookingQuote, right: BookingQuote): boolean {
  return left.serviceName === right.serviceName &&
    left.addressZone === right.addressZone &&
    left.servicePrice === right.servicePrice &&
    (left.serviceFee ?? 0) === (right.serviceFee ?? 0) &&
    left.travelFee === right.travelFee &&
    (left.discountAmount ?? 0) === (right.discountAmount ?? 0) &&
    (left.discountReason ?? null) === (right.discountReason ?? null) &&
    left.total === right.total &&
    left.commissionRateBps === right.commissionRateBps;
}

export class SqliteBookingCommandRepository implements BookingCommandStore, BookingPaymentStore {
  private readonly database: DatabaseSync;
  private readonly availability: ProfessionalAvailabilityReader;
  private readonly domainEvents: SqliteDomainEventOutbox;
  private readonly unitOfWork: SqliteUnitOfWork;

  constructor(
    database: DatabaseSync,
    availability: ProfessionalAvailabilityReader,
    domainEvents: SqliteDomainEventOutbox,
    unitOfWork = new SqliteUnitOfWork(database),
  ) {
    this.database = database;
    this.availability = availability;
    this.domainEvents = domainEvents;
    this.unitOfWork = unitOfWork;
  }

  findBookingByRequest(clientId: string, requestId: string): BookingCreationResult | null {
    const existingBooking = this.database.prepare(`
      SELECT * FROM bookings WHERE client_id = ? AND client_request_id = ?
    `).get(clientId, requestId) as unknown as BookingRow | undefined;
    if (!existingBooking) return null;
    return {
      booking: toApiBooking(existingBooking),
      paymentIntent: null,
      duplicate: true,
    };
  }

  quoteBooking(input: CreateBookingCommandInput): BookingQuote | null {
    return this.resolveQuote(input).quote;
  }

  explainQuoteFailure(input: CreateBookingCommandInput): BookingQuoteFailureReason | null {
    return this.resolveQuote(input).reason;
  }

  /**
   * One evaluation serves both the quote and its explanation, so the reason a
   * client sees always matches the check that actually blocked the request.
   */
  private resolveQuote(
    input: CreateBookingCommandInput,
  ): { quote: BookingQuote; reason: null } | { quote: null; reason: BookingQuoteFailureReason } {
    if (this.database.prepare(`
      SELECT 1 FROM professional_blocks WHERE client_id = ? AND professional_id = ?
    `).get(input.clientId, input.professionalId)) {
      return { quote: null, reason: 'professional_unavailable' };
    }
    const professional = this.database.prepare(`
      SELECT services_json, female_only_eligible
      FROM professionals
      WHERE id = ? AND hidden = 0 AND suspended = 0
    `).get(input.professionalId) as unknown as ProfessionalBookingRow | undefined;
    if (!professional) return { quote: null, reason: 'professional_unavailable' };
    const services = JSON.parse(professional.services_json) as ApiProfessionalService[];
    const service = services.find((item) => item.id === input.serviceId);
    if (!service) return { quote: null, reason: 'service_unavailable' };
    if (input.femaleOnly && professional.female_only_eligible !== 1) {
      return { quote: null, reason: 'female_only_unavailable' };
    }
    if (this.database.prepare(`
      SELECT 1 FROM bookings
      WHERE professional_id = ? AND status IN ('on_the_way', 'in_progress')
      LIMIT 1
    `).get(input.professionalId)) {
      return { quote: null, reason: 'professional_busy' };
    }
    // Any active zone is bookable: the professional sees the address on the
    // request, decides whether to travel, and names the travel fee on acceptance.
    const serviceZone = this.database.prepare(`
      SELECT label, travel_fee FROM service_zones WHERE lower(label) = lower(?) AND active = 1
    `).get(input.addressZone) as unknown as { label: string; travel_fee: number } | undefined;
    if (!serviceZone) return { quote: null, reason: 'zone_unavailable' };
    const availability = this.availability.getProfessionalAvailability(
      input.professionalId,
      input.dateIso,
      input.serviceId,
    );
    if (!availability?.slots.includes(input.time)) return { quote: null, reason: 'time_unavailable' };
    const settings = this.database.prepare(`
      SELECT value_integer FROM platform_settings WHERE key = 'commission_rate_bps'
    `).get() as unknown as { value_integer: number };
    // The client-side service fee mirrors the platform commission, so the
    // professional nets the full service price plus their travel fee.
    const serviceFee = Math.round(service.price * settings.value_integer / 10_000);
    // Rewards: the first booking and the booking after every Nth completed one
    // are discounted. Konjo funds it, so the professional's share is unchanged.
    const offer = rewardOffer(this.database, input.clientId);
    const discountAmount = rewardDiscount(service.price, offer);
    return {
      reason: null,
      quote: {
        serviceName: service.name,
        addressZone: serviceZone.label,
        servicePrice: service.price,
        serviceFee,
        travelFee: 0, // Professional sets travel fee when accepting the booking.
        discountAmount,
        discountRateBps: offer?.rateBps ?? 0,
        discountReason: offer?.reason ?? null,
        total: service.price + serviceFee - discountAmount,
        commissionRateBps: settings.value_integer,
      },
    };
  }

  commitBooking(
    input: CreateBookingCommandInput,
    quote: BookingQuote,
  ): BookingCreationResult | null {
    return this.unitOfWork.run(() => {
      const existing = this.findBookingByRequest(input.clientId, input.requestId);
      if (existing) {
        return existing;
      }
      const currentQuote = this.quoteBooking(input);
      if (!currentQuote || !bookingQuotesEqual(currentQuote, quote)) {
        return this.unitOfWork.abort(null);
      }
      const pin = input.addressId
        ? this.database.prepare('SELECT latitude, longitude FROM client_addresses WHERE id = ? AND client_id = ?')
            .get(input.addressId, input.clientId) as unknown as { latitude: number | null; longitude: number | null } | undefined
        : undefined;
      const booking: ApiBooking = {
        id: randomUUID(),
        clientId: input.clientId,
        professionalId: input.professionalId,
        serviceId: input.serviceId,
        serviceName: quote.serviceName,
        dateIso: input.dateIso,
        time: input.time,
        addressLabel: input.addressLabel,
        addressZone: quote.addressZone,
        addressDetail: input.addressDetail,
        latitude: pin?.latitude ?? null,
        longitude: pin?.longitude ?? null,
        femaleOnly: input.femaleOnly,
        paymentMethod: input.paymentMethod,
        servicePrice: quote.servicePrice,
        serviceFee: quote.serviceFee ?? Math.round(quote.servicePrice * 0.18),
        travelFee: quote.travelFee,
        discountAmount: quote.discountAmount ?? 0,
        discountRateBps: quote.discountRateBps ?? 0,
        discountReason: quote.discountReason ?? null,
        total: quote.total,
        commissionRateBps: quote.commissionRateBps,
        status: 'requested',
        cancellationPolicy: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
      };
      const acceptBy = new Date(Date.parse(booking.createdAt) + 15 * 60 * 1000).toISOString();
      this.database.prepare(`
        INSERT INTO bookings (
          id, client_request_id, client_id, professional_id, service_id, service_name, date_iso, time,
          address_label, address_zone, address_detail, latitude, longitude, female_only, payment_method,
          service_price, service_fee, travel_fee, total, commission_rate_bps, status, accept_by, assignment_version, created_at, payment_plan,
          discount_amount, discount_rate_bps, discount_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
      `).run(
        booking.id, input.requestId, booking.clientId, booking.professionalId, booking.serviceId,
        booking.serviceName, booking.dateIso, booking.time, booking.addressLabel,
        booking.addressZone, booking.addressDetail, booking.latitude ?? null, booking.longitude ?? null,
        booking.femaleOnly ? 1 : 0,
        booking.paymentMethod, booking.servicePrice, booking.serviceFee ?? 0, booking.travelFee,
        booking.total, booking.commissionRateBps, booking.status, acceptBy, booking.createdAt, input.paymentMethod === 'cash' ? 'full' : 'split',
        booking.discountAmount ?? 0, booking.discountRateBps ?? 0, booking.discountReason ?? null,
      );
      if (booking.discountReason === 'loyalty') redeemRewardCoupon(this.database, booking.clientId, booking.id, booking.createdAt);
      this.database.prepare(`
        INSERT INTO booking_assignments (
          booking_id, professional_id, assignment_version, assigned_at
        ) VALUES (?, ?, 1, ?)
      `).run(booking.id, booking.professionalId, booking.createdAt);
      this.domainEvents.enqueue({
        eventType: domainEventTypes.bookingRequested,
        schemaVersion: 1,
        aggregateType: 'booking',
        aggregateId: booking.id,
        aggregateVersion: 1,
        occurredAt: booking.createdAt,
        correlationId: input.requestId,
        causationId: null,
        payload: {
          clientId: input.clientId,
          professionalId: booking.professionalId,
          assignmentVersion: 1,
        },
      });
      return { booking, paymentIntent: null, duplicate: false };
    });
  }

  getBookingPaymentContext(clientId: string, bookingId: string): BookingPaymentContext | null {
    const booking = this.database.prepare(
      'SELECT * FROM bookings WHERE id = ? AND client_id = ?',
    ).get(bookingId, clientId) as unknown as BookingRow | undefined;
    if (!booking) return null;
    const projection = toApiBooking(booking, this.database);
    const summary = projection.paymentSummary!;
    const stage = summary.dueStage;
    const payments = projection.payments!.filter((payment) => payment.stage === stage);
    const payment = payments.at(-1);
    return {
      bookingId,
      clientId,
      paymentMethod: booking.payment_method,
      amount: stage === 'deposit' ? summary.depositAmount : summary.outstandingAmount,
      stage,
      attempt: (payment?.attempt ?? 0) + (payment?.status === 'failed' || !payment ? 1 : 0),
      currency: 'ETB',
      bookingStatus: booking.status,
      paymentIntent: payment && payment.status !== 'failed' ? payment : null,
    };
  }

  commitBookingPayment(
    clientId: string,
    bookingId: string,
    providerIntent: PaymentProviderIntent,
    occurredAt: string,
  ): InitiateBookingPaymentResult {
    return this.unitOfWork.run(() => {
      const booking = this.database.prepare(
        'SELECT * FROM bookings WHERE id = ? AND client_id = ?',
      ).get(bookingId, clientId) as unknown as BookingRow | undefined;
      if (!booking) return { result: 'not_found' };
      const context = this.getBookingPaymentContext(clientId, bookingId)!;
      const existing = this.database.prepare('SELECT * FROM payment_intents WHERE booking_id = ? AND stage = ? AND attempt = ?')
        .get(bookingId, providerIntent.stage ?? 'full', providerIntent.attempt ?? 1) as unknown as PaymentIntentRow | undefined;
      if (existing) return { result: 'duplicate', paymentIntent: toApiPaymentIntent(existing) };
      if (!context.stage || context.stage !== (providerIntent.stage ?? 'full') ||
        context.attempt !== (providerIntent.attempt ?? 1) ||
        (providerIntent.amount !== undefined && providerIntent.amount !== context.amount)) return { result: 'not_accepted' };

      const payment: ApiPaymentIntent = {
        id: randomUUID(),
        bookingId,
        provider: booking.payment_method,
        providerReference: providerIntent.providerReference,
        status: providerIntent.status,
        amount: context.amount,
        stage: context.stage,
        attempt: context.attempt,
        refundedAmount: 0,
        currency: 'ETB',
        checkoutUrl: providerIntent.checkoutUrl ?? null,
        createdAt: occurredAt,
        updatedAt: occurredAt,
      };
      this.database.prepare(`
        INSERT INTO payment_intents (
          id, booking_id, client_id, provider, provider_reference, status,
          amount, currency, checkout_url, created_at, updated_at, stage, attempt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ETB', ?, ?, ?, ?, ?)
      `).run(
        payment.id,
        payment.bookingId,
        clientId,
        payment.provider,
        payment.providerReference,
        payment.status,
        payment.amount,
        payment.checkoutUrl ?? null,
        payment.createdAt,
        payment.updatedAt,
        payment.stage!,
        payment.attempt!,
      );
      this.domainEvents.enqueue({
        eventType: domainEventTypes.paymentAuthorizationRequested,
        schemaVersion: 1,
        aggregateType: 'payment',
        aggregateId: payment.id,
        aggregateVersion: 1,
        occurredAt,
        correlationId: booking.client_request_id ?? booking.id,
        causationId: `booking:${booking.id}:accepted`,
        payload: {
          clientId,
          bookingId,
          paymentIntentId: payment.id,
          provider: payment.provider,
          status: payment.status,
          reason: 'client_initiated',
        },
      });
      return { result: 'created', paymentIntent: payment };
    });
  }
}
