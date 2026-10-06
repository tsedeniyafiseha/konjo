import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type {
  ApiClientPreferredLanguage,
  ApiUser,
} from '../../shared/api-contracts.ts';
import type {
  AccountAuthenticationStore,
  AdminAuditStore,
  AdminCatalogCommandStore,
  AdminPayoutCommandStore,
  AdminProfessionalCommandStore,
  AdminReadStore,
  AdminRefundStore,
  BackgroundJobStore,
  BookingCancellationStore,
  BookingCommandStore,
  BookingPaymentStore,
  BookingRescheduleStore,
  BookingReviewStore,
  BookingTrackingStore,
  ClientAccountCommandStore,
  ClientAddressCommandStore,
  ClientPreferenceCommandStore,
  ClientReadStore,
  DomainEventRecoveryStore,
  DomainEventStore,
  IdentityVerificationStore,
  MarketplaceReadStore,
  NotificationCommandStore,
  OtpChallengeStore,
  OtpVerificationStore,
  PasswordResetStore,
  PaymentEventStore,
  ProfessionalApplicationCommandStore,
  ProfessionalBookingTransitionStore,
  ProfessionalPayoutCommandStore,
  ProfessionalReadStore,
  ProfessionalSelfServiceCommandStore,
  ReadinessProbe,
  SessionStore,
  TrustSafetyCommandStore,
} from './application/ports.ts';
import type { ExternalAccountProjection } from './application/authenticate-access-token.ts';
import { SqliteAvailabilityRepository } from './adapters/sqlite/availability-repository.ts';
import { SqliteAccountAuthenticationRepository } from './adapters/sqlite/account-authentication-repository.ts';
import { SqliteAdminRefundRepository } from './adapters/sqlite/admin-refund-repository.ts';
import { SqliteAdminCatalogCommandRepository } from './adapters/sqlite/admin-catalog-command-repository.ts';
import { SqliteAdminAuditRepository } from './adapters/sqlite/admin-audit-repository.ts';
import { SqliteAdminProfessionalCommandRepository } from './adapters/sqlite/admin-professional-command-repository.ts';
import { SqliteAdminReadRepository } from './adapters/sqlite/admin-read-repository.ts';
import { SqliteBackgroundJobRepository } from './adapters/sqlite/background-job-repository.ts';
import { SqliteBookingCommandRepository } from './adapters/sqlite/booking-command-repository.ts';
import { SqliteBookingCancellationRepository } from './adapters/sqlite/booking-cancellation-repository.ts';
import { SqliteBookingPaymentSettlement } from './adapters/sqlite/booking-payment-settlement.ts';
import { SqliteBookingRescheduleRepository } from './adapters/sqlite/booking-reschedule-repository.ts';
import { SqliteBookingReviewRepository } from './adapters/sqlite/booking-review-repository.ts';
import { SqliteBookingTrackingRepository } from './adapters/sqlite/booking-tracking-repository.ts';
import { SqliteClientAccountCommandRepository } from './adapters/sqlite/client-account-command-repository.ts';
import { SqliteClientAddressCommandRepository } from './adapters/sqlite/client-address-command-repository.ts';
import { SqliteClientPreferenceCommandRepository } from './adapters/sqlite/client-preference-command-repository.ts';
import { SqliteClientReadRepository } from './adapters/sqlite/client-read-repository.ts';
import { SqliteMarketplaceReadRepository } from './adapters/sqlite/marketplace-read-repository.ts';
import { SqliteDomainEventOutbox } from './adapters/sqlite/domain-event-outbox.ts';
import { SqliteDomainEventRecoveryRepository } from './adapters/sqlite/domain-event-recovery-repository.ts';
import { SqliteNotificationOutbox } from './adapters/sqlite/notification-outbox.ts';
import { SqliteOtpRepository } from './adapters/sqlite/otp-repository.ts';
import { SqlitePaymentEventRepository } from './adapters/sqlite/payment-event-repository.ts';
import { SqlitePasswordResetRepository } from './adapters/sqlite/password-reset-repository.ts';
import { SqliteIdentityVerificationRepository } from './adapters/sqlite/identity-verification-repository.ts';
import { SqliteProfessionalBookingTransitionRepository } from './adapters/sqlite/professional-booking-transition-repository.ts';
import { SqliteProfessionalPayoutCommandRepository } from './adapters/sqlite/professional-payout-command-repository.ts';
import { SqliteProfessionalSelfServiceCommandRepository } from './adapters/sqlite/professional-self-service-command-repository.ts';
import { SqliteProfessionalApplicationCommandRepository } from './adapters/sqlite/professional-application-command-repository.ts';
import { SqliteProfessionalReadRepository } from './adapters/sqlite/professional-read-repository.ts';
import { SqliteReadinessProbe } from './adapters/sqlite/readiness-probe.ts';
import { SqliteSessionRepository } from './adapters/sqlite/session-repository.ts';
import { SqliteTrustSafetyCommandRepository } from './adapters/sqlite/trust-safety-command-repository.ts';
import { configureSqlite, migrateSqliteSchema } from './adapters/sqlite/schema.ts';
import { seedSqliteReferenceData } from './adapters/sqlite/seed-data.ts';
import { SqliteUnitOfWork } from './adapters/sqlite/unit-of-work.ts';
import { SqliteExternalAccountProjection } from './adapters/sqlite/external-account-projection.ts';
import { SqliteWebsiteSubmissionRepository } from './adapters/sqlite/website-submission-repository.ts';

