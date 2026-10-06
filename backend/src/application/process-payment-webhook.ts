import type {
  ProcessPaymentEventResult,
  ProcessPaymentWebhookCommandInput,
} from './contracts.ts';
import type {
  Clock,
  PayloadHasher,
  PaymentEventStore,
  PaymentGateway,
} from './ports.ts';

export class ProcessPaymentWebhookHandler {
  private readonly payments: PaymentEventStore;
  private readonly gateway: PaymentGateway;
  private readonly hasher: PayloadHasher;
  private readonly clock: Clock;

  constructor(
    payments: PaymentEventStore,
    gateway: PaymentGateway,
    hasher: PayloadHasher,
    clock: Clock,
  ) {
    this.payments = payments;
    this.gateway = gateway;
    this.hasher = hasher;
    this.clock = clock;
  }

  verify(rawBody: string, signature: string | undefined): boolean {
    return this.gateway.verifyWebhook(rawBody, signature);
  }

  async execute(input: ProcessPaymentWebhookCommandInput): Promise<ProcessPaymentEventResult> {
    const verified = this.gateway.verifyTransaction ? await this.gateway.verifyTransaction(input.providerReference) : null;
    if (verified && verified.status !== input.status) return { result: 'invalid_transition' };
    return await this.payments.processPaymentEvent({
      ...(verified ? { verifiedAmount: verified.amount, verifiedCurrency: verified.currency } : {}),
      eventId: input.eventId,
      provider: input.provider,
      providerReference: input.providerReference,
      status: input.status,
      payloadHash: this.hasher.hash(verified ? JSON.stringify({ provider: input.provider, reference: input.providerReference,
        status: verified.status, amount: verified.amount, currency: verified.currency }) : input.rawBody),
      occurredAt: this.clock.now().toISOString(),
    });
  }
}
