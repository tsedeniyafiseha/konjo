import { SessionController, type SessionControllerLogger } from '@/application/auth/session-controller';
import type { AdminAuthenticationGateway } from '@/application/auth/admin-auth-contracts';
import { AdminDocumentController, type AdminDocumentControllerLogger } from '@/application/admin-documents/admin-document-controller';
import type { AdminDocumentPreviewGateway, AdminDocumentRepository } from '@/application/admin-documents/admin-document-contracts';
import { BookingDraftController, type BookingDraftControllerLogger } from '@/application/booking/booking-draft-controller';
import { ClientAccountController, type ClientAccountControllerLogger } from '@/application/client-account/client-account-controller';
import type { ClientPreferredLanguage } from '@/application/client-account/client-account-contracts';
import { DiscoveryController, type DiscoveryControllerLogger } from '@/application/discovery/discovery-controller';
import { ClientDataController, type ClientDataControllerLogger } from '@/application/client-data/client-data-controller';
import { ProfessionalDataController, type ProfessionalDataControllerLogger } from '@/application/professional-data/professional-data-controller';
import { ProfessionalDocumentController, type ProfessionalDocumentControllerLogger } from '@/application/professional-documents/professional-document-controller';
import type { ProfessionalDocumentRepository, ProfessionalDocumentStorage } from '@/application/professional-documents/professional-document-contracts';
import { ProfessionalRegistrationController, type ProfessionalRegistrationControllerLogger } from '@/application/professional-registration/professional-registration-controller';
import { initialProfessionalRegistrationDraft } from '@/application/professional-registration/professional-registration-contracts';
import { ClientLanguageController, type ClientLanguageControllerLogger } from '@/application/language/client-language-controller';
import type { ClientAuthenticationGateway } from '@/application/auth/client-auth-contracts';
import { ClientIdentityDocumentController, type ClientIdentityDocumentControllerLogger } from '@/application/client-identity-documents/client-identity-document-controller';
import type { ClientIdentityDocumentRepository, ClientIdentityDocumentStorage } from '@/application/client-identity-documents/client-identity-document-contracts';
import {
  SupabaseClientAuthGateway,
  SupabaseProfessionalAuthGateway,
} from '@/adapters/supabase/supabase-client-auth-gateway';
import { SupabasePhoneAuthGateway } from '@/adapters/supabase/supabase-phone-auth-gateway';
import { SupabaseProfessionalRegistrationOtpMock } from '@/adapters/supabase/supabase-professional-registration-otp-mock';
import {
  SupabaseClientIdentityDocumentRepository,
  SupabaseClientIdentityDocumentStorage,
} from '@/adapters/supabase/supabase-client-identity-document-adapters';
import { supabaseClientRegistrationGateway } from '@/adapters/supabase/supabase-client-registration-gateway';
import { SupabaseProfessionalRegistrationGateway } from '@/adapters/supabase/supabase-professional-registration-gateway';
import { SupabaseAdminAuthGateway } from '@/adapters/supabase/supabase-admin-auth-gateway';
import {
  SupabaseAdminDocumentPreviewGateway,
  SupabaseAdminDocumentRepository,
} from '@/adapters/supabase/supabase-admin-document-adapters';
import { supabaseAuthPort } from '@/adapters/supabase/supabase-auth-port';
import {
  SupabaseAwareSessionRevocationGateway,
  SupabaseAwareSessionStorage,
  SupabaseExternalSessionSource,
} from '@/adapters/supabase/supabase-session-adapters';
import {
  SupabaseProfessionalDocumentRepository,
  SupabaseProfessionalDocumentStorage,
} from '@/adapters/supabase/supabase-professional-document-adapters';
import { apiSessionRevocationGateway } from '@/features/auth/session-api-gateway';
import { apiAdminAuthenticationGateway } from '@/features/admin/admin-auth-adapters';
import { expoAdminDocumentViewer } from '@/features/admin/documents/admin-document-viewer';
import { secureSessionStorage } from '@/features/auth/session-store';
import {
  apiClientAuthGateway,
  developmentClientAuthGateway,
  unavailableClientAuthGateway,
} from '@/features/auth/client-auth-service';
import { authService } from '@/features/auth/auth-service';
import type { PhoneAuthenticationGateway } from '@/application/auth/phone-auth-contracts';
import { secureBookingDraftStorage } from '@/features/booking/booking-draft-store';
import { bookingRequestIdGenerator } from '@/features/booking/booking-request-id-generator';
import { apiClientAccountGateway } from '@/features/client/account/client-account-gateway';
import {
  expoClientIdentityDocumentPicker,
  systemClientIdentityDocumentRuntime,
} from '@/features/client/identity-documents/client-identity-document-adapters';
import { systemClientAccountRuntime } from '@/features/client/account/client-account-runtime';
import { secureClientAccountCache } from '@/features/client/account/client-account-store';
import { bookingTimeSlots } from '@/features/booking/data';
import { onlinePaymentsEnabled } from '@/features/booking/payment-mode';
import {
  professionals as developmentProfessionals,
  serviceCategories as developmentCategories,
} from '@/features/discovery/data';
import { apiBlockedProfessionalsGateway, apiDiscoveryGateway } from '@/features/discovery/discovery-gateway';
import { secureBlockedProfessionalsStorage } from '@/features/discovery/blocked-professionals-store';
import {
  clientBookingGateway,
  clientPreferencesGateway,
  systemClientDataRuntime,
  systemClientDataScheduler,
} from '@/features/client/client-data-adapters';
import {
  apiProfessionalDataGateway,
  systemProfessionalDataRuntime,
  systemProfessionalDataScheduler,
} from '@/features/professional/professional-data-adapters';
import { professionalDataFallback } from '@/features/professional/professional-data-fallback';
import {
  expoProfessionalDocumentPicker,
  systemProfessionalDocumentRuntime,
} from '@/features/professional/documents/professional-document-adapters';
import {
  apiProfessionalRegistrationGateway,
  systemProfessionalRegistrationRuntime,
} from '@/features/professional/registration/professional-registration-adapters';
import { secureProfessionalRegistrationStorage } from '@/features/professional/registration/professional-registration-store';
import {
  deviceClientLanguageDetector,
  secureClientLanguageStorage,
} from '@/localization/client-language-adapters';
import { apiBaseUrl } from '@/services/api-client';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import { createSupabaseLiveUpdatesGateway } from '@/adapters/supabase/supabase-live-updates-gateway';
import { createSupabaseLegalAcceptanceGateway } from '@/adapters/supabase/supabase-legal-acceptance-gateway';
export const liveUpdatesGateway = createSupabaseLiveUpdatesGateway(supabase);
export const legalAcceptanceGateway = createSupabaseLegalAcceptanceGateway(supabase);

