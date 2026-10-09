import { AccountAssetDeletionProjector } from '../../../backend/src/application/account-asset-deletion-projector.ts';
import { ArchiveBookingHandler } from '../../../backend/src/application/archive-booking.ts';
import { AccessTokenAuthenticator } from '../../../backend/src/application/authenticate-access-token.ts';
import { BookingNotificationProjector } from '../../../backend/src/application/booking-notification-projector.ts';
import { CancelBookingHandler } from '../../../backend/src/application/cancel-booking.ts';
import { CheckReadiness } from '../../../backend/src/application/check-readiness.ts';
import { CreateBookingHandler } from '../../../backend/src/application/create-booking.ts';
import { InitiateBookingPaymentHandler } from '../../../backend/src/application/initiate-booking-payment.ts';
import { ManageAdminCatalog } from '../../../backend/src/application/manage-admin-catalog.ts';
import { ManageAdminPayouts } from '../../../backend/src/application/manage-admin-payouts.ts';
import { ManageAdminProfessionals } from '../../../backend/src/application/manage-admin-professionals.ts';
import { ManageClientAccount } from '../../../backend/src/application/manage-client-account.ts';
import { ManageClientAddresses } from '../../../backend/src/application/manage-client-addresses.ts';
import { ManageClientPreferences } from '../../../backend/src/application/manage-client-preferences.ts';
import { DomainEventDeadLetterManager } from '../../../backend/src/application/manage-domain-event-dead-letters.ts';
import { ManageProfessionalPayouts } from '../../../backend/src/application/manage-professional-payouts.ts';
import { ManageProfessionalSelfService } from '../../../backend/src/application/manage-professional-self-service.ts';
import { ManageTrustSafety } from '../../../backend/src/application/manage-trust-safety.ts';
import { PaymentNotificationProjector } from '../../../backend/src/application/payment-notification-projector.ts';
import { PayoutNotificationProjector } from '../../../backend/src/application/payout-notification-projector.ts';
import { BackgroundJobProcessor } from '../../../backend/src/application/process-background-jobs.ts';
import { DomainEventProcessor } from '../../../backend/src/application/process-domain-events.ts';
import { ProcessPaymentWebhookHandler } from '../../../backend/src/application/process-payment-webhook.ts';
import {
  ProfessionalApplicationSubmittedHandler,
  ProfessionalApprovalNotificationProjector,
} from '../../../backend/src/application/professional-approval-notification-projector.ts';
import { ReadAdminModel } from '../../../backend/src/application/read-admin-model.ts';
import { ReadClientModel } from '../../../backend/src/application/read-client-model.ts';
import { ReadMarketplace } from '../../../backend/src/application/read-marketplace.ts';
import { ReadProfessionalModel } from '../../../backend/src/application/read-professional-model.ts';
import { ReadProfessionalPortfolio } from '../../../backend/src/application/read-professional-portfolio.ts';
import { RecordAdminExportAudit } from '../../../backend/src/application/record-admin-export-audit.ts';
import { BookingTrackingHandler } from '../../../backend/src/application/record-booking-location.ts';
import { RescheduleBookingHandler } from '../../../backend/src/application/reschedule-booking.ts';
import { SubmitBookingReviewHandler } from '../../../backend/src/application/submit-booking-review.ts';
import { SubmitProfessionalApplicationHandler } from '../../../backend/src/application/submit-professional-application.ts';
import { TransitionProfessionalBookingHandler } from '../../../backend/src/application/transition-professional-booking.ts';
import { TrustSafetyNotificationProjector } from '../../../backend/src/application/trust-safety-notification-projector.ts';
import { VerifyBookingPaymentHandler } from '../../../backend/src/application/verify-booking-payment.ts';
import { VerifyIdentity } from '../../../backend/src/application/verify-identity.ts';
import type { ClientReadStore, ProfessionalReadStore } from '../../../backend/src/application/ports.ts';
import { SupabaseAccessTokenResolver } from '../../../backend/src/adapters/supabase-access-token-resolver.ts';
import { SupabaseAccountAssetCleaner } from '../../../backend/src/adapters/supabase-account-asset-cleaner.ts';
import { SupabaseAdminOperationsRepository } from '../../../backend/src/adapters/supabase-admin-operations-repository.ts';
import { SupabaseAdminReadRepository } from '../../../backend/src/adapters/supabase-admin-read-repository.ts';
import { SupabaseBookingRepository } from '../../../backend/src/adapters/supabase-booking-repository.ts';
import { SupabaseBookingTrackingRepository } from '../../../backend/src/adapters/supabase-booking-tracking-repository.ts';
import { SupabaseClientDataRepository } from '../../../backend/src/adapters/supabase-client-data-repository.ts';
import { SupabaseEventWorkerRepository } from '../../../backend/src/adapters/supabase-event-worker-repository.ts';
import { SupabaseMarketplaceReadRepository } from '../../../backend/src/adapters/supabase-marketplace-read-repository.ts';
import { SupabasePaymentOperationsRepository } from '../../../backend/src/adapters/supabase-payment-operations-repository.ts';
import { SupabaseProfessionalOnboardingRepository } from '../../../backend/src/adapters/supabase-professional-onboarding-repository.ts';
import { SupabaseProfessionalOperationsRepository } from '../../../backend/src/adapters/supabase-professional-operations-repository.ts';
import { SupabaseProfessionalPortfolioRepository } from '../../../backend/src/adapters/supabase-professional-portfolio-repository.ts';
import { SupabaseReadinessProbe } from '../../../backend/src/adapters/supabase-readiness-probe.ts';
import { SupabaseTrustSafetyRepository } from '../../../backend/src/adapters/supabase-trust-safety-repository.ts';
import { SupabaseWebsiteSubmissionRepository } from '../../../backend/src/adapters/supabase-website-submission-repository.ts';
import { chapaKeyMode } from '../../../backend/src/adapters/chapa-key-mode.ts';
import { createIdentityVerifier } from '../../../backend/src/adapters/identity-verifier.ts';
import { createNotificationGateway } from '../../../backend/src/adapters/notification-gateway.ts';
import { createPaymentGateway } from '../../../backend/src/adapters/payment-gateway.ts';
import { randomIdGenerator } from '../../../backend/src/adapters/random-id-generator.ts';
import { sha256PayloadHasher } from '../../../backend/src/adapters/sha256-payload-hasher.ts';
import { createStructuredLogger } from '../../../backend/src/adapters/structured-logger.ts';
import { systemClock } from '../../../backend/src/adapters/system-clock.ts';
import { backendConfig } from '../../../backend/src/config.ts';

