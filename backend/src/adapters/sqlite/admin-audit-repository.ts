import type { DatabaseSync } from 'node:sqlite';
import type { AdminAuditStore } from '../../application/ports.ts';

export class SqliteAdminAuditRepository implements AdminAuditStore {
  private readonly database: DatabaseSync;
  constructor(database: DatabaseSync) { this.database = database; }
  record(input: Parameters<AdminAuditStore['record']>[0]): void {
    this.database.prepare('INSERT INTO admin_audit_logs (id, admin_id, action, target_type, target_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(input.auditId, input.adminId, input.action, input.targetType, input.targetId, JSON.stringify(input.metadata), input.occurredAt);
  }
}
