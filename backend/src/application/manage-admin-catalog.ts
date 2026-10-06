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
} from './contracts.ts';
import type { AdminCatalogCommandStore, Clock, IdGenerator } from './ports.ts';

type CategoryInput = Omit<UpsertServiceCategoryStoreInput, keyof AdminCommandContext>;
type CommissionInput = Omit<UpdateCommissionStoreInput, keyof AdminCommandContext>;
type TravelFeeCapInput = Omit<UpdateTravelFeeCapStoreInput, keyof AdminCommandContext>;
type ZoneInput = Omit<UpsertZoneStoreInput, keyof AdminCommandContext>;
type PromotionInput = Omit<CreatePromotionStoreInput, keyof AdminCommandContext | 'promotionId'>;
type PromotionStateInput = Omit<SetPromotionActiveStoreInput, keyof AdminCommandContext>;
type BroadcastInput = Omit<CreateBroadcastStoreInput, keyof AdminCommandContext | 'broadcastId'>;

export class ManageAdminCatalog {
  private readonly store: AdminCatalogCommandStore;
  private readonly ids: IdGenerator;
  private readonly clock: Clock;

  constructor(store: AdminCatalogCommandStore, ids: IdGenerator, clock: Clock) {
    this.store = store;
    this.ids = ids;
    this.clock = clock;
  }

  async upsertCategory(adminId: string, input: CategoryInput): Promise<AdminCatalogCommandResults['category']> {
    return await this.store.upsertCategory({ ...this.context(adminId), ...input });
  }

  async updateCommission(adminId: string, input: CommissionInput): Promise<AdminCatalogCommandResults['settings']> {
    return await this.store.updateCommission({ ...this.context(adminId), ...input });
  }

  async updateTravelFeeCap(adminId: string, input: TravelFeeCapInput): Promise<AdminCatalogCommandResults['settings']> {
    return await this.store.updateTravelFeeCap({ ...this.context(adminId), ...input });
  }

  async upsertZone(adminId: string, input: ZoneInput): Promise<AdminCatalogCommandResults['zone']> {
    return await this.store.upsertZone({ ...this.context(adminId), ...input });
  }

  async createPromotion(adminId: string, input: PromotionInput): Promise<AdminCatalogCommandResults['promotion']> {
    return await this.store.createPromotion({
      ...this.context(adminId),
      ...input,
      promotionId: this.ids.next(),
    });
  }

  async setPromotionActive(
    adminId: string,
    input: PromotionStateInput,
  ): Promise<AdminCatalogCommandResults['promotion'] | null> {
    return await this.store.setPromotionActive({ ...this.context(adminId), ...input });
  }

  async createBroadcast(adminId: string, input: BroadcastInput): Promise<AdminCatalogCommandResults['broadcast']> {
    return await this.store.createBroadcast({
      ...this.context(adminId),
      ...input,
      broadcastId: this.ids.next(),
    });
  }

  private context(adminId: string): AdminCommandContext {
    return {
      auditId: this.ids.next(),
      adminId,
      occurredAt: this.clock.now().toISOString(),
    };
  }
}
