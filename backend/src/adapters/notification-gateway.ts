import { randomUUID } from 'node:crypto';

import type { NotificationDeliveryJob } from '../application/contracts.ts';
import type { NotificationGateway } from '../application/ports.ts';
import { notificationLanguage, renderNotification } from './notification-copy.ts';

interface NotificationGatewayConfig {
  mode: 'development' | 'provider';
  deliveryUrl: string | null;
  deliveryToken: string | null;
  smsEthiopiaApiKey?: string | null;
  /** Optional Expo access token (enhanced push security). */
  expoAccessToken?: string | null;
}

const SMS_ETHIOPIA_ENDPOINT = 'https://smsethiopia.com/api/sms/send';
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

function isExpoPushToken(value: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(value);
}

/**
 * Delivers one job through Expo's push service. The in-app inbox already holds
 * the record, so push is the "wake the phone" layer on top of it.
 */
async function deliverExpoPush(job: NotificationDeliveryJob, accessToken: string | null | undefined): Promise<string> {
  if (job.pushTicket) {
    const response = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ ids: [job.pushTicket] }), signal: AbortSignal.timeout(10_000),
    });
    const result = await response.json().catch(() => null) as { data?: Record<string, { status?: string; details?: { error?: string } }> } | null;
    if (!response.ok) throw new Error('Expo push receipts are unavailable.');
    const receipt = result?.data?.[job.pushTicket];
    if (!receipt) {
      if (job.pushTicketStartedAt && Date.now() - Date.parse(job.pushTicketStartedAt) > 24 * 60 * 60_000) throw new Error('Push receipt expired without confirmation.');
      return `expo-ticket:${job.pushTicket}`;
    }
    if (receipt.status !== 'ok') throw new Error(receipt.details?.error === 'DeviceNotRegistered' ? 'DeviceNotRegistered' : 'Expo reported a push delivery failure.');
    return job.pushTicket;
  }
  const language = notificationLanguage(job.payload.language ?? job.language);
  const rendered = renderNotification(job.template, job.payload, language);
  let response: Response;
  try {
    response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        to: job.destination,
        title: rendered.title,
        body: rendered.body,
        sound: 'default',
        priority: 'high',
        channelId: 'bookings',
        data: { template: job.template, notificationId: job.id, ...job.payload },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('The Expo push service could not be reached.');
  }
  const result = await response.json().catch(() => null) as {
    data?: { status?: string; id?: string; message?: string; details?: { error?: string } };
    errors?: Array<{ message?: string }>;
  } | null;
  if (!response.ok || result?.errors?.length) {
    throw new Error(`The Expo push service rejected the notification: ${result?.errors?.[0]?.message ?? response.status}`);
  }
  const ticket = result?.data;
  if (ticket?.status === 'error') {
    if (ticket.details?.error === 'DeviceNotRegistered') throw new Error('DeviceNotRegistered');
    throw new Error(`The Expo push service could not deliver: ${ticket.message ?? ticket.details?.error ?? 'unknown error'}`);
  }
  if (ticket?.status !== 'ok' || typeof ticket.id !== 'string') throw new Error('Expo returned an invalid push ticket.');
  return `expo-ticket:${ticket.id}`;
}
const approvalMessages = {
  en: 'Konjo: Your professional application is approved. You can now sign in and use your professional dashboard.',
  am: 'Konjo: የባለሙያ ማመልከቻዎ ጸድቋል። አሁን ገብተው የባለሙያ ዳሽቦርድዎን መጠቀም ይችላሉ።',
  om: 'Konjo: Iyyannoon ogeessummaa keessanii mirkanaa’eera. Amma seentanii daashboordii ogeessaa fayyadamuu dandeessu.',
} as const;
const rejectionMessages = {
  en: 'Konjo: Your professional application was not approved.',
  am: 'Konjo: የባለሙያ ማመልከቻዎ አልጸደቀም።',
  om: 'Konjo: Iyyannoon ogeessummaa keessanii hin mirkanoofne.',
} as const;
const newBookingRequestMessages = {
  en: 'Konjo: A client wants to book you. Open the Konjo app to see the request and accept or decline before it expires.',
  am: 'Konjo: አንድ ደንበኛ ቦታ ማስያዝ ይፈልጋል። ጥያቄውን ለማየት እና ከማለፉ በፊት ለመቀበል ወይም ለመተው የKonjo መተግበሪያን ይክፈቱ።',
  om: 'Konjo: Maamilli tokko isin beellamachuu barbaada. Gaaffii ilaaluu fi yeroon osoo hin darbin fudhachuuf ykn diduuf appii Konjo banaa.',
} as const;
const rejectionFollowUp = {
  en: 'Open the Konjo app to update and resubmit.',
  am: 'ለማስተካከልና እንደገና ለማስገባት የKonjo መተግበሪያን ይክፈቱ።',
  om: 'Sirreessuuf fi irra deebi’anii galchuuf appii Konjo banaa.',
} as const;

