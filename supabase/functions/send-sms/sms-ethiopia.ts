export const SMS_ETHIOPIA_ENDPOINT = 'https://smsethiopia.com/api/sms/send';

type FetchLike = typeof fetch;

export class SmsEthiopiaDeliveryError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'SmsEthiopiaDeliveryError';
    this.status = status;
  }
}

export function toSmsEthiopiaMsisdn(phoneNumber: string): string {
  const normalized = phoneNumber.replace(/[\s()-]/g, '').replace(/^\+/, '');
  if (!/^251[79]\d{8}$/.test(normalized)) {
    throw new SmsEthiopiaDeliveryError('The SMS recipient is not a valid Ethiopian mobile number.', 400);
  }
  return normalized;
}

export function konjoOtpMessage(otp: string): string {
  if (!/^\d{6}$/.test(otp)) {
    throw new SmsEthiopiaDeliveryError('The authentication code is invalid.', 400);
  }
  return `Your Konjo verification code is ${otp}. It expires soon. Never share this code.`;
}

function providerAccepted(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return true;
  const result = payload as Record<string, unknown>;
  if (result.sent === true) return true;
  if (typeof result.status === 'string') {
    return ['success', 'accepted', 'sent'].includes(result.status.toLowerCase());
  }
  return !('error' in result) && !('code' in result);
}

export async function sendWithSmsEthiopia(
  input: { phoneNumber: string; otp: string },
  apiKey: string,
  fetcher: FetchLike = fetch,
): Promise<void> {
  if (!apiKey.trim()) throw new SmsEthiopiaDeliveryError('The SMS provider is not configured.', 500);

  let response: Response;
  try {
    response = await fetcher(SMS_ETHIOPIA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        KEY: apiKey,
      },
      signal: AbortSignal.timeout(3_500),
      body: JSON.stringify({
        msisdn: toSmsEthiopiaMsisdn(input.phoneNumber),
        text: konjoOtpMessage(input.otp),
      }),
    });
  } catch {
    throw new SmsEthiopiaDeliveryError('The SMS provider could not be reached.');
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !providerAccepted(payload)) {
    throw new SmsEthiopiaDeliveryError('The SMS provider rejected the verification message.');
  }
}
