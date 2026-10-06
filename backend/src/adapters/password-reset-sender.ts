import { EmailDeliveryError, type PasswordResetSender } from '../application/ports.ts';

interface PasswordResetSenderConfig {
  mode: 'development' | 'provider';
  deliveryUrl: string | null;
  deliveryToken: string | null;
  resetUrl: string;
}

export function createPasswordResetSender(config: PasswordResetSenderConfig): PasswordResetSender {
  return {
    async send(email, token) {
      if (config.mode === 'development') return;
      if (!config.deliveryUrl || !config.deliveryToken) {
        throw new EmailDeliveryError('The email delivery provider is not configured.');
      }

      const resetUrl = new URL(config.resetUrl);
      resetUrl.searchParams.set('token', token);

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
            to: email,
            subject: 'Reset your Konjo password',
            text: `Reset your Konjo password using this secure link: ${resetUrl.toString()}`,
          }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new EmailDeliveryError('The email delivery provider could not be reached.');
      }

      if (!response.ok) {
        throw new EmailDeliveryError('The email delivery provider rejected the request.');
      }
    },
  };
}
