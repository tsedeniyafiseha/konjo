import { OtpDeliveryError, type OtpSender } from '../application/ports.ts';

interface OtpSenderConfig {
  mode: 'development' | 'provider';
  deliveryUrl: string | null;
  deliveryToken: string | null;
}

export function createOtpSender(config: OtpSenderConfig): OtpSender {
  return {
    async send(phoneNumber, code) {
      if (config.mode === 'development') return;
      if (!config.deliveryUrl || !config.deliveryToken) {
        throw new OtpDeliveryError('The OTP delivery provider is not configured.');
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
            phoneNumber,
            message: `Your Konjo verification code is ${code}. It expires in 5 minutes.`,
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new OtpDeliveryError('The OTP delivery provider could not be reached.');
      }

      if (!response.ok) {
        throw new OtpDeliveryError('The OTP delivery provider rejected the request.');
      }
    },
  };
}
