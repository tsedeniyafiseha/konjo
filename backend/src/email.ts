import type { MultipartFile } from './multipart.ts';

interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo: string;
  attachments?: ReadonlyArray<MultipartFile>;
}

export type EmailDeliveryStatus = 'sent' | 'stored';

export async function sendEmail(message: EmailMessage): Promise<EmailDeliveryStatus> {
  const apiKey = process.env.KONJO_RESEND_API_KEY?.trim();
  const from = process.env.KONJO_EMAIL_FROM?.trim();
  if (!apiKey || !from) return 'stored';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      reply_to: message.replyTo,
      attachments: message.attachments?.map((file) => ({
        filename: file.fileName.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'attachment',
        content: file.data.toString('base64'),
      })),
    }),
  });

  if (!response.ok) throw new Error(`Email provider returned ${response.status}.`);
  return 'sent';
}
