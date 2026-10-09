import type { AccountAuthenticator } from '../application/authenticate-accounts.ts';
import type { AccessTokenAuthenticator } from '../application/authenticate-access-token.ts';
import type { ArchiveBookingHandler } from '../application/archive-booking.ts';
import type { BackgroundJobProcessor } from '../application/process-background-jobs.ts';
import type { BookingTrackingHandler } from '../application/record-booking-location.ts';
import type { CancelBookingHandler } from '../application/cancel-booking.ts';
import type { CheckReadiness } from '../application/check-readiness.ts';
import type { CreateBookingHandler } from '../application/create-booking.ts';
import type { DomainEventDeadLetterManager } from '../application/manage-domain-event-dead-letters.ts';
import type { InitiateBookingPaymentHandler } from '../application/initiate-booking-payment.ts';
import type { ManageAdminCatalog } from '../application/manage-admin-catalog.ts';
import type { ManageAdminPayouts } from '../application/manage-admin-payouts.ts';
import type { ManageAdminProfessionals } from '../application/manage-admin-professionals.ts';
import type { ManageClientAccount } from '../application/manage-client-account.ts';
import type { ManageClientAddresses } from '../application/manage-client-addresses.ts';
import type { ManageClientPreferences } from '../application/manage-client-preferences.ts';
import type { PasswordResetManager } from '../application/manage-password-reset.ts';
import type { ManageProfessionalPayouts } from '../application/manage-professional-payouts.ts';
import type { ManageProfessionalSelfService } from '../application/manage-professional-self-service.ts';
import type { SessionManager } from '../application/manage-sessions.ts';
import type { ManageTrustSafety } from '../application/manage-trust-safety.ts';
import type { ProcessPaymentWebhookHandler } from '../application/process-payment-webhook.ts';
import type { ReadAdminModel } from '../application/read-admin-model.ts';
import type { ReadClientModel } from '../application/read-client-model.ts';
import type { ReadMarketplace } from '../application/read-marketplace.ts';
import type { ReadProfessionalModel } from '../application/read-professional-model.ts';
import type { ReadProfessionalPortfolio } from '../application/read-professional-portfolio.ts';
import type { RecordAdminExportAudit } from '../application/record-admin-export-audit.ts';
import type { RequestOtpHandler } from '../application/request-otp.ts';
import type { RescheduleBookingHandler } from '../application/reschedule-booking.ts';
import type { SearchAddresses } from '../application/search-addresses.ts';
import type { SubmitBookingReviewHandler } from '../application/submit-booking-review.ts';
import type { SubmitProfessionalApplicationHandler } from '../application/submit-professional-application.ts';
import type { TransitionProfessionalBookingHandler } from '../application/transition-professional-booking.ts';
import type { VerifyBookingPaymentHandler } from '../application/verify-booking-payment.ts';
import type { VerifyIdentity } from '../application/verify-identity.ts';
import type { VerifyOtpHandler } from '../application/verify-otp.ts';
import type { ProfessionalMockAuthentication } from '../application/ports.ts';
import type { createStructuredLogger } from '../adapters/structured-logger.ts';
import type { BackendConfig } from '../config.ts';
import type { MultipartFile } from '../multipart.ts';
import type { StoredApplicationFile } from '../uploads.ts';

export interface WebsiteSubmissionStore {
  createContactMessage(input: {
    id: string;
    fullName: string;
    email: string;
    topic: string;
    message: string;
    recipient: string;
    submittedAt: string;
  }): Promise<void> | void;
  createProfessionalApplication(input: {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    location: string;
    specialties: string;
    languages: string;
    yearsExperience: number;
    introduction: string;
    files: ReadonlyArray<{
      fieldName: string;
      originalName: string;
      storedName: string;
      mimeType: string;
      size: number;
    }>;
    submittedAt: string;
  }): Promise<void> | void;
}

export interface WebsiteApplicationFileStore {
  store(
    applicationId: string,
    files: ReadonlyArray<MultipartFile>,
  ): Promise<ReadonlyArray<StoredApplicationFile>>;
}

export interface BackendDependencies {
  config: BackendConfig;
  database: { websiteSubmissionStore: WebsiteSubmissionStore; close(): void };
  websiteApplicationFiles: WebsiteApplicationFileStore;
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
  addressSearch: SearchAddresses | null;
  professionalMockAuth: ProfessionalMockAuthentication | null;
}