function unavailable(name: string): never {
  throw new Error(`${name} is handled by Supabase Auth in provider mode.`);
}

export function createEdgeBackendDependencies() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.replace(/\/$/, '') ?? null;
  const supabaseSecretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? null;
  const supabasePublishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? null;
  const config = {
    ...backendConfig,
    production: Deno.env.get('KONJO_ENVIRONMENT') === 'production',
    authMode: 'provider' as const,
    databasePath: ':memory:',
    supabaseUrl,
    supabaseSecretKey,
    supabasePublishableKey,
    inProcessJobs: false,
    professionalMockOtpEnabled: false,
    paymentSandboxCheckout: false,
    publicApiUrl: supabaseUrl ? `${supabaseUrl}/functions/v1/api` : '',
    publicWebUrl: Deno.env.get('KONJO_PUBLIC_WEB_URL') ?? 'https://konjoet.com',
    allowedOrigins: new Set(
      (Deno.env.get('KONJO_ALLOWED_ORIGINS') ?? 'https://konjoet.com')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  };
  if (!supabaseUrl || !supabaseSecretKey || !supabasePublishableKey) {
    throw new Error('Supabase Edge API is missing its project credentials.');
  }
  if (!config.workerToken || config.workerToken.length < 32) {
    throw new Error('KONJO_WORKER_TOKEN must contain at least 32 characters.');
  }
  if (config.paymentWebhookSecret.length < 32) {
    throw new Error('KONJO_PAYMENT_WEBHOOK_SECRET must contain at least 32 characters.');
  }

  const url = supabaseUrl;
  const secret = supabaseSecretKey;
  const logger = createStructuredLogger({ level: config.logLevel, clock: systemClock });
  const onboarding = new SupabaseProfessionalOnboardingRepository(url, secret);
  const portfolio = new SupabaseProfessionalPortfolioRepository(url, secret);
  const marketplace = new SupabaseMarketplaceReadRepository(url, secret);
  const bookings = new SupabaseBookingRepository(url, secret);
  const professionalOperations = new SupabaseProfessionalOperationsRepository(url, secret);
  const clientData = new SupabaseClientDataRepository(url, secret);
  const bookingTracking = new SupabaseBookingTrackingRepository(url, secret);
  const paymentOperations = new SupabasePaymentOperationsRepository(url, secret);
  const eventWorkers = new SupabaseEventWorkerRepository(url, secret);
  const trustSafetyStore = new SupabaseTrustSafetyRepository(url, secret);
  const adminReadsStore = new SupabaseAdminReadRepository(url, secret);
  const adminOperations = new SupabaseAdminOperationsRepository(url, secret);
  const accountAssets = new SupabaseAccountAssetCleaner(url, secret);
  const websiteSubmissions = new SupabaseWebsiteSubmissionRepository(url, secret);
  const paymentGateway = createPaymentGateway(config.paymentWebhookSecret, config.chapaSecretKey, {
    useSandbox: false,
    checkoutReturnUrl: config.publicWebUrl,
    webhookBaseUrl: config.publicApiUrl,
    chapaPublicKey: config.chapaPublicKey,
    chapaEncryptionKey: config.chapaEncryptionKey,
  });
  const notificationGateway = createNotificationGateway({
    mode: 'provider',
    deliveryUrl: config.notificationDeliveryUrl,
    deliveryToken: config.notificationDeliveryToken,
    smsEthiopiaApiKey: config.smsEthiopiaApiKey,
    expoAccessToken: config.expoAccessToken,
  });
  const domainEvents = new DomainEventProcessor(
    eventWorkers,
    [
      new BookingNotificationProjector(eventWorkers),
      new PaymentNotificationProjector(eventWorkers),
      new ProfessionalApprovalNotificationProjector(eventWorkers),
      new ProfessionalApplicationSubmittedHandler(),
      new TrustSafetyNotificationProjector(eventWorkers),
      new PayoutNotificationProjector(eventWorkers),
      new AccountAssetDeletionProjector(accountAssets),
    ],
    randomIdGenerator,
    systemClock,
    { batchSize: 50, leaseMs: 30_000, maxAttempts: 5, baseRetryMs: 1_000, maxRetryMs: 60_000 },
  );
  const accessTokenAuthenticator = new AccessTokenAuthenticator(
    { resolve: () => null },
    new SupabaseAccessTokenResolver(url, supabasePublishableKey),
    { synchronize: (user) => user },
  );
  const clientReads = new ReadClientModel(
    clientData as unknown as ClientReadStore,
    marketplace,
    bookings,
    clientData,
  );
  const professionalReads = new ReadProfessionalModel(
    onboarding as unknown as ProfessionalReadStore,
    systemClock,
    onboarding,
    marketplace,
    professionalOperations,
  );

  return {
    config,
    logger,
    database: {
      websiteSubmissionStore: websiteSubmissions,
      close: () => undefined,
    },
    websiteApplicationFiles: websiteSubmissions,
    readiness: new CheckReadiness(new SupabaseReadinessProbe(url, secret)),
    accessTokenAuthenticator,
    passwordResets: {
      request: () => unavailable('Password recovery'),
      confirm: () => unavailable('Password recovery'),
    },
    accounts: {
      registerClient: () => unavailable('Email registration'),
      loginClient: () => unavailable('Client sign in'),
      loginAdmin: () => unavailable('Administrator sign in'),
    },
    sessions: {
      resolve: () => null,
      revoke: () => undefined,
      issue: () => unavailable('Legacy sessions'),
    },
    requestOtp: { execute: () => unavailable('Legacy OTP') },
    verifyOtp: { execute: () => unavailable('Legacy OTP') },
    professionalMockAuth: null,
    addressSearch: null,
    clientAccounts: new ManageClientAccount(clientData, randomIdGenerator, systemClock),
    clientAddresses: new ManageClientAddresses(clientData, randomIdGenerator, systemClock),
    clientPreferences: new ManageClientPreferences(clientData, randomIdGenerator, systemClock),
    clientReads,
    marketplaceReads: new ReadMarketplace(marketplace, systemClock),
    professionalSelfService: new ManageProfessionalSelfService(professionalOperations, systemClock),
    professionalReads,
    professionalPortfolio: new ReadProfessionalPortfolio(portfolio),
    submitProfessionalApplication: new SubmitProfessionalApplicationHandler(onboarding, randomIdGenerator, systemClock),
    adminExportAudit: new RecordAdminExportAudit(adminOperations, randomIdGenerator, systemClock),
    verifyIdentity: new VerifyIdentity(
      marketplace,
      createIdentityVerifier({
        mode: 'provider',
        verificationUrl: config.faydaVerificationUrl,
        verificationToken: config.faydaVerificationToken,
      }),
      systemClock,
    ),
    backgroundJobs: new BackgroundJobProcessor(eventWorkers, notificationGateway, systemClock, domainEvents),
    domainEventDeadLetters: new DomainEventDeadLetterManager(eventWorkers, systemClock),
    createBooking: new CreateBookingHandler(bookings),
    initiateBookingPayment: new InitiateBookingPaymentHandler(bookings, paymentGateway, systemClock),
    verifyBookingPayment: new VerifyBookingPaymentHandler(
      bookings,
      paymentOperations,
      paymentGateway,
      sha256PayloadHasher,
      systemClock,
    ),
    cancelBooking: new CancelBookingHandler(bookings, systemClock),
    archiveBooking: new ArchiveBookingHandler(bookings, systemClock),
    rescheduleBooking: new RescheduleBookingHandler(bookings, systemClock),
    transitionProfessionalBooking: new TransitionProfessionalBookingHandler(professionalOperations, systemClock),
    bookingTracking: new BookingTrackingHandler(bookingTracking, systemClock),
    submitBookingReview: new SubmitBookingReviewHandler(bookings, randomIdGenerator, systemClock),
    processPaymentWebhook: new ProcessPaymentWebhookHandler(
      paymentOperations,
      paymentGateway,
      sha256PayloadHasher,
      systemClock,
    ),
    paymentKeyMode: config.chapaSecretKey ? chapaKeyMode(config.chapaSecretKey) : null,
    professionalPayouts: new ManageProfessionalPayouts(paymentOperations, randomIdGenerator, systemClock),
    trustSafety: new ManageTrustSafety(trustSafetyStore, randomIdGenerator, systemClock),
    adminCatalog: new ManageAdminCatalog(adminOperations, randomIdGenerator, systemClock),
    adminPayouts: new ManageAdminPayouts(adminOperations, randomIdGenerator, systemClock),
    adminProfessionals: new ManageAdminProfessionals(
      adminOperations,
      randomIdGenerator,
      systemClock,
      onboarding,
    ),
    adminReads: new ReadAdminModel(adminReadsStore, onboarding),
  };
}
