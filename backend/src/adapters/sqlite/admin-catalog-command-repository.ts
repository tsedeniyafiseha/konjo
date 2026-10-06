import type { DatabaseSync } from 'node:sqlite';

import type {
  ApiAdminBroadcast,
  ApiAdminPlatformSettings,
  ApiAdminZone,
  ApiPromotion,
  ApiServiceCategory,
} from '../../../../shared/api-contracts.ts';
import type {
  AdminCatalogCommandResults,
  AdminCommandContext,
  CreateBroadcastStoreInput,
  CreatePromotionStoreInput,
  SetPromotionActiveStoreInput,
  UpdateCommissionStoreInput,
  UpdateTravelFeeCapStoreInput,
  UpsertServiceCategoryStoreInput,
  UpsertZoneStoreInput,
} from '../../application/contracts.ts';
import type { AdminCatalogCommandStore } from '../../application/ports.ts';
import type { SqliteNotificationOutbox } from './notification-outbox.ts';
import { platformSettingKeys, readPlatformSettings } from './platform-settings.ts';
import { SqliteUnitOfWork } from './unit-of-work.ts';

export class SqliteAdminCatalogCommandRepository implements AdminCatalogCommandStore {
  private readonly database: DatabaseSync;
  private readonly notifications: SqliteNotificationOutbox;
  private readonly unitOfWork: SqliteUnitOfWork;

  constructor(
    database: DatabaseSync,
    notifications: SqliteNotificationOutbox,
    unitOfWork = new SqliteUnitOfWork(database),
  ) {
    this.database = database;
    this.notifications = notifications;
    this.unitOfWork = unitOfWork;
  }

  upsertCategory(input: UpsertServiceCategoryStoreInput): AdminCatalogCommandResults['category'] {
    return this.unitOfWork.run(() => {
      this.database.prepare(`
        INSERT INTO service_categories (id, slug, name, active, sort_order, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          name = excluded.name,
          active = excluded.active,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
      `).run(input.id, input.slug, input.name, input.active ? 1 : 0, input.sortOrder, input.occurredAt);
      this.insertAudit(input, 'service_category.updated', 'service_category', input.id, {
        slug: input.slug,
        name: input.name,
        active: input.active,
        sortOrder: input.sortOrder,
      });
      const category: ApiServiceCategory = {
        id: input.id,
        slug: input.slug,
        name: input.name,
        active: input.active,
        sortOrder: input.sortOrder,
        updatedAt: input.occurredAt,
      };
      return category;
    });
  }

  updateCommission(input: UpdateCommissionStoreInput): AdminCatalogCommandResults['settings'] {
    return this.unitOfWork.run(() => {
      this.database.prepare(`
        UPDATE platform_settings SET value_integer = ?, updated_at = ? WHERE key = 'commission_rate_bps'
      `).run(input.commissionRateBps, input.occurredAt);
      this.insertAudit(input, 'commission_rate.updated', 'platform_setting', 'commission_rate_bps', {
        commissionRateBps: input.commissionRateBps,
      });
      return readPlatformSettings(this.database);
    });
  }

  updateTravelFeeCap(input: UpdateTravelFeeCapStoreInput): AdminCatalogCommandResults['settings'] {
    return this.unitOfWork.run(() => {
      this.database.prepare(`
        INSERT INTO platform_settings (key, value_integer, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value_integer = excluded.value_integer, updated_at = excluded.updated_at
      `).run(platformSettingKeys.travelFeeCap, input.travelFeeCap, input.occurredAt);
      this.insertAudit(input, 'travel_fee_cap.updated', 'platform_setting', platformSettingKeys.travelFeeCap, {
        travelFeeCap: input.travelFeeCap,
      });
      const settings: ApiAdminPlatformSettings = readPlatformSettings(this.database);
      return settings;
    });
  }

