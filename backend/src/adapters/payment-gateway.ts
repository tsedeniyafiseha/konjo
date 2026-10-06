import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { type PaymentGateway, PaymentProviderError } from '../application/ports.ts';

/**
 * Chapa payment gateway adapter (Chapa API v2, https://docs.chapa.global/docs/v2).
 *
 * Development mode: returns a deterministic sandbox reference so all contract
 * tests remain offline and reproducible.
 *
 * Provider mode: creates a hosted checkout (`POST /v2/payments/hosted`) and
 * returns Konjo's merchant reference as the providerReference. Chapa reports
 * the outcome through a webhook (`x-chapa-signature`, HMAC-SHA256 hex over the
 * raw body with the webhook secret) and on demand through
 * `GET /v2/payments/{merchant_reference}/verify`.
 *
 * v2 specifics that shaped this adapter:
 *   - one host for test and live (`api.chapa.global`); the key decides the mode
 *     (`CHAPA_TEST_…` / `CHAPA_LIVE_…`);
 *   - amounts are whole minor units (ETB santim), never decimals;
 *   - `merchant_reference` is at most 20 characters and may be used once;
 *   - statuses come back upper-case (`PENDING`, `SUCCESS`, `FAILED`).
 */

const CHAPA_V2_BASE_URL = 'https://api.chapa.global/v2';

export interface PaymentGatewayOptions {
  /** When set, sandbox intents get a local checkout page the client app can open. */
  sandboxCheckoutBaseUrl?: string | null;
  /**
   * Force the deterministic sandbox even when Chapa keys are configured, so the
   * booking flow can be exercised locally without a public webhook URL or an
   * activated Chapa business. Production startup refuses this flag.
   */
  useSandbox?: boolean;
  /** Kept for configuration compatibility; Chapa v2 hosted checkout takes no return URL. */
  checkoutReturnUrl?: string | null;
  /** Kept for configuration compatibility; the webhook URL is registered in the Chapa dashboard. */
  webhookBaseUrl?: string | null;
  /** Chapa publishable key — sent to the client for hosted checkout initialisation. */
  chapaPublicKey?: string | null;
  /** Chapa encryption key — used for split-payment or customisation API calls. */
  chapaEncryptionKey?: string | null;
}

function bookingIdFromIdempotencyKey(key: string): string | null {
  const match = key.match(/^booking:([^:]+):payment:/);
  return match ? match[1] : null;
}

/**
 * Chapa allows at most 20 characters per merchant reference and refuses reuse.
 * Konjo's idempotency keys are longer, so the reference is a stable digest of
 * the key: the same booking stage and attempt always map to the same reference.
 */
export function chapaMerchantReference(idempotencyKey: string): string {
  return `KJ${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 18).toUpperCase()}`;
}

/** ETB with two decimals → whole santim, as v2 requires. */
export function toChapaMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

function chapaStatus(value: unknown): 'captured' | 'failed' | 'pending' {
  const status = typeof value === 'string' ? value.toLowerCase() : '';
  if (status === 'success' || status === 'successful') return 'captured';
  if (status === 'failed' || status === 'cancelled' || status === 'canceled' || status === 'expired') return 'failed';
  return 'pending';
}

function providerMessage(json: unknown): string {
  if (!json || typeof json !== 'object') return '';
  const { message, error } = json as { message?: unknown; error?: { code?: unknown } };
  const text = typeof message === 'string' && message.trim()
    ? message.trim()
    : message && typeof message === 'object'
      ? Object.values(message as Record<string, unknown>).flat().filter((item): item is string => typeof item === 'string').join(' ')
      : '';
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : null;
  return code ? `${text || 'request refused'} (${code})` : text;
}

