import { BackgroundJobProcessor } from '../application/process-background-jobs.ts';
import { AccountAssetDeletionProjector } from '../application/account-asset-deletion-projector.ts';
import { BookingNotificationProjector } from '../application/booking-notification-projector.ts';
import { DomainEventProcessor } from '../application/process-domain-events.ts';
import { PaymentNotificationProjector } from '../application/payment-notification-projector.ts';
import {
  ProfessionalApplicationSubmittedHandler,
  ProfessionalApprovalNotificationProjector,
} from '../application/professional-approval-notification-projector.ts';
import { TrustSafetyNotificationProjector } from '../application/trust-safety-notification-projector.ts';
import { PayoutNotificationProjector } from '../application/payout-notification-projector.ts';
import { RequestOtpHandler } from '../application/request-otp.ts';
import { VerifyOtpHandler } from '../application/verify-otp.ts';
import { CreateBookingHandler } from '../application/create-booking.ts';
import { InitiateBookingPaymentHandler } from '../application/initiate-booking-payment.ts';
import { DomainEventDeadLetterManager } from '../application/manage-domain-event-dead-letters.ts';
import { RescheduleBookingHandler } from '../application/reschedule-booking.ts';
import { ArchiveBookingHandler } from '../application/archive-booking.ts';
import { CancelBookingHandler } from '../application/cancel-booking.ts';
import { TransitionProfessionalBookingHandler } from '../application/transition-professional-booking.ts';
import { SubmitBookingReviewHandler } from '../application/submit-booking-review.ts';
import { ProcessPaymentWebhookHandler } from '../application/process-payment-webhook.ts';
import { VerifyBookingPaymentHandler } from '../application/verify-booking-payment.ts';
import { ManageProfessionalPayouts } from '../application/manage-professional-payouts.ts';
import { ManageTrustSafety } from '../application/manage-trust-safety.ts';
import { ManageAdminCatalog } from '../application/manage-admin-catalog.ts';
import { ManageAdminPayouts } from '../application/manage-admin-payouts.ts';
import { ManageAdminProfessionals } from '../application/manage-admin-professionals.ts';
import { VerifyIdentity } from '../application/verify-identity.ts';
import { SessionManager } from '../application/manage-sessions.ts';
import { PasswordResetManager } from '../application/manage-password-reset.ts';
import { AccountAuthenticator } from '../application/authenticate-accounts.ts';
import { AccessTokenAuthenticator } from '../application/authenticate-access-token.ts';
import { ManageClientAccount } from '../application/manage-client-account.ts';
import { ManageClientAddresses } from '../application/manage-client-addresses.ts';
import { ManageClientPreferences } from '../application/manage-client-preferences.ts';
import { ManageProfessionalSelfService } from '../application/manage-professional-self-service.ts';
import { SubmitProfessionalApplicationHandler } from '../application/submit-professional-application.ts';
import { RecordAdminExportAudit } from '../application/record-admin-export-audit.ts';
import { ReadProfessionalPortfolio } from '../application/read-professional-portfolio.ts';
import { ReadClientModel } from '../application/read-client-model.ts';
import { ReadProfessionalModel } from '../application/read-professional-model.ts';
import { ReadMarketplace } from '../application/read-marketplace.ts';
import { ReadAdminModel } from '../application/read-admin-model.ts';
import { CheckReadiness } from '../application/check-readiness.ts';
import { createIdentityVerifier } from '../adapters/identity-verifier.ts';
import { createNotificationGateway } from '../adapters/notification-gateway.ts';
import { createOtpSender } from '../adapters/otp-sender.ts';
import { createOtpSecurity } from '../adapters/otp-security.ts';
import { createPasswordResetSender } from '../adapters/password-reset-sender.ts';
import { createPaymentGateway } from '../adapters/payment-gateway.ts';
import { randomIdGenerator } from '../adapters/random-id-generator.ts';
import { systemClock } from '../adapters/system-clock.ts';
import { sha256PayloadHasher } from '../adapters/sha256-payload-hasher.ts';
import { sessionTokenSecurity } from '../adapters/session-token-security.ts';
import { passwordSecurity } from '../adapters/password-security.ts';
import { createStructuredLogger } from '../adapters/structured-logger.ts';
import { SupabaseAccessTokenResolver } from '../adapters/supabase-access-token-resolver.ts';
import { SupabaseProfessionalOnboardingRepository } from '../adapters/supabase-professional-onboarding-repository.ts';
import { SupabaseProfessionalPortfolioRepository } from '../adapters/supabase-professional-portfolio-repository.ts';
import { SupabaseMarketplaceReadRepository } from '../adapters/supabase-marketplace-read-repository.ts';
import { SupabaseBookingRepository } from '../adapters/supabase-booking-repository.ts';
import { SupabaseProfessionalOperationsRepository } from '../adapters/supabase-professional-operations-repository.ts';
import { SupabaseBookingTrackingRepository } from '../adapters/supabase-booking-tracking-repository.ts';
import { BookingTrackingHandler } from '../application/record-booking-location.ts';
import { SupabaseClientDataRepository } from '../adapters/supabase-client-data-repository.ts';
import { SupabasePaymentOperationsRepository } from '../adapters/supabase-payment-operations-repository.ts';
import { SupabaseEventWorkerRepository } from '../adapters/supabase-event-worker-repository.ts';
import { SupabaseTrustSafetyRepository } from '../adapters/supabase-trust-safety-repository.ts';
import { SupabaseAdminReadRepository } from '../adapters/supabase-admin-read-repository.ts';
import { SupabaseAdminOperationsRepository } from '../adapters/supabase-admin-operations-repository.ts';
import { EmptyProfessionalPortfolioRepository } from '../adapters/empty-professional-portfolio-repository.ts';
import { EmptyAccountAssetCleaner } from '../adapters/empty-account-asset-cleaner.ts';
import { SupabaseAccountAssetCleaner } from '../adapters/supabase-account-asset-cleaner.ts';
import { SupabaseReadinessProbe } from '../adapters/supabase-readiness-probe.ts';
import { SupabaseProfessionalMockAuth } from '../adapters/supabase-professional-mock-auth.ts';
import { SearchAddresses } from '../application/search-addresses.ts';
import type { ProfessionalMockAuthentication } from '../application/ports.ts';
import { backendConfig, type BackendConfig } from '../config.ts';
import { KonjoDatabase } from '../database.ts';
import { chapaKeyMode } from '../adapters/chapa-key-mode.ts';