  upsertZone(input: UpsertZoneStoreInput): AdminCatalogCommandResults['zone'] {
    return this.unitOfWork.run(() => {
      this.database.prepare(`
        INSERT INTO service_zones (id, label, travel_fee, active, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          travel_fee = excluded.travel_fee,
          active = excluded.active,
          updated_at = excluded.updated_at
      `).run(input.id, input.label, input.travelFee, input.active ? 1 : 0, input.occurredAt);
      this.insertAudit(input, 'zone.updated', 'zone', input.id, {
        travelFee: input.travelFee,
        active: input.active,
      });
      const zone: ApiAdminZone = {
        id: input.id,
        label: input.label,
        travelFee: input.travelFee,
        active: input.active,
        updatedAt: input.occurredAt,
      };
      return zone;
    });
  }

  createPromotion(input: CreatePromotionStoreInput): AdminCatalogCommandResults['promotion'] {
    return this.unitOfWork.run(() => {
      const promotion: ApiPromotion = {
        id: input.promotionId,
        code: input.code.toUpperCase(),
        description: input.description,
        discountPercent: input.discountPercent,
        active: input.active,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdAt: input.occurredAt,
      };
      this.database.prepare(`
        INSERT INTO promotions (
          id, code, description, discount_percent, active, starts_at, ends_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        promotion.id,
        promotion.code,
        promotion.description,
        promotion.discountPercent,
        promotion.active ? 1 : 0,
        promotion.startsAt,
        promotion.endsAt,
        promotion.createdAt,
        promotion.createdAt,
      );
      this.insertAudit(input, 'promotion.created', 'promotion', promotion.id, { code: promotion.code });
      return promotion;
    });
  }

  setPromotionActive(input: SetPromotionActiveStoreInput): AdminCatalogCommandResults['promotion'] | null {
    return this.unitOfWork.run(() => {
      const updated = this.database.prepare(`
        UPDATE promotions SET active = ?, updated_at = ? WHERE id = ?
      `).run(input.active ? 1 : 0, input.occurredAt, input.promotionId);
      if (updated.changes !== 1) {
        return null;
      }
      const row = this.database.prepare('SELECT * FROM promotions WHERE id = ?')
        .get(input.promotionId) as unknown as {
          id: string;
          code: string;
          description: string;
          discount_percent: number;
          active: number;
          starts_at: string;
          ends_at: string;
          created_at: string;
        };
      const promotion: ApiPromotion = {
        id: row.id,
        code: row.code,
        description: row.description,
        discountPercent: row.discount_percent,
        active: row.active === 1,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        createdAt: row.created_at,
      };
      this.insertAudit(input, 'promotion.updated', 'promotion', promotion.id, { active: promotion.active });
      return promotion;
    });
  }

  createBroadcast(input: CreateBroadcastStoreInput): AdminCatalogCommandResults['broadcast'] {
    return this.unitOfWork.run(() => {
      const users = (input.audience === 'all'
        ? this.database.prepare('SELECT id FROM users').all()
        : this.database.prepare('SELECT id FROM users WHERE role = ?')
          .all(input.audience === 'clients' ? 'client' : 'professional')
      ) as unknown as Array<{ id: string }>;
      const broadcast: ApiAdminBroadcast = {
        id: input.broadcastId,
        audience: input.audience,
        message: input.message,
        recipientCount: users.length,
        createdAt: input.occurredAt,
      };
      this.database.prepare(`
        INSERT INTO admin_broadcasts (id, admin_id, audience, message, recipient_count, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        broadcast.id,
        input.adminId,
        broadcast.audience,
        broadcast.message,
        broadcast.recipientCount,
        broadcast.createdAt,
      );
      for (const user of users) {
        this.notifications.enqueueNotification(
          user.id,
          `broadcast:${broadcast.id}:${user.id}`,
          'push',
          'admin_broadcast',
          { broadcastId: broadcast.id, message: broadcast.message },
          broadcast.createdAt,
        );
      }
      this.insertAudit(input, 'broadcast.created', 'broadcast', broadcast.id, {
        audience: broadcast.audience,
        recipients: broadcast.recipientCount,
      });
      return broadcast;
    });
  }

  private insertAudit(
    context: AdminCommandContext,
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ): void {
    this.database.prepare(`
      INSERT INTO admin_audit_logs (
        id, admin_id, action, target_type, target_id, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      context.auditId,
      context.adminId,
      action,
      targetType,
      targetId,
      JSON.stringify(metadata),
      context.occurredAt,
    );
  }
}
