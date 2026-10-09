import type {
  ApiClientRewards,
  ApiAccountRole,
  ApiAdminAuditLog,
  ApiAdminBooking,
  ApiAdminBroadcast,
  ApiAdminPlatformSettings,
  ApiAdminProfessional,
  ApiAdminProfessionalApplication,
  ApiAdminSummary,
  ApiAdminZone,
  ApiBooking,
  ApiBookingDispute,
  ApiBookingStatus,
  ApiClientData,
  ApiClientIdentityStatus,
  ApiDevicePlatform,
  ApiDeviceRegistration,
  ApiDomainEventDeadLetter,
  ApiNotificationRecord,
  ApiNotificationPreferences,
  ApiPaymentIntent,
  ApiBookingTracking,
  ApiPaymentStatus,
  ApiAdminPendingPayout,
  ApiPayoutBatch,
  ApiPromotion,
  ApiProfessionalApplication,
  ApiProfessionalAvailability,
  ApiProfessionalCatalogSettings,
  ApiProfessionalDashboard,
  ApiProfessionalQualityFlag,
  ApiProfessionalPortfolioItem,
  ApiPortfolioFeedItem,
  ApiProfessionalReview,
  ApiProfessionalSummary,
  ApiServiceCategory,
  ApiServiceZone,
  ApiSafetyIncident,
  ApiContentReport,
  ApiUser,
  ApiAddressCandidate,
} from '../../../shared/api-contracts.ts';

import type {
  BookingCreationResult,
  BookingPaymentContext,
  BookingQuote,
  BookingQuoteFailureReason,
  AdminRefundResult,
  AdminRefundStoreInput,
  AdminCatalogCommandResults,
  AdminProfessionalCommandResults,
  CancelBookingResult,
  CancelBookingStoreInput,
  CreateBookingCommandInput,
  DomainEventRunResult,
  NotificationDeliveryJob,
  PaymentProviderIntent,
  InitiateBookingPaymentResult,
  ProcessPaymentEventResult,
  ProcessPaymentEventStoreInput,
  ProfessionalPayoutCommandResult,
  OpenBookingDisputeStoreInput,
  OpenSafetyIncidentResult,
  OpenSafetyIncidentStoreInput,
  CreateContentReportResult,
  CreateContentReportStoreInput,
  ResolveContentReportStoreInput,
  SetProfessionalBlockStoreInput,
  QueueProfessionalPayoutStoreInput,
  RescheduleBookingResult,
  RescheduleBookingStoreInput,
  SubmitBookingReviewResult,
  SubmitProfessionalApplicationResult,
  SubmitProfessionalApplicationStoreInput,
  SubmitBookingReviewStoreInput,
  SettleProfessionalPayoutStoreInput,
  ResolveBookingDisputeStoreInput,
  ResolveQualityFlagStoreInput,
  ResolveSafetyIncidentStoreInput,
  TrustSafetyResolutionResult,
  CreateBroadcastStoreInput,
  CreatePromotionStoreInput,
  CompleteClientOnboardingResult,
  CompleteClientOnboardingStoreInput,
  ClientAddressCommandResult,
  CreateClientAddressStoreInput,
  DeleteAccountStoreInput,
  DevelopmentApproveProfessionalApplicationStoreInput,
  SetPromotionActiveStoreInput,
  SelectClientAddressStoreInput,
  ReviewProfessionalApplicationStoreInput,
  SetAdminProfessionalStateStoreInput,
  UpdateAdminProfessionalStoreInput,
  UpdateCommissionStoreInput,
  UpdateTravelFeeCapStoreInput,
  QueueAdminPayoutStoreInput,
  SettleAdminPayoutStoreInput,
  UpdateClientProfileStoreInput,
  UpdateClientAddressStoreInput,
  UpdateProfessionalCatalogResult,
  UpdateProfessionalCatalogStoreInput,
  UpsertServiceCategoryStoreInput,
  UpsertZoneStoreInput,
  TransitionProfessionalBookingResult,
  TransitionProfessionalBookingStoreInput,
  ArchiveBookingResult,
  ArchiveBookingStoreInput,
  PaymentCustomer,
  RecordBookingLocationResult,
  RecordBookingLocationStoreInput,
} from './contracts.ts';
import type { DomainEventEnvelope, DomainEventType } from '../domain/events.ts';