export interface ClientDependencies {
  sessionController: SessionController;
  adminAuthenticationGateway: AdminAuthenticationGateway;
  createAdminDocumentController(): AdminDocumentController;
  clientAuthenticationGateway: ClientAuthenticationGateway;
  professionalAuthenticationGateway: ClientAuthenticationGateway | null;
  phoneAuthenticationGateway: PhoneAuthenticationGateway;
  languageController: ClientLanguageController;
  createBookingDraftController(): BookingDraftController;
  createClientAccountController(initialLanguage: ClientPreferredLanguage): ClientAccountController;
  createDiscoveryController(): DiscoveryController;
  createClientDataController(): ClientDataController;
  createClientIdentityDocumentController(): ClientIdentityDocumentController;
  createProfessionalDataController(): ProfessionalDataController;
  createProfessionalDocumentController(): ProfessionalDocumentController;
  createProfessionalRegistrationController(): ProfessionalRegistrationController;
}

const clientLogger: SessionControllerLogger
  & AdminDocumentControllerLogger
  & BookingDraftControllerLogger
  & ClientAccountControllerLogger
  & DiscoveryControllerLogger
  & ClientDataControllerLogger
  & ClientIdentityDocumentControllerLogger
  & ProfessionalDataControllerLogger
  & ProfessionalDocumentControllerLogger
  & ProfessionalRegistrationControllerLogger
  & ClientLanguageControllerLogger = {
  error(message, error) {
    if (__DEV__) console.error(message, error);
  },
  warn(message, error) {
    if (__DEV__) console.warn(message, error);
  },
};

