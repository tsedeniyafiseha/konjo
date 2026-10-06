import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { createIdentityVerifier } from '../src/adapters/identity-verifier.ts';
import { createNotificationGateway } from '../src/adapters/notification-gateway.ts';
import { createOtpSender } from '../src/adapters/otp-sender.ts';
import { createPasswordResetSender } from '../src/adapters/password-reset-sender.ts';
import { chapaKeyMode } from '../src/adapters/chapa-key-mode.ts';
import { createPaymentGateway } from '../src/adapters/payment-gateway.ts';
import { IdentityVerificationError } from '../src/application/ports.ts';

const developmentProvider = {
  mode: 'development',
  deliveryUrl: null,
  deliveryToken: null,
} as const;

await createOtpSender(developmentProvider).send('+251911111111', '2471');
await createPasswordResetSender({ ...developmentProvider, resetUrl: 'https://example.com/reset' })
  .send('client@example.com', 'reset-token');

const identityVerifier = createIdentityVerifier({
  mode: 'development',
  verificationUrl: null,
  verificationToken: null,
});
assert.deepEqual(await identityVerifier.verify('123456781234'), { lastFour: '1234' });
assert.deepEqual(await identityVerifier.verify('1234567890125678'), { lastFour: '5678' });
await assert.rejects(() => identityVerifier.verify('1234'), IdentityVerificationError);

const webhookSecret = 'adapter-contract-secret';
const paymentGateway = createPaymentGateway(webhookSecret, null);
const telebirrIntentInput = {
  provider: 'telebirr',
  amount: 1800,
  currency: 'ETB',
  idempotencyKey: 'booking-request-1',
} as const;
const firstTelebirrIntent = await paymentGateway.createIntent(telebirrIntentInput);
const repeatedTelebirrIntent = await paymentGateway.createIntent(telebirrIntentInput);
assert.match(firstTelebirrIntent.providerReference, /^chapa_sandbox_/);
// With Chapa keys configured but the sandbox forced (local development), no
// provider call is made and the deterministic sandbox reference is still used.
const forcedSandboxIntent = await createPaymentGateway(webhookSecret, 'CHASECK_TEST-contract', {
  useSandbox: true, sandboxCheckoutBaseUrl: 'http://127.0.0.1:4000',
}).createIntent({ provider: 'telebirr', amount: 100, currency: 'ETB', idempotencyKey: 'booking:b1:payment:deposit:1' });
assert.match(forcedSandboxIntent.providerReference, /^chapa_sandbox_/);
assert.equal(forcedSandboxIntent.checkoutUrl, `http://127.0.0.1:4000/v1/payments/sandbox-checkout/telebirr/${forcedSandboxIntent.providerReference}`);
assert.equal(repeatedTelebirrIntent.providerReference, firstTelebirrIntent.providerReference);
// Every Chapa test-key prefix (classic dashboard, legacy and current) is
// recognised as test mode; anything else is treated as a live key.
for (const key of ['CHASECK_TEST-abc', 'sk_test_abc', 'CHAPA_TEST_PRIV_abc-secret', 'chapa_test_priv_abc']) assert.equal(chapaKeyMode(key), 'test', key);
for (const key of ['CHASECK-abc', 'sk_live_abc', 'CHAPA_LIVE_PRIV_abc', 'CHAPA_TEST_PUB_abc'.replace('TEST_PUB', 'PRIV')]) assert.equal(chapaKeyMode(key), 'live', key);
assert.equal((await paymentGateway.createIntent({ ...telebirrIntentInput, provider: 'cash' })).status, 'cash_due');
const body = JSON.stringify({ eventId: 'event-1' });
const signature = createHmac('sha256', webhookSecret).update(body).digest('hex');
assert.equal(paymentGateway.verifyWebhook(body, signature), true);
assert.equal(paymentGateway.verifyWebhook(body, 'invalid'), false);

const notificationGateway = createNotificationGateway(developmentProvider);
assert.match(await notificationGateway.deliver({
  id: 'notification-1',
  channel: 'push',
  template: 'booking_requested',
  payload: { bookingId: 'booking-1' },
  destination: 'ExpoPushToken[contract-test]',
  attempt: 1,
}), /^notification_sandbox_/);
await assert.rejects(() => notificationGateway.deliver({
  id: 'notification-2',
  channel: 'sms',
  template: 'booking_requested',
  payload: {},
  destination: '',
  attempt: 1,
}), /No sms destination/);

const originalFetch = globalThis.fetch;
let smsRequest: { url: string; key: string | null; body: unknown } | null = null;
try {
  globalThis.fetch = (async (input, init) => {
    const headers = new Headers(init?.headers);
    smsRequest = {
      url: String(input),
      key: headers.get('KEY'),
      body: JSON.parse(String(init?.body)),
    };
    return new Response(JSON.stringify({ status: 'sent', message_id: 'sms-1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  const smsGateway = createNotificationGateway({
    mode: 'provider',
    deliveryUrl: null,
    deliveryToken: null,
    smsEthiopiaApiKey: 'test-api-key',
  });
  assert.equal(await smsGateway.deliver({
    id: 'notification-approval-1',
    channel: 'sms',
    template: 'professional_application_approved',
    payload: { applicationId: 'KJ-PRO-1' },
    destination: '+251911111111',
    attempt: 1,
  }), 'sms-1');
  assert.deepEqual(smsRequest, {
    url: 'https://smsethiopia.com/api/sms/send',
    key: 'test-api-key',
    body: {
      msisdn: '251911111111',
      text: 'Konjo: Your professional application is approved. You can now sign in and use your professional dashboard.',
    },
  });
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Backend adapter contracts passed.');