export interface Clock {
  now(): Date;
}

export interface OperationalLogger {
  info(event: string, details?: Readonly<Record<string, unknown>>): void;
  error(event: string, details?: Readonly<Record<string, unknown>>): void;
}

export type MockProfessionalRegistrationFailure = 'phone_in_use' | 'provider_unavailable';

export class MockProfessionalRegistrationError extends Error {
  readonly failure: MockProfessionalRegistrationFailure;

  constructor(failure: MockProfessionalRegistrationFailure, message: string) {
    super(message);
    this.name = 'MockProfessionalRegistrationError';
    this.failure = failure;
  }
}

export interface MockProfessionalSessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface ProfessionalMockAuthentication {
  register(phoneNumber: string): Promise<MockProfessionalSessionTokens>;
}

export interface AccountAssetCleaner {
  deletePrivateAssets(userId: string, role: Exclude<ApiAccountRole, 'admin'>): Promise<void>;
}

export interface IdGenerator {
  next(): string;
}

export interface OtpSecurity {
  createCode(): string;
  hash(challengeId: string, code: string): string;
  verify(challengeId: string, code: string, storedHash: string): boolean;
}

export interface OtpChallengeStore {
  countRecentOtpChallenges(phoneNumber: string, since: number): number;
  createOtpChallenge(input: {
    id: string;
    phoneNumber: string;
    role: Exclude<ApiAccountRole, 'admin'>;
    codeHash: string;
    expiresAt: number;
    attempts: number;
    createdAt: number;
  }): void;
  deleteOtpChallenge(challengeId: string): void;
}

export interface OtpVerificationChallenge {
  id: string;
  phoneNumber: string;
  role: Exclude<ApiAccountRole, 'admin'>;
  codeHash: string;
  expiresAt: number;
  attemptsRemaining: number;
  consumedAt: number | null;
}

export interface OtpVerificationStore {
  findOtpChallenge(challengeId: string): OtpVerificationChallenge | null;
  recordOtpFailure(challengeId: string): void;
  consumeOtpChallenge(challengeId: string, consumedAt: number): boolean;
  findOrCreatePhoneUser(input: {
    shouldCreateUser?: boolean;
    userId: string;
    phoneNumber: string;
    role: Exclude<ApiAccountRole, 'admin'>;
    createdAt: string;
  }): ApiUser | null;
  attachVerifiedPhone(input: {
    userId: string;
    phoneNumber: string;
    role: Exclude<ApiAccountRole, 'admin'>;
  }): ApiUser | null;
}

export interface BackgroundJobStore {
  reassignOverdueBookings(now: Date): ReadonlyArray<{ bookingId: string; professionalId: string }> | Promise<ReadonlyArray<{ bookingId: string; professionalId: string }>>;
  enqueueDueBookingReminders(now: Date): number | Promise<number>;
  listDueNotificationJobs(now: string, limit?: number): ReadonlyArray<NotificationDeliveryJob> | Promise<ReadonlyArray<NotificationDeliveryJob>>;
  recordNotificationDelivery(job: NotificationDeliveryJob, result: {
    pending?: boolean;
    delivered: boolean;
    providerReference?: string;
    errorMessage?: string;
  }, recordedAt: Date): void | Promise<void>;
}