export interface BackendDependencies {
  config: BackendConfig;
  database: KonjoDatabase;
  logger: ReturnType<typeof createStructuredLogger>;
  readiness: CheckReadiness;
  passwordResets: PasswordResetManager;
  verifyIdentity: VerifyIdentity;
  backgroundJobs: BackgroundJobProcessor;
  requestOtp: RequestOtpHandler;
  verifyOtp: VerifyOtpHandler;
  createBooking: CreateBookingHandler;
  initiateBookingPayment: InitiateBookingPaymentHandler;
  cancelBooking: CancelBookingHandler;
  archiveBooking: ArchiveBookingHandler;
  domainEventDeadLetters: DomainEventDeadLetterManager;
  rescheduleBooking: RescheduleBookingHandler;
  transitionProfessionalBooking: TransitionProfessionalBookingHandler;
  bookingTracking: BookingTrackingHandler;
  submitBookingReview: SubmitBookingReviewHandler;
  processPaymentWebhook: ProcessPaymentWebhookHandler;
  verifyBookingPayment: VerifyBookingPaymentHandler;
  /** Which Chapa environment the configured key belongs to; null without a key. */
  paymentKeyMode: 'test' | 'live' | null;
  professionalPayouts: ManageProfessionalPayouts;
  trustSafety: ManageTrustSafety;
  adminCatalog: ManageAdminCatalog;
  adminPayouts: ManageAdminPayouts;
  adminProfessionals: ManageAdminProfessionals;
  adminReads: ReadAdminModel;
  sessions: SessionManager;
  accounts: AccountAuthenticator;
  accessTokenAuthenticator: AccessTokenAuthenticator;
  clientAccounts: ManageClientAccount;
  clientAddresses: ManageClientAddresses;
  clientPreferences: ManageClientPreferences;
  clientReads: ReadClientModel;
  marketplaceReads: ReadMarketplace;
  professionalSelfService: ManageProfessionalSelfService;
  professionalReads: ReadProfessionalModel;
  professionalPortfolio: ReadProfessionalPortfolio;
  submitProfessionalApplication: SubmitProfessionalApplicationHandler;
  adminExportAudit: RecordAdminExportAudit;
  /** Address search for saved addresses; null until a Google Geocoding key is configured. */
  addressSearch: SearchAddresses | null;
  /** Development-only Supabase account bridge used after the fixed preview OTP. */
  professionalMockAuth: ProfessionalMockAuthentication | null;
}

