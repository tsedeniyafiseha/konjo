/**
 * Push and inbox copy for manual payouts. The admin dashboard prepares a
 * payout batch (PayoutQueued) and, after sending the money by hand, marks it
 * paid (PayoutPaid). Both notify the professional; the body carries the
 * amount so the message stands on its own. Shared by the API renderer and the
 * app inbox so push and inbox always read the same.
 */
export type PayoutNotificationLanguage = 'en' | 'am' | 'om';

interface Message {
  title: string;
  /** May contain {amount}; replaced with the ETB amount when the payload carries one. */
  body: string;
}

export const payoutNotificationCopy: Record<string, Record<PayoutNotificationLanguage, Message>> = {
  payout_queued: {
    en: { title: 'Payout on its way', body: 'Konjo is sending ETB {amount} to your payout account. You will be notified when it is paid.' },
    am: { title: 'ክፍያዎ በመንገድ ላይ ነው', body: 'Konjo ETB {amount} ወደ የክፍያ ሂሳብዎ በመላክ ላይ ነው። ሲከፈል ይነገርዎታል።' },
    om: { title: 'Kaffaltiin keessan karaa irra jira', body: 'Konjo ETB {amount} gara herrega kaffaltii keessaniitti ergaa jira. Yeroo kaffalamu isin beeksifna.' },
  },
  payout_paid: {
    en: { title: 'Payout sent', body: 'ETB {amount} was sent to your payout account. Open Konjo to see the transfer reference.' },
    am: { title: 'ክፍያ ተልኳል', body: 'ETB {amount} ወደ የክፍያ ሂሳብዎ ተልኳል። የማስተላለፊያ ማጣቀሻውን ለማየት Konjoን ይክፈቱ።' },
    om: { title: 'Kaffaltiin ergameera', body: 'ETB {amount} gara herrega kaffaltii keessaniitti ergameera. Lakkoofsa dabarsaa ilaaluuf Konjo banaa.' },
  },
};

/** Stands in for "ETB {amount}" when a payload carries no amount. */
const earningsWord: Record<PayoutNotificationLanguage, string> = { en: 'your earnings', am: 'ገቢዎ', om: 'galii keessan' };

export function isPayoutNotificationTemplate(template: string): boolean {
  return Object.prototype.hasOwnProperty.call(payoutNotificationCopy, template);
}

/** Rendered payout copy in the given language, or null when the template is not a payout one. */
export function renderPayoutNotification(
  template: string,
  payload: Record<string, unknown> | null | undefined,
  language: PayoutNotificationLanguage,
): Message | null {
  const selected = payoutNotificationCopy[template]?.[language];
  if (!selected) return null;
  const amount = typeof payload?.amount === 'number' && Number.isFinite(payload.amount) ? payload.amount : null;
  const body = amount === null
    ? selected.body.replace('ETB {amount}', earningsWord[language])
    : selected.body.replace('{amount}', amount.toLocaleString('en-US'));
  return { title: selected.title, body: body.charAt(0).toUpperCase() + body.slice(1) };
}