export interface DomainEventStore {
  claimDomainEvents(input: {
    workerId: string;
    now: string;
    lockedUntil: string;
    limit: number;
  }): ReadonlyArray<DomainEventEnvelope> | Promise<ReadonlyArray<DomainEventEnvelope>>;
  markDomainEventProcessed(eventId: string, workerId: string, processedAt: string): boolean | Promise<boolean>;
  recordDomainEventFailure(input: {
    eventId: string;
    workerId: string;
    failedAt: string;
    availableAt: string;
    errorMessage: string;
    terminal: boolean;
  }): boolean | Promise<boolean>;
}

export interface DomainEventRecoveryStore {
  listFailedDomainEvents(limit: number): ReadonlyArray<ApiDomainEventDeadLetter> | Promise<ReadonlyArray<ApiDomainEventDeadLetter>>;
  replayFailedDomainEvent(
    eventId: string,
    adminId: string,
    requestedAt: string,
  ): 'replayed' | 'not_found' | 'not_failed' | Promise<'replayed' | 'not_found' | 'not_failed'>;
}

export interface DomainEventHandler {
  readonly eventTypes: ReadonlyArray<DomainEventType>;
  handle(event: DomainEventEnvelope): Promise<void> | void;
}

export interface DomainEventRunner {
  run(at?: Date): Promise<DomainEventRunResult>;
}

export interface NotificationCommandStore {
  enqueueNotification(
    userId: string,
    idempotencyKey: string,
    channel: 'push' | 'sms',
    template: string,
    payload: Record<string, unknown>,
    now?: string,
  ): boolean | Promise<boolean>;
}

export interface BookingCommandStore {
  findBookingByRequest(
    clientId: string,
    requestId: string,
  ): BookingCreationResult | null | Promise<BookingCreationResult | null>;
  quoteBooking(input: CreateBookingCommandInput): BookingQuote | null | Promise<BookingQuote | null>;
  /** Names why quoteBooking answered null for this input; null when it would succeed. */
  explainQuoteFailure(
    input: CreateBookingCommandInput,
  ): BookingQuoteFailureReason | null | Promise<BookingQuoteFailureReason | null>;
  commitBooking(
    input: CreateBookingCommandInput,
    quote: BookingQuote,
  ): BookingCreationResult | null | Promise<BookingCreationResult | null>;
}

export interface BookingPaymentStore {
  getBookingPaymentContext(
    clientId: string,
    bookingId: string,
  ): BookingPaymentContext | null | Promise<BookingPaymentContext | null>;
  commitBookingPayment(
    clientId: string,
    bookingId: string,
    providerIntent: PaymentProviderIntent,
    occurredAt: string,
  ): InitiateBookingPaymentResult | Promise<InitiateBookingPaymentResult>;
}

export interface ClientBookingReadStore {
  listBookings(userId: string): ReadonlyArray<ApiBooking> | Promise<ReadonlyArray<ApiBooking>>;
  /** The client's rewards standing and the reward their next booking will get. */
  getRewards(userId: string): ApiClientRewards | Promise<ApiClientRewards>;
  getPaymentIntent(
    userId: string,
    paymentIntentId: string,
  ): ApiPaymentIntent | null | Promise<ApiPaymentIntent | null>;
}

export interface ProfessionalAvailabilityReader {
  getProfessionalAvailability(
    professionalId: string,
    dateIso: string,
    serviceId?: string,
    excludeBookingId?: string,
  ): ApiProfessionalAvailability | null;
}

export interface ProfessionalAvailabilityReadStore {
  getProfessionalAvailability(
    professionalId: string,
    dateIso: string,
    serviceId?: string,
    excludeBookingId?: string,
  ): ApiProfessionalAvailability | null | Promise<ApiProfessionalAvailability | null>;
}

export interface ProfessionalReadStore extends ProfessionalAvailabilityReader {
  getApplication(userId: string): ApiProfessionalApplication | null;
  getDashboard(professionalId: string, earningsSince: string): ApiProfessionalDashboard | null;
  getCatalogSettings(professionalId: string): ApiProfessionalCatalogSettings | null;
  listPayouts(professionalId: string): ReadonlyArray<ApiPayoutBatch>;
}

