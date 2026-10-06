import type { InitiateBookingPaymentResult, PaymentCustomer } from './contracts.ts';
import type { BookingPaymentStore, Clock, PaymentGateway } from './ports.ts';

export class InitiateBookingPaymentHandler {
  private readonly payments: BookingPaymentStore;
  private readonly gateway: PaymentGateway;
  private readonly clock: Clock;

  constructor(
    payments: BookingPaymentStore,
    gateway: PaymentGateway,
    clock: Clock,
  ) {
    this.payments = payments;
    this.gateway = gateway;
    this.clock = clock;
  }

  async execute(clientId: string, bookingId: string, options?: { returnUrl?: string | null; customer?: PaymentCustomer | null }): Promise<InitiateBookingPaymentResult> {
    const context = await this.payments.getBookingPaymentContext(clientId, bookingId);
    if (!context) return { result: 'not_found' };
    if (context.paymentIntent) {
      return { result: 'duplicate', paymentIntent: context.paymentIntent };
    }
    if (context.stage === null || (context.bookingStatus !== 'accepted' &&
      !(context.bookingStatus === 'completed' && context.stage === 'balance'))) return { result: 'not_accepted' };

    const providerIntent = await this.gateway.createIntent({
      provider: context.paymentMethod,
      amount: context.amount,
      currency: context.currency,
      idempotencyKey: context.stage
        ? `booking:${bookingId}:payment:${context.stage}:${context.attempt ?? 1}`
        : `booking:${bookingId}:payment:v1`,
      bookingId,
      ...(options?.customer ? { customer: options.customer } : {}),
      ...(options?.returnUrl ? { returnUrl: options.returnUrl } : {}),
    });
    return await this.payments.commitBookingPayment(
      clientId,
      bookingId,
      context.stage ? { ...providerIntent, stage: context.stage, attempt: context.attempt ?? 1, amount: context.amount } : providerIntent,
      this.clock.now().toISOString(),
    );
  }
}
