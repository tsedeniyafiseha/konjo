/**
 * How Konjo pays a professional. Collected once at registration, editable from
 * the professional's profile, snapshotted onto every payout batch so the
 * operations team always knows where that batch went. Mirrors
 * private.payout_method_from_payload in Postgres: keep the two in step.
 */
export const payoutMethodTypes = ['telebirr', 'cbe_birr', 'bank'] as const;
export type PayoutMethodType = (typeof payoutMethodTypes)[number];

export interface PayoutMethod {
  type: PayoutMethodType;
  /** Name on the wallet or bank account, as the provider shows it. */
  accountName: string;
  /** +2519XXXXXXXX for wallets; the account number for banks. */
  accountNumber: string;
  /** Bank name; only for type 'bank'. */
  bankName?: string;
}

const ETHIOPIAN_MOBILE = /^(?:\+251|251|0)?(9\d{8})$/;
const BANK_ACCOUNT = /^\d{6,24}$/;

export function isPayoutMethodType(value: unknown): value is PayoutMethodType {
  return typeof value === 'string' && (payoutMethodTypes as readonly string[]).includes(value);
}

/** Normalises any Ethiopian mobile spelling to +2519XXXXXXXX, or null when it is not one. */
export function normalizeEthiopianMobile(value: string): string | null {
  const digits = value.replace(/[\s()-]/g, '');
  const match = ETHIOPIAN_MOBILE.exec(digits);
  return match ? `+251${match[1]}` : null;
}

/**
 * Returns a clean payout method or null when the input is incomplete or
 * invalid. Used by the app to gate registration and by the API to validate.
 */
export function normalizePayoutMethod(input: unknown): PayoutMethod | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  if (!isPayoutMethodType(candidate.type)) return null;
  const accountName = typeof candidate.accountName === 'string' ? candidate.accountName.trim() : '';
  if (accountName.length < 2 || accountName.length > 80) return null;
  const rawNumber = typeof candidate.accountNumber === 'string' ? candidate.accountNumber.trim() : '';
  if (candidate.type === 'bank') {
    const bankName = typeof candidate.bankName === 'string' ? candidate.bankName.trim() : '';
    const accountNumber = rawNumber.replace(/[\s-]/g, '');
    if (bankName.length < 2 || bankName.length > 60 || !BANK_ACCOUNT.test(accountNumber)) return null;
    return { type: 'bank', accountName, accountNumber, bankName };
  }
  const accountNumber = normalizeEthiopianMobile(rawNumber);
  if (!accountNumber) return null;
  return { type: candidate.type, accountName, accountNumber };
}

/** Short human label, e.g. "Telebirr · +251911…234" or "CBE · Awash Bank ····1234". */
export function describePayoutMethod(method: PayoutMethod | null | undefined): string {
  if (!method) return 'Not provided';
  const tail = method.accountNumber.slice(-4);
  if (method.type === 'bank') return `${method.bankName ?? 'Bank'} ····${tail} · ${method.accountName}`;
  const provider = method.type === 'telebirr' ? 'Telebirr' : 'CBE Birr';
  return `${provider} ${method.accountNumber} · ${method.accountName}`;
}