export interface ProfessionalOperationsReadStore {
  getDashboard(
    professionalId: string,
    earningsSince: string,
  ): ApiProfessionalDashboard | null | Promise<ApiProfessionalDashboard | null>;
  getCatalogSettings(
    professionalId: string,
  ): ApiProfessionalCatalogSettings | null | Promise<ApiProfessionalCatalogSettings | null>;
  listPayouts(
    professionalId: string,
  ): ReadonlyArray<ApiPayoutBatch> | Promise<ReadonlyArray<ApiPayoutBatch>>;
}

export interface MarketplaceProfessionalFilters {
  query?: string;
  category?: string;
  zone?: string;
  featured?: boolean;
  available?: boolean;
}

export interface MarketplaceReadStore {
  listProfessionals(
    filters: MarketplaceProfessionalFilters,
    today: string,
  ): ReadonlyArray<ApiProfessionalSummary> | Promise<ReadonlyArray<ApiProfessionalSummary>>;
  listServiceZones(): ReadonlyArray<ApiServiceZone> | Promise<ReadonlyArray<ApiServiceZone>>;
  listServiceCategories(activeOnly: boolean): ReadonlyArray<ApiServiceCategory> | Promise<ReadonlyArray<ApiServiceCategory>>;
  listPromotions(): ReadonlyArray<ApiPromotion> | Promise<ReadonlyArray<ApiPromotion>>;
  findServiceZone(zone: string): ApiServiceZone | null | Promise<ApiServiceZone | null>;
  bookingRequiresClientIdentity(userId: string, professionalId: string): boolean | Promise<boolean>;
  listProfessionalReviews(professionalId: string, limit: number): ReadonlyArray<ApiProfessionalReview> | Promise<ReadonlyArray<ApiProfessionalReview>>;
}

export interface ClientIdentityReadStore {
  getIdentityStatus(userId: string): ApiClientIdentityStatus | Promise<ApiClientIdentityStatus>;
}

export interface AdminBookingFilters {
  query?: string;
  status?: ApiBookingStatus;
  dateFrom?: string;
  dateTo?: string;
  professionalId?: string;
}

export interface AdminRevenueRow {
  bookingId: string;
  createdAt: string;
  paymentStatus: ApiPaymentStatus;
  grossAmount: number;
  refundedAmount: number;
  netCollected: number;
  commissionAmount: number;
  professionalPayable: number;
}

export interface AdminReadStore {
  getSummary(): ApiAdminSummary | Promise<ApiAdminSummary>;
  getPlatformSettings(): ApiAdminPlatformSettings | Promise<ApiAdminPlatformSettings>;
  listProfessionalApplications(
    status?: ApiProfessionalApplication['status'],
  ): ReadonlyArray<ApiAdminProfessionalApplication> | Promise<ReadonlyArray<ApiAdminProfessionalApplication>>;
  listProfessionals(): ReadonlyArray<ApiAdminProfessional> | Promise<ReadonlyArray<ApiAdminProfessional>>;
  listBookings(filters: AdminBookingFilters, limit: number): ReadonlyArray<ApiAdminBooking> | Promise<ReadonlyArray<ApiAdminBooking>>;
  listPayouts(): ReadonlyArray<ApiPayoutBatch> | Promise<ReadonlyArray<ApiPayoutBatch>>;
  /** Professionals with completed-visit earnings not yet grouped into a payout batch. */
  listPendingPayouts(): ReadonlyArray<ApiAdminPendingPayout> | Promise<ReadonlyArray<ApiAdminPendingPayout>>;
  listRevenueRows(): ReadonlyArray<AdminRevenueRow> | Promise<ReadonlyArray<AdminRevenueRow>>;
  listAuditLogs(limit: number): ReadonlyArray<ApiAdminAuditLog> | Promise<ReadonlyArray<ApiAdminAuditLog>>;
  listZones(): ReadonlyArray<ApiAdminZone> | Promise<ReadonlyArray<ApiAdminZone>>;
  listDisputes(): ReadonlyArray<ApiBookingDispute> | Promise<ReadonlyArray<ApiBookingDispute>>;
  listQualityFlags(): ReadonlyArray<ApiProfessionalQualityFlag> | Promise<ReadonlyArray<ApiProfessionalQualityFlag>>;
  listSafetyIncidents(): ReadonlyArray<ApiSafetyIncident> | Promise<ReadonlyArray<ApiSafetyIncident>>;
  listContentReports(): ReadonlyArray<ApiContentReport> | Promise<ReadonlyArray<ApiContentReport>>;
  listBroadcasts(): ReadonlyArray<ApiAdminBroadcast> | Promise<ReadonlyArray<ApiAdminBroadcast>>;
}

