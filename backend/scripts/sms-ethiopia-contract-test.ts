import assert from 'node:assert/strict';

import {
  SMS_ETHIOPIA_ENDPOINT,
  SmsEthiopiaDeliveryError,
  konjoOtpMessage,
  sendWithSmsEthiopia,
  toSmsEthiopiaMsisdn,
} from '../../supabase/functions/send-sms/sms-ethiopia.ts';

assert.equal(toSmsEthiopiaMsisdn('+251 911 223 344'), '251911223344');
assert.throws(() => toSmsEthiopiaMsisdn('+12025550123'), SmsEthiopiaDeliveryError);
assert.match(konjoOtpMessage('561166'), /561166/);
assert.throws(() => konjoOtpMessage('1234'), SmsEthiopiaDeliveryError);

const calls: Array<{ url: string; init?: RequestInit }> = [];
await sendWithSmsEthiopia(
  { phoneNumber: '+251911223344', otp: '561166' },
  'test-api-key',
  async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ status: 'success', message: 'Accepted Successfully' });
  },
);

assert.equal(calls[0]?.url, SMS_ETHIOPIA_ENDPOINT);
assert.equal(new Headers(calls[0]?.init?.headers).get('KEY'), 'test-api-key');
assert.ok(calls[0]?.init?.signal, 'The provider request must have a timeout signal.');
assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
  msisdn: '251911223344',
  text: konjoOtpMessage('561166'),
});

await assert.rejects(
  sendWithSmsEthiopia(
    { phoneNumber: '+251911223344', otp: '561166' },
    'test-api-key',
    async () => Response.json({ status: 'error', code: 10007 }, { status: 400 }),
  ),
  SmsEthiopiaDeliveryError,
);

console.log('SMSEthiopia delivery adapter contracts passed.');
