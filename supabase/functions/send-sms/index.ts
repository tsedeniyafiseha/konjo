import { Webhook } from 'npm:standardwebhooks@^1.0.0';

import { SmsEthiopiaDeliveryError, sendWithSmsEthiopia } from './sms-ethiopia.ts';

interface SendSmsHookPayload {
  user?: { phone?: unknown };
  sms?: { otp?: unknown };
}

function verifyHookPayload(body: string, headers: Record<string, string>, configuredSecrets: string): SendSmsHookPayload {
  for (const configuredSecret of configuredSecrets.split('|')) {
    const secret = configuredSecret.trim().replace(/^v1,whsec_/, '');
    if (!secret) continue;
    try {
      return new Webhook(secret).verify(body, headers) as SendSmsHookPayload;
    } catch {
      // Try the next secret during signing-key rotation.
    }
  }
  throw new Error('The Supabase Auth Hook signature is invalid.');
}

function json(status: number): Response {
  return Response.json({}, { status });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json(405);

  const hookSecret = Deno.env.get('SEND_SMS_HOOK_SECRET') ?? '';
  const apiKey = Deno.env.get('SMSETHIOPIA_API_KEY') ?? '';
  if (!hookSecret || !apiKey) {
    console.error('SMS delivery secrets are not configured.');
    return json(500);
  }

  let event: SendSmsHookPayload;
  try {
    const body = await request.text();
    event = verifyHookPayload(body, Object.fromEntries(request.headers), hookSecret);
  } catch {
    return json(401);
  }

  const phoneNumber = event.user?.phone;
  const otp = event.sms?.otp;
  if (typeof phoneNumber !== 'string' || typeof otp !== 'string') return json(400);

  try {
    await sendWithSmsEthiopia({ phoneNumber, otp }, apiKey);
    return json(200);
  } catch (error) {
    const status = error instanceof SmsEthiopiaDeliveryError ? error.status : 502;
    console.error('SMSEthiopia rejected an authentication message.', { status });
    return json(status >= 400 && status < 600 ? status : 502);
  }
});