export interface AdminProfessionalApplicationReadStore {
  listProfessionalApplications(
    status?: ApiProfessionalApplication['status'],
  ): ReadonlyArray<ApiAdminProfessionalApplication> | Promise<ReadonlyArray<ApiAdminProfessionalApplication>>;
}

export interface BookingRescheduleStore {
  rescheduleBooking(
    input: RescheduleBookingStoreInput,
  ): RescheduleBookingResult | Promise<RescheduleBookingResult>;
}

export interface BookingCancellationStore {
  cancelBooking(input: CancelBookingStoreInput): CancelBookingResult | Promise<CancelBookingResult>;
  /** Hides a completed or cancelled booking from the client's history. */
  archiveBooking(input: ArchiveBookingStoreInput): ArchiveBookingResult | Promise<ArchiveBookingResult>;
}

/** Administrator-driven, audited payout batching and manual settlement. */
export interface AdminPayoutCommandStore {
  queueAdminPayout(input: QueueAdminPayoutStoreInput): ProfessionalPayoutCommandResult | Promise<ProfessionalPayoutCommandResult>;
  settleAdminPayout(input: SettleAdminPayoutStoreInput): ProfessionalPayoutCommandResult | Promise<ProfessionalPayoutCommandResult>;
}

export interface ProfessionalBookingTransitionStore {
  transitionBooking(
    input: TransitionProfessionalBookingStoreInput,
  ): TransitionProfessionalBookingResult | Promise<TransitionProfessionalBookingResult>;
}

export interface BookingTrackingStore {
  recordLocation(
    input: RecordBookingLocationStoreInput,
  ): RecordBookingLocationResult | Promise<RecordBookingLocationResult>;
  /** Latest point for a booking the user takes part in; null when none, undefined when not a participant. */
  getTracking(
    userId: string,
    bookingId: string,
  ): ApiBookingTracking | null | undefined | Promise<ApiBookingTracking | null | undefined>;
}

export interface BookingReviewStore {
  submitReview(
    input: SubmitBookingReviewStoreInput,
  ): SubmitBookingReviewResult | Promise<SubmitBookingReviewResult>;
}

export interface PaymentEventStore {
  processPaymentEvent(
    input: ProcessPaymentEventStoreInput,
  ): ProcessPaymentEventResult | Promise<ProcessPaymentEventResult>;
}

export interface PayloadHasher {
  hash(value: string): string;
}

export interface ProfessionalPayoutCommandStore {
  queuePayout(
    input: QueueProfessionalPayoutStoreInput,
  ): ProfessionalPayoutCommandResult | Promise<ProfessionalPayoutCommandResult>;
  settlePayout(
    input: SettleProfessionalPayoutStoreInput,
  ): ProfessionalPayoutCommandResult | Promise<ProfessionalPayoutCommandResult>;
}

