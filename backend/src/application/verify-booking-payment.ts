import type { VerifyBookingPaymentResult } from './contracts.ts';
import { type BookingPaymentStore, type Clock, type PayloadHasher, type PaymentEventStore, type PaymentGateway, PaymentProviderError } from './ports.ts';

/** Merchant references Konjo issues to the provider (see chapaMerchantReference). */
const PROVIDER_REFERENCE = /^KJ[0-9A-F]{18}$/;

/**
 * "Did my payment go through?" from the client app, typically right after the
 * hosted checkout closes. Webhooks remain the source of truth in production;
 * this path lets the app settle a payment when the webhook has not arrived
 * yet (or cannot reach a local API). It records the provider's verdict through
 * the same event store as the webhook, under the same event id, so the two
 * never double-count.
 */
export class VerifyBookingPaymentHandler {
  private readonly payments: BookingPaymentStore;
  private readonly events: PaymentEventStore;
  private readonly gateway: PaymentGateway;
  private readonly hasher: PayloadHasher;
  private readonly clock: Clock;

  constructor(payments: BookingPaymentStore, events: PaymentEventStore, gateway: PaymentGateway, hasher: PayloadHasher, clock: Clock) {
    this.payments = payments;
    this.events = events;
    this.gateway = gateway;
    this.hasher = hasher;
    this.clock = clock;
  }

  async execute(clientId: string, bookingId: string): Promise<VerifyBookingPaymentResult> {
    const context = await this.payments.getBookingPaymentContext(clientId, bookingId);
    if (!context) return { result: 'not_found' };
    const intent = context.paymentIntent;
    if (!intent || intent.status !== 'pending' || intent.provider === 'cash') return { result: 'no_pending_payment' };
    if (!this.gateway.verifyTransaction || !PROVIDER_REFERENCE.test(intent.providerReference)) {
      return { result: 'unsupported', paymentIntent: intent };
    }
    let verified: Awaited<ReturnType<NonNullable<PaymentGateway['verifyTransaction']>>>;
    try {
      verified = await this.gateway.verifyTransaction(intent.providerReference);
    } catch (error) {
      throw new PaymentProviderError(error instanceof Error ? error.message : 'The payment provider could not verify this payment.');
    }
    if (verified.status === 'pending') return { result: 'verified', status: 'pending', paymentIntent: intent };
    const outcome = await this.events.processPaymentEvent({
      eventId: `chapa:${intent.providerReference}:${verified.status}`,
      provider: intent.provider,
      providerReference: intent.providerReference,
      status: verified.status,
      verifiedAmount: verified.amount,
      verifiedCurrency: verified.currency,
      payloadHash: this.hasher.hash(JSON.stringify({ provider: intent.provider, reference: intent.providerReference,
        status: verified.status, amount: verified.amount, currency: verified.currency })),
      occurredAt: this.clock.now().toISOString(),
    });
    if (outcome.result === 'updated' || outcome.result === 'duplicate') {
      return { result: 'verified', status: verified.status, paymentIntent: outcome.paymentIntent };
    }
    if (outcome.result === 'invalid_transition') {
      const latest = await this.payments.getBookingPaymentContext(clientId, bookingId);
      return { result: 'verified', status: verified.status, paymentIntent: latest?.paymentIntent ?? intent };
    }
    return { result: 'not_found' };
  }
}