interface UserRow {
  id: string;
  role: 'client' | 'professional';
  email: string;
  full_name: string;
  phone_number: string | null;
  password_hash: string;
  preferred_language: ApiClientPreferredLanguage;
  onboarding_completed_at: string | null;
  created_at: string;
  accept_by: string;
  assignment_version: number;
}

function toApiUser(row: UserRow): ApiUser {
  return {
    id: row.id,
    role: row.role,
    email: row.password_hash === 'phone-otp' ? null : row.email,
    fullName: row.full_name,
    phoneNumber: row.phone_number,
    createdAt: row.created_at,
  };
}

export class KonjoDatabase {
  private readonly database: DatabaseSync;
  private readonly adminCatalogCommands: SqliteAdminCatalogCommandRepository;
  private readonly adminAudits: SqliteAdminAuditRepository;
  private readonly accountAuthentication: SqliteAccountAuthenticationRepository;
  private readonly adminProfessionalCommands: SqliteAdminProfessionalCommandRepository;
  private readonly adminReads: SqliteAdminReadRepository;
  private readonly adminRefunds: SqliteAdminRefundRepository;
  private readonly availabilityRepository: SqliteAvailabilityRepository;
  private readonly backgroundJobs: SqliteBackgroundJobRepository;
  private readonly bookingCommands: SqliteBookingCommandRepository;
  private readonly bookingCancellations: SqliteBookingCancellationRepository;
  private readonly bookingPaymentSettlement: SqliteBookingPaymentSettlement;
  private readonly bookingReschedules: SqliteBookingRescheduleRepository;
  private readonly bookingReviews: SqliteBookingReviewRepository;
  private readonly clientAccountCommands: SqliteClientAccountCommandRepository;
  private readonly clientAddressCommands: SqliteClientAddressCommandRepository;
  private readonly clientPreferenceCommands: SqliteClientPreferenceCommandRepository;
  private readonly clientReads: SqliteClientReadRepository;
  private readonly domainEventOutbox: SqliteDomainEventOutbox;
  private readonly domainEventRecovery: SqliteDomainEventRecoveryRepository;
  private readonly identityVerifications: SqliteIdentityVerificationRepository;
  private readonly externalAccounts: SqliteExternalAccountProjection;
  private readonly marketplaceReads: SqliteMarketplaceReadRepository;
  private readonly notificationOutbox: SqliteNotificationOutbox;
  private readonly otpChallenges: SqliteOtpRepository;
  private readonly paymentEvents: SqlitePaymentEventRepository;
  private readonly passwordResets: SqlitePasswordResetRepository;
  private readonly professionalBookingTransitions: SqliteProfessionalBookingTransitionRepository;
  private readonly professionalPayoutCommands: SqliteProfessionalPayoutCommandRepository;
  private readonly professionalSelfServiceCommands: SqliteProfessionalSelfServiceCommandRepository;
  private readonly professionalApplicationCommands: SqliteProfessionalApplicationCommandRepository;
  private readonly professionalReads: SqliteProfessionalReadRepository;
  private readonly readiness: SqliteReadinessProbe;
  private readonly sessions: SqliteSessionRepository;
  private readonly trustSafetyCommands: SqliteTrustSafetyCommandRepository;
  private readonly unitOfWork: SqliteUnitOfWork;
  private readonly websiteSubmissions: SqliteWebsiteSubmissionRepository;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    configureSqlite(this.database);
    migrateSqliteSchema(this.database);
    seedSqliteReferenceData(this.database);
    this.readiness = new SqliteReadinessProbe(this.database);
    this.unitOfWork = new SqliteUnitOfWork(this.database);
    this.accountAuthentication = new SqliteAccountAuthenticationRepository(this.database);
    this.domainEventOutbox = new SqliteDomainEventOutbox(this.database, this.unitOfWork);
    this.clientAccountCommands = new SqliteClientAccountCommandRepository(
      this.database,
      this.domainEventOutbox,
      this.unitOfWork,
    );
    this.clientAddressCommands = new SqliteClientAddressCommandRepository(this.database, this.unitOfWork);
    this.clientPreferenceCommands = new SqliteClientPreferenceCommandRepository(this.database);
    this.clientReads = new SqliteClientReadRepository(this.database);
    this.professionalSelfServiceCommands = new SqliteProfessionalSelfServiceCommandRepository(this.database, this.unitOfWork);
    this.professionalApplicationCommands = new SqliteProfessionalApplicationCommandRepository(this.database, this.unitOfWork);
    this.domainEventRecovery = new SqliteDomainEventRecoveryRepository(this.database, this.unitOfWork);
    this.notificationOutbox = new SqliteNotificationOutbox(this.database, this.unitOfWork);
    this.otpChallenges = new SqliteOtpRepository(this.database);
    this.passwordResets = new SqlitePasswordResetRepository(this.database, this.unitOfWork);
    this.identityVerifications = new SqliteIdentityVerificationRepository(this.database);
    this.externalAccounts = new SqliteExternalAccountProjection(this.database);
    this.sessions = new SqliteSessionRepository(this.database);
    this.adminCatalogCommands = new SqliteAdminCatalogCommandRepository(
      this.database,
      this.notificationOutbox,
      this.unitOfWork,
    );
    this.adminAudits = new SqliteAdminAuditRepository(this.database);
    this.adminProfessionalCommands = new SqliteAdminProfessionalCommandRepository(
      this.database,
      this.domainEventOutbox,
      this.unitOfWork,
    );
    this.adminReads = new SqliteAdminReadRepository(this.database);
    this.availabilityRepository = new SqliteAvailabilityRepository(this.database);
    this.professionalReads = new SqliteProfessionalReadRepository(
      this.database,
      this.availabilityRepository,
    );
    this.marketplaceReads = new SqliteMarketplaceReadRepository(
      this.database,
      this.availabilityRepository,
      this.clientReads,
    );
    this.backgroundJobs = new SqliteBackgroundJobRepository(
      this.database,
      this.availabilityRepository,
      this.marketplaceReads,
      this.domainEventOutbox,
      this.notificationOutbox,
      this.unitOfWork,
    );
    this.bookingCommands = new SqliteBookingCommandRepository(
      this.database,
      this.availabilityRepository,
      this.domainEventOutbox,
      this.unitOfWork,
    );
    this.bookingPaymentSettlement = new SqliteBookingPaymentSettlement(
      this.database,
      this.domainEventOutbox,
    );
    this.bookingCancellations = new SqliteBookingCancellationRepository(
      this.database,
      this.bookingPaymentSettlement,
      this.domainEventOutbox,
      this.unitOfWork,
    );
    this.bookingReschedules = new SqliteBookingRescheduleRepository(
      this.database,
      this.availabilityRepository,
      this.domainEventOutbox,
      this.unitOfWork,
    );
    this.bookingReviews = new SqliteBookingReviewRepository(
      this.database,
      this.domainEventOutbox,
      this.unitOfWork,
    );
    this.professionalBookingTransitions = new SqliteProfessionalBookingTransitionRepository(
      this.database,
      this.bookingPaymentSettlement,
      this.domainEventOutbox,
      this.unitOfWork,
    );
    this.paymentEvents = new SqlitePaymentEventRepository(
      this.database,
      this.bookingPaymentSettlement,
      this.domainEventOutbox,
      this.unitOfWork,
    );
    this.professionalPayoutCommands = new SqliteProfessionalPayoutCommandRepository(
      this.database,
      this.domainEventOutbox,
      this.unitOfWork,
    );
    this.trustSafetyCommands = new SqliteTrustSafetyCommandRepository(
      this.database,
      this.domainEventOutbox,
      this.unitOfWork,
    );
    this.adminRefunds = new SqliteAdminRefundRepository(
      this.database,
      this.bookingPaymentSettlement,
      this.domainEventOutbox,
      this.unitOfWork,
    );
    this.websiteSubmissions = new SqliteWebsiteSubmissionRepository(this.database);
  }

  get bookingCommandStore(): BookingCommandStore {
    return this.bookingCommands;
  }

  get bookingPaymentStore(): BookingPaymentStore {
    return this.bookingCommands;
  }

  get notificationCommandStore(): NotificationCommandStore {
    return this.notificationOutbox;
  }

  get domainEventStore(): DomainEventStore {
    return this.domainEventOutbox;
  }

  get domainEventRecoveryStore(): DomainEventRecoveryStore {
    return this.domainEventRecovery;
  }

  get bookingCancellationStore(): BookingCancellationStore {
    return this.bookingCancellations;
  }

  get bookingRescheduleStore(): BookingRescheduleStore {
    return this.bookingReschedules;
  }

  get bookingReviewStore(): BookingReviewStore {
    return this.bookingReviews;
  }

  get professionalBookingTransitionStore(): ProfessionalBookingTransitionStore {
    return this.professionalBookingTransitions;
  }

  get bookingTrackingStore(): BookingTrackingStore {
    return new SqliteBookingTrackingRepository(this.database);
  }

  get paymentEventStore(): PaymentEventStore {
    return this.paymentEvents;
  }

  get professionalPayoutCommandStore(): ProfessionalPayoutCommandStore {
    return this.professionalPayoutCommands;
  }

  get adminPayoutCommandStore(): AdminPayoutCommandStore {
    return this.professionalPayoutCommands;
  }

  get trustSafetyCommandStore(): TrustSafetyCommandStore {
    return this.trustSafetyCommands;
  }

  get adminRefundStore(): AdminRefundStore {
    return this.adminRefunds;
  }

  get adminCatalogCommandStore(): AdminCatalogCommandStore {
    return this.adminCatalogCommands;
  }

  get adminAuditStore(): AdminAuditStore {
    return this.adminAudits;
  }

  get adminProfessionalCommandStore(): AdminProfessionalCommandStore {
    return this.adminProfessionalCommands;
  }

  get identityVerificationStore(): IdentityVerificationStore {
    return this.identityVerifications;
  }

  get sessionStore(): SessionStore {
    return this.sessions;
  }

  get otpChallengeStore(): OtpChallengeStore & OtpVerificationStore {
    return this.otpChallenges;
  }

  get passwordResetStore(): PasswordResetStore {
    return this.passwordResets;
  }

  get accountAuthenticationStore(): AccountAuthenticationStore {
    return this.accountAuthentication;
  }

  get externalAccountProjection(): ExternalAccountProjection {
    return this.externalAccounts;
  }

  get clientAccountCommandStore(): ClientAccountCommandStore {
    return this.clientAccountCommands;
  }

  get clientAddressCommandStore(): ClientAddressCommandStore {
    return this.clientAddressCommands;
  }

  get clientPreferenceCommandStore(): ClientPreferenceCommandStore {
    return this.clientPreferenceCommands;
  }

  get clientReadStore(): ClientReadStore {
    return this.clientReads;
  }

  get professionalSelfServiceCommandStore(): ProfessionalSelfServiceCommandStore {
    return this.professionalSelfServiceCommands;
  }

  get professionalApplicationCommandStore(): ProfessionalApplicationCommandStore {
    return this.professionalApplicationCommands;
  }

  get professionalReadStore(): ProfessionalReadStore {
    return this.professionalReads;
  }

  get marketplaceReadStore(): MarketplaceReadStore {
    return this.marketplaceReads;
  }

  get adminReadStore(): AdminReadStore {
    return this.adminReads;
  }

  get backgroundJobStore(): BackgroundJobStore {
    return this.backgroundJobs;
  }

  get readinessProbe(): ReadinessProbe {
    return this.readiness;
  }

  get websiteSubmissionStore(): SqliteWebsiteSubmissionRepository {
    return this.websiteSubmissions;
  }

  close() {
    this.database.close();
  }
}