export interface TrustSafetyCommandStore {
  openSafetyIncident(input: OpenSafetyIncidentStoreInput): OpenSafetyIncidentResult | Promise<OpenSafetyIncidentResult>;
  createContentReport(input: CreateContentReportStoreInput): CreateContentReportResult | Promise<CreateContentReportResult>;
  listBlockedProfessionals(clientId: string): ReadonlyArray<string> | Promise<ReadonlyArray<string>>;
  setProfessionalBlocked(input: SetProfessionalBlockStoreInput): boolean | Promise<boolean>;
  openBookingDispute(input: OpenBookingDisputeStoreInput): TrustSafetyResolutionResult['dispute'] | null | Promise<TrustSafetyResolutionResult['dispute'] | null>;
  resolveSafetyIncident(input: ResolveSafetyIncidentStoreInput): TrustSafetyResolutionResult['safetyIncident'] | null | Promise<TrustSafetyResolutionResult['safetyIncident'] | null>;
  resolveQualityFlag(input: ResolveQualityFlagStoreInput): TrustSafetyResolutionResult['qualityFlag'] | null | Promise<TrustSafetyResolutionResult['qualityFlag'] | null>;
  resolveBookingDispute(input: ResolveBookingDisputeStoreInput): TrustSafetyResolutionResult['dispute'] | null | Promise<TrustSafetyResolutionResult['dispute'] | null>;
  resolveContentReport(input: ResolveContentReportStoreInput): TrustSafetyResolutionResult['contentReport'] | null | Promise<TrustSafetyResolutionResult['contentReport'] | null>;
}

export interface AdminRefundStore {
  refundBooking(input: AdminRefundStoreInput): AdminRefundResult | Promise<AdminRefundResult>;
}

export interface AdminCatalogCommandStore {
  upsertCategory(input: UpsertServiceCategoryStoreInput): AdminCatalogCommandResults['category'] | Promise<AdminCatalogCommandResults['category']>;
  updateCommission(input: UpdateCommissionStoreInput): AdminCatalogCommandResults['settings'] | Promise<AdminCatalogCommandResults['settings']>;
  updateTravelFeeCap(input: UpdateTravelFeeCapStoreInput): AdminCatalogCommandResults['settings'] | Promise<AdminCatalogCommandResults['settings']>;
  upsertZone(input: UpsertZoneStoreInput): AdminCatalogCommandResults['zone'] | Promise<AdminCatalogCommandResults['zone']>;
  createPromotion(input: CreatePromotionStoreInput): AdminCatalogCommandResults['promotion'] | Promise<AdminCatalogCommandResults['promotion']>;
  setPromotionActive(input: SetPromotionActiveStoreInput): AdminCatalogCommandResults['promotion'] | null | Promise<AdminCatalogCommandResults['promotion'] | null>;
  createBroadcast(input: CreateBroadcastStoreInput): AdminCatalogCommandResults['broadcast'] | Promise<AdminCatalogCommandResults['broadcast']>;
}

export interface AdminProfessionalCommandStore {
  approveForDevelopment(
    input: DevelopmentApproveProfessionalApplicationStoreInput,
  ): AdminProfessionalCommandResults['application'] | null | Promise<AdminProfessionalCommandResults['application'] | null>;
  reviewApplication(
    input: ReviewProfessionalApplicationStoreInput,
  ): AdminProfessionalCommandResults['application'] | null | Promise<AdminProfessionalCommandResults['application'] | null>;
  updateProfessional(
    input: UpdateAdminProfessionalStoreInput,
  ): AdminProfessionalCommandResults['professional'] | null | Promise<AdminProfessionalCommandResults['professional'] | null>;
  setProfessionalState(
    input: SetAdminProfessionalStateStoreInput,
  ): AdminProfessionalCommandResults['professional'] | null | Promise<AdminProfessionalCommandResults['professional'] | null>;
}

export interface AdminProfessionalApplicationCommandStore {
  reviewApplication(
    input: ReviewProfessionalApplicationStoreInput,
  ): AdminProfessionalCommandResults['application'] | null | Promise<AdminProfessionalCommandResults['application'] | null>;
}

