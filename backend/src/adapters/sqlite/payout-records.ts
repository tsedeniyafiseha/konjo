import type { ApiPayoutBatch, ApiProfessionalPayoutMethod } from '../../../../shared/api-contracts.ts';

export interface PayoutRow {
  id: string;
  professional_id: string;
  status: ApiPayoutBatch['status'];
  amount: number;
  booking_count: number;
  version: number;
  created_at: string;
  paid_at: string | null;
  payout_method_json?: string | null;
  paid_reference?: string | null;
  paid_note?: string | null;
  paid_by?: string | null;
}

/** '{}' means the professional had not registered a payout method when the batch was prepared. */
export function parsePayoutMethod(json: string | null | undefined): ApiProfessionalPayoutMethod | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Record<string, unknown> | null;
    return parsed && typeof parsed === 'object' && typeof parsed.type === 'string'
      ? parsed as unknown as ApiProfessionalPayoutMethod
      : null;
  } catch {
    return null;
  }
}

export function toApiPayoutBatch(row: PayoutRow): ApiPayoutBatch {
  return {
    id: row.id,
    professionalId: row.professional_id,
    status: row.status,
    amount: row.amount,
    bookingCount: row.booking_count,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    payoutMethod: parsePayoutMethod(row.payout_method_json),
    paidReference: row.paid_reference ?? null,
    paidNote: row.paid_note ?? null,
  };
}
