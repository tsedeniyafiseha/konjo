import type { ApiBookingPaymentSummary, ApiBookingStatus, ApiPaymentIntent } from './api-contracts.ts';

export function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * @param depositBase The amount the split deposit is half of: the booking
 * without extras named at checkout (service price, service fee, travel fee).
 * Extras land entirely on the balance, so adding them after the deposit never
 * re-opens the deposit stage. Defaults to the total for bookings without extras.
 */
export function bookingPaymentSummary(
  total: number,
  plan: 'full' | 'split',
  status: ApiBookingStatus,
  payments: ReadonlyArray<ApiPaymentIntent>,
  depositBase: number = total,
): ApiBookingPaymentSummary {
  const depositAmount = plan === 'split' ? Math.ceil(Math.round(depositBase * 100) / 2) / 100 : total;
  const paidAmount = money(payments.reduce((sum, payment) => sum + (
    payment.status === 'captured' || payment.status === 'cash_collected'
      ? payment.amount - payment.refundedAmount : 0
  ), 0));
  const depositPaid = paidAmount >= depositAmount;
  const fullyPaid = paidAmount >= total;
  const dueStage = status === 'accepted' && !depositPaid
    ? plan === 'split' ? 'deposit' : 'full'
    : status === 'completed' && depositPaid && !fullyPaid ? 'balance' : null;
  return {
    plan, depositAmount, balanceAmount: money(total - depositAmount), paidAmount,
    outstandingAmount: money(Math.max(0, total - paidAmount)), depositPaid, fullyPaid, dueStage,
  };
}