export interface OtpSender {
  send(phoneNumber: string, code: string): Promise<void>;
}

export interface PasswordResetSender {
  send(email: string, token: string): Promise<void>;
}

export interface IdentityVerifier {
  verify(identifier: string): Promise<{ lastFour: string }>;
}

export interface ClientIdentityVerificationStore {
  recordClientVerification(
    userId: string,
    lastFour: string,
    verifiedAt: string,
  ): ApiClientIdentityStatus | Promise<ApiClientIdentityStatus>;
}

export interface IdentityVerificationStore extends ClientIdentityVerificationStore {}

export interface SessionTokenSecurity {
  createToken(): string;
  hashToken(token: string): string;
}

export interface SessionStore {
  createSession(input: {
    userId: string;
    role: ApiAccountRole;
    tokenHash: string;
    expiresAt: number;
    createdAt: string;
  }): void;
  findUserForSession(tokenHash: string, now: number): ApiUser | null;
  deleteSession(tokenHash: string): void;
}

export interface PasswordSecurity {
  hash(password: string): Promise<string>;
  verify(password: string, storedHash: string): Promise<boolean>;
}

export interface PasswordResetStore {
  findResettableClient(email: string): { userId: string; email: string } | null;
  createPasswordResetToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: number;
    createdAt: number;
  }): void;
  deletePasswordResetToken(tokenHash: string): void;
  resetPassword(tokenHash: string, passwordHash: string, now: number): boolean;
}

export interface AccountCredentials {
  user: ApiUser;
  passwordHash: string;
}

export interface AccountAuthenticationStore {
  createClient(input: {
    userId: string;
    email: string;
    fullName: string;
    passwordHash: string;
    createdAt: string;
  }): ApiUser;
  findClientCredentials(email: string): AccountCredentials | null;
  findAdminCredentials(email: string): AccountCredentials | null;
  createAdministrator(input: {
    administratorId: string;
    email: string;
    fullName: string;
    passwordHash: string;
    createdAt: string;
  }): ApiUser;
}

export interface ClientAccountCommandStore {
  updateProfile(input: UpdateClientProfileStoreInput): ApiUser | null | Promise<ApiUser | null>;
  completeOnboarding(
    input: CompleteClientOnboardingStoreInput,
  ): CompleteClientOnboardingResult | Promise<CompleteClientOnboardingResult>;
  deleteAccount(input: DeleteAccountStoreInput): boolean | Promise<boolean>;
}

export interface ClientAddressCommandStore {
  createAddress(input: CreateClientAddressStoreInput): ClientAddressCommandResult | Promise<ClientAddressCommandResult>;
  updateAddress(input: UpdateClientAddressStoreInput): ClientAddressCommandResult | Promise<ClientAddressCommandResult>;
  deleteAddress(input: SelectClientAddressStoreInput): boolean | Promise<boolean>;
  setDefaultAddress(input: SelectClientAddressStoreInput): boolean | Promise<boolean>;
}

export interface ClientPreferenceCommandStore {
  setFavorite(input: { userId: string; professionalId: string; favorite: boolean; occurredAt: string }): 'updated' | 'professional_not_found' | Promise<'updated' | 'professional_not_found'>;
  updateNotificationPreferences(input: { userId: string; preferences: ApiNotificationPreferences; occurredAt: string }): ApiNotificationPreferences | Promise<ApiNotificationPreferences>;
  registerDevice(input: { registrationId: string; userId: string; platform: ApiDevicePlatform; token: string; occurredAt: string }): ApiDeviceRegistration | Promise<ApiDeviceRegistration>;
  unregisterDevice(input: { userId: string; registrationId: string; occurredAt: string }): boolean | Promise<boolean>;
}

export interface ClientPaymentLedgerAudit {
  balanced: boolean;
  groups: ReadonlyArray<{ entryGroup: string; total: number; entries: number }>;
}