export function createBackendDependencies(config: BackendConfig = backendConfig): BackendDependencies {
  if (config.production && config.professionalMockOtpEnabled) {
    throw new Error('KONJO_ENABLE_PROFESSIONAL_MOCK_OTP must be disabled in production.');
  }
  if (config.production && (config.authMode !== 'provider' || config.paymentSandboxCheckout || !config.chapaSecretKey ||
    chapaKeyMode(config.chapaSecretKey) === 'test' ||
    !config.publicApiUrl.startsWith('https://') || !config.publicWebUrl.startsWith('https://') ||
    config.paymentWebhookSecret === 'konjo-local-payment-webhook-secret')) {
    throw new Error('Production requires provider authentication, HTTPS URLs, a live Chapa key and a private webhook secret, with sandbox checkout disabled.');
  }
  if (config.production && [...config.allowedOrigins].some((origin) => !origin.startsWith('https://'))) {
    throw new Error('KONJO_ALLOWED_ORIGINS must list only https:// origins in production.');
  }
  // Secrets that guard money and sign-in must never be the source-visible
  // defaults once real accounts exist, whatever NODE_ENV says.
  if (config.authMode === 'provider' || config.production) {
    if (config.paymentWebhookSecret === 'konjo-local-payment-webhook-secret' || config.paymentWebhookSecret.length < 32) {
      throw new Error('KONJO_PAYMENT_WEBHOOK_SECRET must be a private value of at least 32 characters when KONJO_AUTH_MODE=provider.');
    }
    if (config.authPepper === 'konjo-local-development-pepper-change-before-deployment' || config.authPepper.length < 32) {
      throw new Error('KONJO_AUTH_PEPPER must be a private value of at least 32 characters when KONJO_AUTH_MODE=provider.');
    }
  }
  const logger = createStructuredLogger({ level: config.logLevel, clock: systemClock });
  const paymentGateway = createPaymentGateway(config.paymentWebhookSecret, config.chapaSecretKey, {
    sandboxCheckoutBaseUrl: config.paymentSandboxCheckout ? config.publicApiUrl : null,
    useSandbox: config.paymentSandboxCheckout,
    checkoutReturnUrl: config.publicWebUrl,
    webhookBaseUrl: config.publicApiUrl,
    chapaPublicKey: config.chapaPublicKey,
    chapaEncryptionKey: config.chapaEncryptionKey,
  });
  const notificationGateway = createNotificationGateway({
    mode: config.authMode,
    deliveryUrl: config.notificationDeliveryUrl,
    deliveryToken: config.notificationDeliveryToken,
    smsEthiopiaApiKey: config.smsEthiopiaApiKey,
    expoAccessToken: config.expoAccessToken,
  });
  const database = new KonjoDatabase(config.databasePath);
  if (config.authMode === 'provider' && (!config.supabaseUrl || !config.supabaseSecretKey)) {
    database.close();
    throw new Error(
      'KONJO_SUPABASE_URL and KONJO_SUPABASE_SECRET_KEY are required when KONJO_AUTH_MODE=provider.',
    );
  }
  if (config.authMode === 'provider' && (!config.workerToken || config.workerToken.length < 32)) {
    database.close();
    throw new Error(
      'KONJO_WORKER_TOKEN must contain at least 32 characters when KONJO_AUTH_MODE=provider.',
    );
  }
  const supabaseProfessionalOnboarding = config.authMode === 'provider'
    ? new SupabaseProfessionalOnboardingRepository(config.supabaseUrl!, config.supabaseSecretKey!)
    : null;
  const professionalPortfolioStore = config.authMode === 'provider'
    ? new SupabaseProfessionalPortfolioRepository(config.supabaseUrl!, config.supabaseSecretKey!)
    : new EmptyProfessionalPortfolioRepository();
  const supabaseMarketplace = config.authMode === 'provider'
    ? new SupabaseMarketplaceReadRepository(config.supabaseUrl!, config.supabaseSecretKey!)
    : null;
  const supabaseBookings = config.authMode === 'provider'
    ? new SupabaseBookingRepository(config.supabaseUrl!, config.supabaseSecretKey!)
    : null;
  const supabaseProfessionalOperations = config.authMode === 'provider'
    ? new SupabaseProfessionalOperationsRepository(config.supabaseUrl!, config.supabaseSecretKey!)
    : null;
  const supabaseClientData = config.authMode === 'provider'
    ? new SupabaseClientDataRepository(config.supabaseUrl!, config.supabaseSecretKey!)
    : null;
  const supabaseBookingTracking = config.authMode === 'provider'
    ? new SupabaseBookingTrackingRepository(config.supabaseUrl!, config.supabaseSecretKey!)
    : null;
  const supabasePaymentOperations = config.authMode === 'provider'
    ? new SupabasePaymentOperationsRepository(config.supabaseUrl!, config.supabaseSecretKey!)
    : null;
  const supabaseEventWorkers = config.authMode === 'provider'
    ? new SupabaseEventWorkerRepository(config.supabaseUrl!, config.supabaseSecretKey!)
    : null;
  const supabaseTrustSafety = config.authMode === 'provider'
    ? new SupabaseTrustSafetyRepository(config.supabaseUrl!, config.supabaseSecretKey!)
    : null;
  const supabaseAdminReads = config.authMode === 'provider'
    ? new SupabaseAdminReadRepository(config.supabaseUrl!, config.supabaseSecretKey!)
    : null;
  const supabaseAdminOperations = config.authMode === 'provider'
    ? new SupabaseAdminOperationsRepository(config.supabaseUrl!, config.supabaseSecretKey!)
    : null;
  const accountAssetCleaner = config.authMode === 'provider'
    ? new SupabaseAccountAssetCleaner(config.supabaseUrl!, config.supabaseSecretKey!)
    : new EmptyAccountAssetCleaner();
  const readinessProbe = config.authMode === 'provider'
    ? new SupabaseReadinessProbe(config.supabaseUrl!, config.supabaseSecretKey!)
    : database.readinessProbe;
  const sessions = new SessionManager(
    database.sessionStore,
    sessionTokenSecurity,
    systemClock,
    config.sessionLifetimeMs,
  );
  const accessTokenAuthenticator = new AccessTokenAuthenticator(
    sessions,
    new SupabaseAccessTokenResolver(config.supabaseUrl, config.supabasePublishableKey),
    database.externalAccountProjection,
  );
  const otpSender = createOtpSender({
    mode: config.authMode,
    deliveryUrl: config.otpDeliveryUrl,
    deliveryToken: config.otpDeliveryToken,
  });
  const otpSecurity = createOtpSecurity(config.authPepper);
  const domainEvents = new DomainEventProcessor(
    supabaseEventWorkers ?? database.domainEventStore,
    [
      new BookingNotificationProjector(supabaseEventWorkers ?? database.notificationCommandStore),
      new PaymentNotificationProjector(supabaseEventWorkers ?? database.notificationCommandStore),
      new ProfessionalApprovalNotificationProjector(supabaseEventWorkers ?? database.notificationCommandStore),
      new ProfessionalApplicationSubmittedHandler(),
      new TrustSafetyNotificationProjector(supabaseEventWorkers ?? database.notificationCommandStore),
      new PayoutNotificationProjector(supabaseEventWorkers ?? database.notificationCommandStore),
      new AccountAssetDeletionProjector(accountAssetCleaner),
    ],
    randomIdGenerator,
    systemClock,
    {
      batchSize: 50,
      leaseMs: 30_000,
      maxAttempts: 5,
      baseRetryMs: 1_000,
      maxRetryMs: 60_000,
    },
  );
  const identityVerifier = createIdentityVerifier({
    mode: config.authMode,
    verificationUrl: config.faydaVerificationUrl,
    verificationToken: config.faydaVerificationToken,
  });
  const passwordResetSender = createPasswordResetSender({
    mode: config.authMode,
    deliveryUrl: config.emailDeliveryUrl,
    deliveryToken: config.emailDeliveryToken,
    resetUrl: config.passwordResetUrl,
  });
  return {
    config,
    database,
    logger,
    readiness: new CheckReadiness(readinessProbe),
    accessTokenAuthenticator,
    passwordResets: new PasswordResetManager(
      database.passwordResetStore,
      passwordResetSender,
      passwordSecurity,
      sessionTokenSecurity,
      systemClock,
      {
        lifetimeMs: config.passwordResetLifetimeMs,
        exposeDevelopmentToken: config.authMode === 'development',
      },
    ),
    accounts: new AccountAuthenticator(
      database.accountAuthenticationStore,
      passwordSecurity,
      randomIdGenerator,
      systemClock,
      {
        enabled: config.authMode === 'development',
        email: config.developmentAdminEmail,
        password: config.developmentAdminPassword,
      },
    ),
    clientAccounts: new ManageClientAccount(
      supabaseClientData ?? database.clientAccountCommandStore,
      randomIdGenerator,
      systemClock,
    ),
    clientAddresses: new ManageClientAddresses(
      supabaseClientData ?? database.clientAddressCommandStore,
      randomIdGenerator,
      systemClock,
    ),
    clientPreferences: new ManageClientPreferences(
      supabaseClientData ?? database.clientPreferenceCommandStore,
      randomIdGenerator,
      systemClock,
    ),
    clientReads: new ReadClientModel(
      database.clientReadStore,
      supabaseMarketplace ?? database.clientReadStore,
      supabaseBookings ?? database.clientReadStore,
      supabaseClientData ?? database.clientReadStore,
    ),
    marketplaceReads: new ReadMarketplace(
      supabaseMarketplace ?? database.marketplaceReadStore,
      systemClock,
    ),
    professionalSelfService: new ManageProfessionalSelfService(
      supabaseProfessionalOperations ?? database.professionalSelfServiceCommandStore,
      systemClock,
    ),
    professionalReads: new ReadProfessionalModel(
      database.professionalReadStore,
      systemClock,
      supabaseProfessionalOnboarding ?? database.professionalReadStore,
      supabaseMarketplace ?? database.professionalReadStore,
      supabaseProfessionalOperations ?? database.professionalReadStore,
    ),
    professionalPortfolio: new ReadProfessionalPortfolio(professionalPortfolioStore),
    submitProfessionalApplication: new SubmitProfessionalApplicationHandler(
      supabaseProfessionalOnboarding ?? database.professionalApplicationCommandStore,
      randomIdGenerator,
      systemClock,
    ),
    // No geocoding provider is wired yet (Google Maps Platform is not used in
    // Konjo). Plug a provider into SearchAddresses here; the app hides the
    // address search box while this is null.
    addressSearch: null as SearchAddresses | null,
    professionalMockAuth: config.professionalMockOtpEnabled &&
      config.supabaseUrl && config.supabaseSecretKey && config.supabasePublishableKey
      ? new SupabaseProfessionalMockAuth(
        config.supabaseUrl,
        config.supabaseSecretKey,
        config.supabasePublishableKey,
      )
      : null,
    adminExportAudit: new RecordAdminExportAudit(
      supabaseAdminOperations ?? database.adminAuditStore,
      randomIdGenerator,
      systemClock,
    ),
    verifyIdentity: new VerifyIdentity(
      supabaseMarketplace ?? database.identityVerificationStore,
      identityVerifier,
      systemClock,
    ),
    sessions,
    backgroundJobs: new BackgroundJobProcessor(
      supabaseEventWorkers ?? database.backgroundJobStore,
      notificationGateway,
      systemClock,
      domainEvents,
    ),
    requestOtp: new RequestOtpHandler(
      database.otpChallengeStore,
      otpSender,
      randomIdGenerator,
      otpSecurity,
      systemClock,
      {
        lifetimeMs: config.otpLifetimeMs,
        requestWindowMs: config.otpRequestWindowMs,
        requestsPerWindow: config.otpRequestsPerWindow,
        attempts: config.otpAttempts,
        exposeDevelopmentCode: config.authMode === 'development',
      },
    ),
    verifyOtp: new VerifyOtpHandler(
      database.otpChallengeStore,
      otpSecurity,
      randomIdGenerator,
      systemClock,
    ),
    createBooking: new CreateBookingHandler(
      supabaseBookings ?? database.bookingCommandStore,
    ),
    initiateBookingPayment: new InitiateBookingPaymentHandler(
      supabaseBookings ?? database.bookingPaymentStore,
      paymentGateway,
      systemClock,
    ),
    cancelBooking: new CancelBookingHandler(
      supabaseBookings ?? database.bookingCancellationStore,
      systemClock,
    ),
    archiveBooking: new ArchiveBookingHandler(
      supabaseBookings ?? database.bookingCancellationStore,
      systemClock,
    ),
    domainEventDeadLetters: new DomainEventDeadLetterManager(
      supabaseEventWorkers ?? database.domainEventRecoveryStore,
      systemClock,
    ),
    rescheduleBooking: new RescheduleBookingHandler(
      supabaseBookings ?? database.bookingRescheduleStore,
      systemClock,
    ),
    transitionProfessionalBooking: new TransitionProfessionalBookingHandler(
      supabaseProfessionalOperations ?? database.professionalBookingTransitionStore,
      systemClock,
    ),
    bookingTracking: new BookingTrackingHandler(
      supabaseBookingTracking ?? database.bookingTrackingStore,
      systemClock,
    ),
    submitBookingReview: new SubmitBookingReviewHandler(
      supabaseBookings ?? database.bookingReviewStore,
      randomIdGenerator,
      systemClock,
    ),
    processPaymentWebhook: new ProcessPaymentWebhookHandler(
      supabasePaymentOperations ?? database.paymentEventStore,
      paymentGateway,
      sha256PayloadHasher,
      systemClock,
    ),
    verifyBookingPayment: new VerifyBookingPaymentHandler(
      supabaseBookings ?? database.bookingPaymentStore,
      supabasePaymentOperations ?? database.paymentEventStore,
      paymentGateway,
      sha256PayloadHasher,
      systemClock,
    ),
    paymentKeyMode: config.chapaSecretKey ? chapaKeyMode(config.chapaSecretKey) : null,
    professionalPayouts: new ManageProfessionalPayouts(
      supabasePaymentOperations ?? database.professionalPayoutCommandStore,
      randomIdGenerator,
      systemClock,
    ),
    trustSafety: new ManageTrustSafety(
      supabaseTrustSafety ?? database.trustSafetyCommandStore,
      randomIdGenerator,
      systemClock,
    ),
    adminCatalog: new ManageAdminCatalog(
      supabaseAdminOperations ?? database.adminCatalogCommandStore,
      randomIdGenerator,
      systemClock,
    ),
    adminPayouts: new ManageAdminPayouts(
      supabaseAdminOperations ?? database.adminPayoutCommandStore,
      randomIdGenerator,
      systemClock,
    ),
    adminProfessionals: new ManageAdminProfessionals(
      supabaseAdminOperations ?? database.adminProfessionalCommandStore,
      randomIdGenerator,
      systemClock,
      supabaseProfessionalOnboarding ?? database.adminProfessionalCommandStore,
    ),
    adminReads: new ReadAdminModel(
      supabaseAdminReads ?? database.adminReadStore,
      supabaseProfessionalOnboarding ?? database.adminReadStore,
    ),
  };
}
