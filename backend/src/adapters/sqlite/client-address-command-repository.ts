import type { DatabaseSync } from 'node:sqlite';
import type { ClientAddressCommandResult, CreateClientAddressStoreInput, SelectClientAddressStoreInput, UpdateClientAddressStoreInput } from '../../application/contracts.ts';
import type { ClientAddressCommandStore } from '../../application/ports.ts';
import { type ClientAddressRow, toApiClientAddress } from './client-records.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqliteClientAddressCommandRepository implements ClientAddressCommandStore {
  private readonly database: DatabaseSync;
  private readonly unitOfWork: SqliteUnitOfWork;
  constructor(database: DatabaseSync, unitOfWork = new SqliteUnitOfWork(database)) {
    this.database = database;
    this.unitOfWork = unitOfWork;
  }

  createAddress(input: CreateClientAddressStoreInput): ClientAddressCommandResult {
    const zone = this.zone(input.zone);
    if (!zone) return { result: 'service_zone_unavailable' };
    const count = this.database.prepare('SELECT COUNT(*) AS count FROM client_addresses WHERE client_id = ?').get(input.userId) as unknown as { count: number };
    const isDefault = input.makeDefault || count.count === 0;
    return this.unitOfWork.run(() => {
      if (isDefault) this.database.prepare('UPDATE client_addresses SET is_default = 0, updated_at = ? WHERE client_id = ?').run(input.occurredAt, input.userId);
      this.database.prepare(`INSERT INTO client_addresses (id, client_id, label, zone, detail, fee, is_default, latitude, longitude, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(input.addressId, input.userId, input.label, zone.label, input.detail, zone.travel_fee, isDefault ? 1 : 0, input.latitude ?? null, input.longitude ?? null, input.occurredAt, input.occurredAt);
      const address = this.read(input.addressId)!;
      return { result: 'updated', address };
    });
  }

  updateAddress(input: UpdateClientAddressStoreInput): ClientAddressCommandResult {
    const zone = this.zone(input.zone);
    if (!zone) return { result: 'service_zone_unavailable' };
    const result = this.database.prepare(`UPDATE client_addresses SET label = ?, zone = ?, detail = ?, fee = ?, latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude), updated_at = ? WHERE id = ? AND client_id = ?`)
      .run(input.label, zone.label, input.detail, zone.travel_fee, input.latitude ?? null, input.longitude ?? null, input.occurredAt, input.addressId, input.userId);
    const address = result.changes === 1 ? this.read(input.addressId) : null;
    return address ? { result: 'updated', address } : { result: 'not_found' };
  }

  deleteAddress(input: SelectClientAddressStoreInput): boolean {
    const row = this.database.prepare('SELECT * FROM client_addresses WHERE id = ? AND client_id = ?').get(input.addressId, input.userId) as unknown as ClientAddressRow | undefined;
    if (!row) return false;
    return this.unitOfWork.run(() => {
      this.database.prepare('DELETE FROM client_addresses WHERE id = ? AND client_id = ?').run(input.addressId, input.userId);
      if (row.is_default === 1) {
        const next = this.database.prepare('SELECT id FROM client_addresses WHERE client_id = ? ORDER BY created_at ASC LIMIT 1').get(input.userId) as unknown as { id: string } | undefined;
        if (next) this.database.prepare('UPDATE client_addresses SET is_default = 1, updated_at = ? WHERE id = ?').run(input.occurredAt, next.id);
      }
      return true;
    });
  }

  setDefaultAddress(input: SelectClientAddressStoreInput): boolean {
    const exists = this.database.prepare('SELECT id FROM client_addresses WHERE id = ? AND client_id = ?').get(input.addressId, input.userId);
    if (!exists) return false;
    return this.unitOfWork.run(() => {
      this.database.prepare('UPDATE client_addresses SET is_default = 0, updated_at = ? WHERE client_id = ?').run(input.occurredAt, input.userId);
      this.database.prepare('UPDATE client_addresses SET is_default = 1, updated_at = ? WHERE id = ?').run(input.occurredAt, input.addressId);
      return true;
    });
  }

  private zone(label: string) { return this.database.prepare('SELECT label, travel_fee FROM service_zones WHERE lower(label) = lower(?) AND active = 1').get(label) as unknown as { label: string; travel_fee: number } | undefined; }
  private read(id: string) { const row = this.database.prepare('SELECT * FROM client_addresses WHERE id = ?').get(id) as unknown as ClientAddressRow | undefined; return row ? toApiClientAddress(row) : null; }
}