function messageLanguage(payload: Record<string, unknown>): 'en' | 'am' | 'om' {
  return payload.language === 'am' || payload.language === 'om' ? payload.language : 'en';
}

function smsEthiopiaMsisdn(phoneNumber: string): string {
  const normalized = phoneNumber.replace(/[\s()+-]/g, '');
  if (!/^251[79]\d{8}$/.test(normalized)) {
    throw new Error('The SMS destination is not a valid Ethiopian mobile number.');
  }
  return normalized;
}

function smsMessage(template: string, payload: Record<string, unknown>): string {
  const language = messageLanguage(payload);
  if (template === 'professional_application_approved') return approvalMessages[language];
  if (template === 'new_booking_request') return newBookingRequestMessages[language];
  if (template === 'professional_application_rejected') {
    const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
    return [rejectionMessages[language], reason, rejectionFollowUp[language]]
      .filter(Boolean)
      .join(' ');
  }
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
  throw new Error(`The SMS template ${template} is not supported.`);
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

async function deliverSmsEthiopia(
  destination: string,
  template: string,
  payload: Record<string, unknown>,
  apiKey: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(SMS_ETHIOPIA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', KEY: apiKey },
      body: JSON.stringify({
        msisdn: smsEthiopiaMsisdn(destination),
        text: smsMessage(template, payload),
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('destination')) throw error;
    throw new Error('SMSEthiopia could not be reached.');
  }
  const result = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !providerAccepted(result)) {
    throw new Error('SMSEthiopia rejected the notification.');
  }
  const reference = result?.reference ?? result?.messageId ?? result?.message_id ?? result?.id;
  return typeof reference === 'string' || typeof reference === 'number'
    ? String(reference)
    : `sms_ethiopia_${randomUUID()}`;
}

export function createNotificationGateway(config: NotificationGatewayConfig): NotificationGateway {
  return {
    async deliver(job) {
      // Push records double as the in-app inbox: without a device token the
      // record is still visible in the app, so it counts as delivered there.
      if (job.channel === 'push' && !job.destination) return `inbox_${randomUUID()}`;
      if (!job.destination) throw new Error(`No ${job.channel} destination is registered.`);
      if (config.mode === 'development') {
        if (job.destination.startsWith('fail:')) {
          throw new Error('The development notification failure was requested.');
        }
        return `notification_sandbox_${randomUUID()}`;
      }
      if (job.channel === 'push' && isExpoPushToken(job.destination)) {
        return await deliverExpoPush(job, config.expoAccessToken);
      }
      if (job.channel === 'sms' && config.smsEthiopiaApiKey) {
        return await deliverSmsEthiopia(
          job.destination,
          job.template,
          // Text the professional in their own language, like push notifications do.
          { ...job.payload, language: job.payload.language ?? job.language },
          config.smsEthiopiaApiKey,
        );
      }
      if (!config.deliveryUrl || !config.deliveryToken) {
        if (job.channel === 'push') return `inbox_${randomUUID()}`;
        throw new Error('The notification delivery provider is not configured.');
      }

      let response: Response;
      try {
        response = await fetch(config.deliveryUrl, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${config.deliveryToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            channel: job.channel,
            destination: job.destination,
            template: job.template,
            payload: job.payload,
            idempotencyKey: job.id,
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new Error('The notification provider could not be reached.');
      }
      if (!response.ok) throw new Error('The notification provider rejected the delivery.');
      const result = await response.json().catch(() => null) as { reference?: unknown } | null;
      return typeof result?.reference === 'string' ? result.reference : `notification_${randomUUID()}`;
    },
  };
}