export function createClientDependencies(): ClientDependencies {
  const supabaseEnabled = isSupabaseConfigured &&
    process.env.EXPO_PUBLIC_AUTH_PROVIDER === 'supabase';
  const sessionStorage = supabaseEnabled
    ? new SupabaseAwareSessionStorage(supabaseAuthPort, secureSessionStorage)
    : secureSessionStorage;
  const sessionRevocation = supabaseEnabled
    ? new SupabaseAwareSessionRevocationGateway(supabaseAuthPort, apiSessionRevocationGateway)
    : apiSessionRevocationGateway;
  const externalSessions = supabaseEnabled
    ? new SupabaseExternalSessionSource(supabaseAuthPort)
    : null;
  const clientAuthenticationGateway: ClientAuthenticationGateway = supabaseEnabled
    ? new SupabaseClientAuthGateway(supabaseAuthPort)
    : apiBaseUrl
      ? apiClientAuthGateway
      : __DEV__ ? developmentClientAuthGateway : unavailableClientAuthGateway;
  const unavailableDocuments = (): never => {
    throw new Error('Secure professional document storage is not configured.');
  };
  const documentRepository: ProfessionalDocumentRepository = supabaseEnabled && supabase
    ? new SupabaseProfessionalDocumentRepository(supabase)
    : { list: unavailableDocuments, create: unavailableDocuments, delete: unavailableDocuments };
  const documentStorage: ProfessionalDocumentStorage = supabaseEnabled && supabase
    ? new SupabaseProfessionalDocumentStorage(supabase)
    : { upload: unavailableDocuments, delete: unavailableDocuments };
  const unavailableClientIdentityDocuments = (): never => {
    throw new Error('Secure client identity document storage is not configured.');
  };
  const clientIdentityDocumentRepository: ClientIdentityDocumentRepository = supabaseEnabled && supabase
    ? new SupabaseClientIdentityDocumentRepository(supabase)
    : { list: unavailableClientIdentityDocuments, create: unavailableClientIdentityDocuments, delete: unavailableClientIdentityDocuments };
  const clientIdentityDocumentStorage: ClientIdentityDocumentStorage = supabaseEnabled && supabase
    ? new SupabaseClientIdentityDocumentStorage(supabase)
    : { upload: unavailableClientIdentityDocuments, delete: unavailableClientIdentityDocuments };
  const unavailableAdminDocuments = (): never => {
    throw new Error('Administrator document review is not configured.');
  };
  const adminDocumentRepository: AdminDocumentRepository = supabaseEnabled && supabase
    ? new SupabaseAdminDocumentRepository(supabase)
    : { listPending: unavailableAdminDocuments, review: unavailableAdminDocuments };
  const adminDocumentPreviews: AdminDocumentPreviewGateway = supabaseEnabled && supabase
    ? new SupabaseAdminDocumentPreviewGateway(supabase)
    : { createSignedPreview: unavailableAdminDocuments };
  return {
    sessionController: new SessionController(
      sessionStorage,
      sessionRevocation,
      clientLogger,
      externalSessions,
    ),
    adminAuthenticationGateway: supabaseEnabled
      ? new SupabaseAdminAuthGateway(supabaseAuthPort)
      : apiAdminAuthenticationGateway,
    createAdminDocumentController: () => new AdminDocumentController(
      adminDocumentRepository,
      adminDocumentPreviews,
      expoAdminDocumentViewer,
      clientLogger,
    ),
    clientAuthenticationGateway,
    professionalAuthenticationGateway: supabaseEnabled
      ? new SupabaseProfessionalAuthGateway(supabaseAuthPort)
      : null,
    phoneAuthenticationGateway: supabaseEnabled
      ? new SupabasePhoneAuthGateway(
        supabaseAuthPort,
        process.env.EXPO_PUBLIC_ENABLE_PROFESSIONAL_MOCK_OTP === 'true' && supabase
          ? new SupabaseProfessionalRegistrationOtpMock(supabase, supabaseAuthPort)
          : null,
      )
      : authService,
    languageController: new ClientLanguageController(
      secureClientLanguageStorage,
      deviceClientLanguageDetector,
      clientLogger,
    ),
    createBookingDraftController: () => new BookingDraftController(
      secureBookingDraftStorage,
      bookingRequestIdGenerator,
      clientLogger,
      onlinePaymentsEnabled ? 'online' : 'cash',
    ),
    createClientAccountController: (initialLanguage) => new ClientAccountController(
      secureClientAccountCache,
      supabaseEnabled && supabase ? supabaseClientRegistrationGateway(supabase, apiClientAccountGateway) : apiClientAccountGateway,
      systemClientAccountRuntime,
      initialLanguage,
      clientLogger,
    ),
    createDiscoveryController: () => new DiscoveryController(
      apiDiscoveryGateway,
      {
        // Sample professionals exist for the design preview only; a configured
        // API starts from an empty catalogue and its own categories.
        professionals: apiDiscoveryGateway.configured ? [] : developmentProfessionals,
        categories: apiDiscoveryGateway.configured ? [] : developmentCategories,
        timeSlots: bookingTimeSlots,
      },
      clientLogger,
      {
        blockedProfessionalsStorage: secureBlockedProfessionalsStorage,
        blockedProfessionalsGateway: apiDiscoveryGateway.configured ? apiBlockedProfessionalsGateway : undefined,
      },
    ),
    createClientDataController: () => new ClientDataController(
      clientBookingGateway,
      clientPreferencesGateway,
      systemClientDataScheduler,
      systemClientDataRuntime,
      { pollingIntervalMs: 10_000 },
      clientLogger,
    ),
    createClientIdentityDocumentController: () => new ClientIdentityDocumentController(
      clientIdentityDocumentRepository,
      clientIdentityDocumentStorage,
      expoClientIdentityDocumentPicker,
      systemClientIdentityDocumentRuntime,
      clientLogger,
      { available: supabaseEnabled && Boolean(supabase) },
    ),
    createProfessionalDataController: () => new ProfessionalDataController(
      apiProfessionalDataGateway,
      systemProfessionalDataScheduler,
      systemProfessionalDataRuntime,
      professionalDataFallback,
      { pollingIntervalMs: 10_000, toastDurationMs: 2_800 },
      clientLogger,
    ),
    createProfessionalDocumentController: () => new ProfessionalDocumentController(
      documentRepository,
      documentStorage,
      expoProfessionalDocumentPicker,
      systemProfessionalDocumentRuntime,
      clientLogger,
      { available: supabaseEnabled && Boolean(supabase) },
    ),
    createProfessionalRegistrationController: () => new ProfessionalRegistrationController(
      secureProfessionalRegistrationStorage,
      supabaseEnabled && supabase
        ? new SupabaseProfessionalRegistrationGateway(supabase)
        : apiProfessionalRegistrationGateway,
      systemProfessionalRegistrationRuntime,
      initialProfessionalRegistrationDraft,
      clientLogger,
    ),
  };
}

export const clientDependencies = createClientDependencies();
