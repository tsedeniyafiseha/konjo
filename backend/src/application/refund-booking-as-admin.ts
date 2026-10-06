import type { AdminRefundResult } from './contracts.ts';
import type { AdminRefundStore, Clock, IdGenerator } from './ports.ts';

export class RefundBookingAsAdminHandler {
  private readonly refunds: AdminRefundStore;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;

  constructor(refunds: AdminRefundStore, ids: IdGenerator, clock: Clock) {
    this.refunds = refunds;
    this.ids = ids;
    this.clock = clock;
  }

  async execute(adminId: string, bookingId: string): Promise<AdminRefundResult> {
    return await this.refunds.refundBooking({
      auditId: this.ids.next(),
      adminId,
      bookingId,
      occurredAt: this.clock.now().toISOString(),
    });
  }
}