export interface ClientReadStore {
  getClientData(userId: string): ApiClientData;
  getIdentityStatus(userId: string): ApiClientIdentityStatus;
  listBookings(userId: string): ReadonlyArray<ApiBooking>;
  getRewards(userId: string): ApiClientRewards;
  getPaymentIntent(userId: string, paymentIntentId: string): ApiPaymentIntent | null;
  auditPaymentLedger(userId: string, paymentIntentId: string): ClientPaymentLedgerAudit | null;
  listNotifications(userId: string): ReadonlyArray<ApiNotificationRecord>;
}

export interface ClientDataReadStore {
  getClientData(userId: string): ApiClientData | Promise<ApiClientData>;
  auditPaymentLedger(
    userId: string,
    paymentIntentId: string,
  ): ClientPaymentLedgerAudit | null | Promise<ClientPaymentLedgerAudit | null>;
  listNotifications(
    userId: string,
  ): ReadonlyArray<ApiNotificationRecord> | Promise<ReadonlyArray<ApiNotificationRecord>>;
}

export interface ProfessionalSelfServiceCommandStore {
  updateCatalog(
    input: UpdateProfessionalCatalogStoreInput,
  ): UpdateProfessionalCatalogResult | Promise<UpdateProfessionalCatalogResult>;
  setAvailability(
    input: { professionalId: string; available: boolean; occurredAt: string },
  ): boolean | Promise<boolean>;
}

export interface ProfessionalApplicationCommandStore {
  submitApplication(
    input: SubmitProfessionalApplicationStoreInput,
  ): SubmitProfessionalApplicationResult | Promise<SubmitProfessionalApplicationResult>;
}

export interface ProfessionalApplicationReadStore {
  getApplication(
    userId: string,
  ): ApiProfessionalApplication | null | Promise<ApiProfessionalApplication | null>;
}

export interface ProfessionalPortfolioReadStore {
  listApprovedPortfolio(professionalId: string): Promise<ReadonlyArray<ApiProfessionalPortfolioItem>>;
  listPortfolioFeed?(limit: number): Promise<ReadonlyArray<ApiPortfolioFeedItem>>;
}

export interface AdminAuditStore {
  record(input: { auditId: string; adminId: string; action: string; targetType: string; targetId: string | null; metadata: Record<string, unknown>; occurredAt: string }): void | Promise<void>;
}

export interface PaymentGateway {
  /**
   * Asks the provider for the current state of a payment by its provider
   * reference (the merchant reference Konjo issued). Only present when a real
   * provider is configured; sandbox and cash intents never reach it.
   */
  verifyTransaction?(reference: string): Promise<{
    amount: number;
    currency: string;
    status: 'captured' | 'failed' | 'pending';
    merchantReference?: string;
  }>;
  createIntent(input: {
    provider: CreateBookingCommandInput['paymentMethod'];
    amount: number;
    currency: 'ETB';
    idempotencyKey: string;
    bookingId?: string;
    customer?: PaymentCustomer | null;
    returnUrl?: string | null;
  }): Promise<PaymentProviderIntent>;
  verifyWebhook(rawBody: string, signature: string | undefined): boolean;
}

export interface NotificationGateway {
  deliver(job: NotificationDeliveryJob): Promise<string>;
}

export interface ReadinessProbe {
  check(): void | Promise<void>;
}

export class OtpDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OtpDeliveryError';
  }
}

/** The payment provider refused or could not process a request; the message is safe to show. */
export class PaymentProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

export class IdentityVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentityVerificationError';
  }
}

/** Turns free-text addresses into validated coordinates and back. */
export interface AddressGeocoder {
  search(query: string, limit: number): Promise<ReadonlyArray<ApiAddressCandidate>>;
  reverse(point: { latitude: number; longitude: number }): Promise<ApiAddressCandidate | null>;
}

/** The geocoding provider refused or could not process a request. */
export class GeocodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeocodingError';
  }
}