export function createPaymentGateway(
  webhookSecret: string,
  chapaSecretKey: string | null,
  options: PaymentGatewayOptions = {},
  // Public and encryption keys are stored for completeness but the server-side
  // adapter only needs the secret key. They are validated at startup so a
  // misconfigured deployment fails fast rather than silently.
): PaymentGateway {
  if (chapaSecretKey && options.chapaPublicKey && options.chapaEncryptionKey) {
    // All three keys present — full Chapa integration active.
  } else if (chapaSecretKey && (options.chapaPublicKey || options.chapaEncryptionKey)) {
    throw new Error('Chapa integration requires all three keys: secret, public, and encryption.');
  }
  const isLive = Boolean(chapaSecretKey) && !options.useSandbox;

  return {
    ...(isLive ? {
      async verifyTransaction(reference: string) {
        let response: Response;
        try {
          response = await fetch(`${CHAPA_V2_BASE_URL}/payments/${encodeURIComponent(reference)}/verify`, {
            headers: { Authorization: `Bearer ${chapaSecretKey}` }, signal: AbortSignal.timeout(15_000),
          });
        } catch (cause) {
          throw new Error(`The payment provider could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
        const result = await response.json().catch(() => null) as {
          status?: string;
          data?: { merchant_reference?: unknown; amount?: unknown; currency?: unknown; status?: unknown };
        } | null;
        const data = result?.data;
        const amount = Number(data?.amount);
        if (!response.ok || result?.status !== 'success' || !data || data.merchant_reference !== reference ||
          !Number.isInteger(amount) || amount < 0 || data.currency !== 'ETB') {
          throw new Error(`The payment provider has not verified this transaction${providerMessage(result) ? `: ${providerMessage(result)}` : '.'}`);
        }
        return { amount: amount / 100, currency: 'ETB', status: chapaStatus(data.status), merchantReference: reference };
      },
    } : {}),
    async createIntent(input) {
      // Cash is always handled locally — no provider call needed.
      if (input.provider === 'cash') {
        const ref = createHmac('sha256', webhookSecret)
          .update(`cash:${input.idempotencyKey}`)
          .digest('hex')
          .slice(0, 32);
        return { providerReference: `cash_${ref}`, status: 'cash_due' };
      }

      if (!isLive) {
        // Deterministic sandbox reference for development / contract tests.
        const ref = createHmac('sha256', webhookSecret)
          .update(`${input.provider}:${input.idempotencyKey}:${input.amount}:${input.currency}`)
          .digest('hex')
          .slice(0, 32);
        const providerReference = `chapa_sandbox_${ref}`;
        return {
          providerReference,
          status: 'pending',
          ...(options.sandboxCheckoutBaseUrl ? {
            checkoutUrl: `${options.sandboxCheckoutBaseUrl.replace(/\/$/, '')}/v1/payments/sandbox-checkout/${input.provider}/${providerReference}`,
          } : {}),
        };
      }

      const bookingId = input.bookingId ?? bookingIdFromIdempotencyKey(input.idempotencyKey);
      const merchantReference = chapaMerchantReference(input.idempotencyKey);
      const customer = input.customer;
      const body: Record<string, unknown> = {
        amount: toChapaMinorUnits(input.amount),
        currency: input.currency,
        merchant_reference: merchantReference,
        ...(customer ? {
          customer: {
            first_name: customer.firstName,
            last_name: customer.lastName,
            ...(customer.email ? { email: customer.email } : {}),
            ...(customer.phoneNumber ? { phone_number: customer.phoneNumber } : {}),
          },
        } : {}),
        meta: { booking_id: bookingId, idempotency_key: input.idempotencyKey, method: input.provider },
      };

      let response: Response;
      try {
        response = await fetch(`${CHAPA_V2_BASE_URL}/payments/hosted`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${chapaSecretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (cause) {
        throw new PaymentProviderError(`The payment provider could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`);
      }

      // Chapa explains refusals in `message` and `error.code` (invalid key,
      // environment mismatch, reused reference). Pass that through so the
      // client and the logs say why.
      const json = await response.json().catch(() => null) as { status?: string; data?: { checkout_url?: unknown } } | null;
      if (!response.ok || json?.status !== 'success') {
        const message = providerMessage(json);
        throw new PaymentProviderError(
          message
            ? `The payment provider rejected this payment: ${message}`
            : `The payment provider rejected this payment (${response.status}).`,
        );
      }
      const checkoutUrl = typeof json.data?.checkout_url === 'string' && /^https:\/\//.test(json.data.checkout_url)
        ? json.data.checkout_url
        : null;
      if (!checkoutUrl) throw new PaymentProviderError('The payment provider did not return a checkout page.');
      return { providerReference: merchantReference, status: 'pending', checkoutUrl };
    },

    verifyWebhook(rawBody, signature) {
      if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
      const expected = createHmac('sha256', webhookSecret).update(rawBody).digest();
      const received = Buffer.from(signature, 'hex');
      return received.length === expected.length && timingSafeEqual(received, expected);
    },
  };
}
