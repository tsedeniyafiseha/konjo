import { supabaseServiceHeaders } from './supabase-service-headers.ts';
import type {
  AdminCatalogCommandResults,
  AdminRefundResult,
  AdminRefundStoreInput,
  CreateBroadcastStoreInput,
  CreatePromotionStoreInput,
  DevelopmentApproveProfessionalApplicationStoreInput,
  ReviewProfessionalApplicationStoreInput,
  SetAdminProfessionalStateStoreInput,
  SetPromotionActiveStoreInput,
  UpdateAdminProfessionalStoreInput,
  UpdateCommissionStoreInput,
  UpdateTravelFeeCapStoreInput,
  UpsertServiceCategoryStoreInput,
  UpsertZoneStoreInput,
  ProfessionalPayoutCommandResult,
  QueueAdminPayoutStoreInput,
  SettleAdminPayoutStoreInput,
} from '../application/contracts.ts';
import type {
  AdminAuditStore,
  AdminCatalogCommandStore,
  AdminPayoutCommandStore,
  AdminProfessionalCommandStore,
  AdminRefundStore,
} from '../application/ports.ts';

type JsonRecord = Record<string, unknown>;

export class SupabaseAdminOperationsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseAdminOperationsError';
  }
}

export class SupabaseAdminOperationsRepository
implements AdminCatalogCommandStore, AdminProfessionalCommandStore, AdminRefundStore, AdminAuditStore, AdminPayoutCommandStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(baseUrl: string, secretKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
  }

  async upsertCategory(input: UpsertServiceCategoryStoreInput): Promise<AdminCatalogCommandResults['category']> {
    return await this.rpc('upsert_admin_service_category', this.input(input)) as AdminCatalogCommandResults['category'];
  }

  async updateCommission(input: UpdateCommissionStoreInput): Promise<AdminCatalogCommandResults['settings']> {
    return await this.rpc('update_admin_commission', this.input(input)) as AdminCatalogCommandResults['settings'];
  }

  async updateTravelFeeCap(input: UpdateTravelFeeCapStoreInput): Promise<AdminCatalogCommandResults['settings']> {
    return await this.rpc('update_admin_travel_fee_cap', this.input(input)) as AdminCatalogCommandResults['settings'];
  }

  async queueAdminPayout(input: QueueAdminPayoutStoreInput): Promise<ProfessionalPayoutCommandResult> {
    return await this.rpc('queue_admin_payout', this.input(input)) as ProfessionalPayoutCommandResult;
  }

  async settleAdminPayout(input: SettleAdminPayoutStoreInput): Promise<ProfessionalPayoutCommandResult> {
    return await this.rpc('settle_admin_payout', this.input(input)) as ProfessionalPayoutCommandResult;
  }

  async upsertZone(input: UpsertZoneStoreInput): Promise<AdminCatalogCommandResults['zone']> {
    return await this.rpc('upsert_admin_zone', this.input(input)) as AdminCatalogCommandResults['zone'];
  }

  async createPromotion(input: CreatePromotionStoreInput): Promise<AdminCatalogCommandResults['promotion']> {
    return await this.rpc('create_admin_promotion', this.input(input)) as AdminCatalogCommandResults['promotion'];
  }

  async setPromotionActive(
    input: SetPromotionActiveStoreInput,
  ): Promise<AdminCatalogCommandResults['promotion'] | null> {
    return await this.rpc('set_admin_promotion_active', this.input(input)) as AdminCatalogCommandResults['promotion'] | null;
  }

  async createBroadcast(input: CreateBroadcastStoreInput): Promise<AdminCatalogCommandResults['broadcast']> {
    return await this.rpc('create_admin_broadcast', this.input(input)) as AdminCatalogCommandResults['broadcast'];
  }

  async approveForDevelopment(
    _input: DevelopmentApproveProfessionalApplicationStoreInput,
  ): Promise<null> {
    return null;
  }

  async reviewApplication(_input: ReviewProfessionalApplicationStoreInput): Promise<null> {
    throw new SupabaseAdminOperationsError('Application review uses the onboarding repository.');
  }

  async updateProfessional(input: UpdateAdminProfessionalStoreInput) {
    return await this.rpc('update_admin_professional', this.input(input)) as Awaited<ReturnType<AdminProfessionalCommandStore['updateProfessional']>>;
  }

  async setProfessionalState(input: SetAdminProfessionalStateStoreInput) {
    return await this.rpc('set_admin_professional_state', this.input(input)) as Awaited<ReturnType<AdminProfessionalCommandStore['setProfessionalState']>>;
  }

  async refundBooking(input: AdminRefundStoreInput): Promise<AdminRefundResult> {
    return await this.rpc('refund_admin_booking', this.input(input)) as AdminRefundResult;
  }

  async record(input: Parameters<AdminAuditStore['record']>[0]): Promise<void> {
    await this.rpc('record_admin_audit', this.input(input));
  }

  private input(value: object): JsonRecord {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      `p_${key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`,
      item,
    ]));
  }

  private async rpc(name: string, body: JsonRecord): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: supabaseServiceHeaders(this.secretKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
    } catch {
      throw new SupabaseAdminOperationsError('Supabase administrator operations are unavailable.');
    }
    if (!response.ok) {
      const detail = await response.text();
      if (detail.includes('promotions_code_key')) throw new SupabaseAdminOperationsError('PROMOTION_CODE_EXISTS');
      throw new SupabaseAdminOperationsError('Supabase rejected the administrator operation.');
    }
    if (response.status === 204) return null;
    return response.json();
  }
}
