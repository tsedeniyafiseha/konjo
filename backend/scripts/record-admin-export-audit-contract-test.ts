import assert from 'node:assert/strict';
import { RecordAdminExportAudit } from '../src/application/record-admin-export-audit.ts';
import type { AdminAuditStore, Clock, IdGenerator } from '../src/application/ports.ts';

const now = new Date('2026-09-19T02:00:00.000Z');
let recorded: unknown;
const store: AdminAuditStore = { record(input) { recorded = input; } };
const ids: IdGenerator = { next: () => 'audit-1' };
const clock: Clock = { now: () => now };
await new RecordAdminExportAudit(store, ids, clock).execute('admin-1', 'revenue', 42);
assert.deepEqual(recorded, { auditId: 'audit-1', adminId: 'admin-1', action: 'revenue.exported', targetType: 'payment', targetId: null, metadata: { count: 42 }, occurredAt: now.toISOString() });
console.log('Administrator export audit contract passed.');
