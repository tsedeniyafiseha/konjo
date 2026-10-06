import type { AdminAuditStore, Clock, IdGenerator } from './ports.ts';

export class RecordAdminExportAudit {
  private readonly store: AdminAuditStore;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;
  constructor(store: AdminAuditStore, ids: IdGenerator, clock: Clock) { this.store = store; this.ids = ids; this.clock = clock; }
  async execute(adminId: string, exportType: 'bookings' | 'payouts' | 'revenue' | 'professionals', count: number): Promise<void> {
    const targets = { bookings: 'booking', payouts: 'payout', revenue: 'payment', professionals: 'professional' } as const;
    await this.store.record({ auditId: this.ids.next(), adminId, action: `${exportType}.exported`, targetType: targets[exportType], targetId: null, metadata: { count }, occurredAt: this.clock.now().toISOString() });
  }
}
