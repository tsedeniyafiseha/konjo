import type {
  ApiRewardReason,
  ApiAdminBroadcast,
  ApiAdminPlatformSettings,
  ApiAdminProfessional,
  ApiAdminZone,
  ApiAccountRole,
  ApiBooking,
  ApiBookingPaymentMethod,
  ApiBookingReview,
  ApiBookingDispute,
  ApiClientAccount,
  ApiClientAddress,
  ApiClientPreferredLanguage,
  ApiPaymentIntent,
  ApiPaymentStatus,
  ApiPayoutBatch,
  ApiProfessionalQualityFlag,
  ApiProfessionalAppLanguage,
  ApiProfessionalApplication,
  ApiProfessionalCatalogSettings,
  ApiProfessionalEducationLevel,
  ApiProfessionalLanguageSkill,
  ApiProfessionalGender,
  ApiProfessionalPayoutMethod,
  ApiPromotion,
  ApiSafetyIncident,
  ApiServiceCategory,
} from '../../../shared/api-contracts.ts';

export interface ProfessionalApplicationInput {
  preferredLanguage: ApiProfessionalAppLanguage;
  profile: {
    legalName: string;
    displayName: string;
    email: string;
    specialty: string;
    bio: string;
    yearsExperience: number;
    educationLevel: ApiProfessionalEducationLevel;
    gender: ApiProfessionalGender;
  payoutMethod: ApiProfessionalPayoutMethod;
    languageSkills: ReadonlyArray<ApiProfessionalLanguageSkill>;
    baseZone: string;
    portfolioCount: number;
  };
  services: ReadonlyArray<{
    id: string;
    category: string;
    name: string;
    durationMinutes: number;
    price: number;
    note: string;
    popular: boolean;
  }>;
  workingDays: ReadonlyArray<{ day: string; hours: string; enabled: boolean }>;
  travelZones: ReadonlyArray<{ id: string; label: string; active: boolean }>;
  sameDayBookings: boolean;
  termsAccepted: true;
}

export interface SubmitProfessionalApplicationStoreInput {
  userId: string;
  applicationId: string;
  application: ProfessionalApplicationInput;
  submittedAt: number;
  occurredAt: string;
}

export type SubmitProfessionalApplicationResult =
  | { result: 'submitted'; application: ApiProfessionalApplication }
  | { result: 'not_editable' };

export interface NotificationDeliveryJob {
  pushTicket?: string | null;
  pushTicketStartedAt?: string | null;
  id: string;
  channel: 'push' | 'sms';
  template: string;
  payload: Record<string, unknown>;
  destination: string;
  attempt: number;
  /** Recipient's preferred app language, when the store knows it. */
  language?: string;
}

export interface BackgroundJobRunResult {
  skipped: boolean;
  reassigned: ReadonlyArray<{ bookingId: string; professionalId: string }>;
  reminders: number;
  delivered: number;
  failed: number;
  events: DomainEventRunResult;
}

export interface DomainEventRunResult {
  claimed: number;
  processed: number;
  retried: number;
  deadLettered: number;
}

export interface CreateBookingCommandInput {
  requestId: string;
  clientId: string;
  professionalId: string;
  serviceId: string;
  dateIso: string;
  time: string;
  /** Saved address whose pin is copied onto the booking, when one was chosen. */
  addressId?: string;
  addressLabel: string;
  addressZone: string;
  addressDetail: string;
  femaleOnly: boolean;
  paymentMethod: ApiBookingPaymentMethod;
}

/** The first reason a booking request cannot be quoted, mirroring the quote's checks in order. */
export type BookingQuoteFailureReason =
  | 'client_unavailable'
  | 'professional_unavailable'
  | 'professional_busy'
  | 'service_unavailable'
  | 'female_only_unavailable'
  | 'zone_unavailable'
  | 'identity_required'
  | 'time_unavailable';

export interface BookingQuote {
  serviceName: string;
  addressZone: string;
  servicePrice: number;
  serviceFee?: number;
  travelFee: number;
  /** Reward off the service price, funded by Konjo; absent or 0 when none applies. */
  discountAmount?: number;
  discountRateBps?: number;
  discountReason?: ApiRewardReason | null;
  total: number;
  commissionRateBps: number;
}

export interface PaymentProviderIntent {
  stage?: 'full' | 'deposit' | 'balance';
  attempt?: number;
  amount?: number;
  providerReference: string;
  status: Extract<ApiPaymentStatus, 'pending' | 'cash_due'>;
  /** Hosted checkout page for online providers. */
  checkoutUrl?: string | null;
}

export interface RecordBookingLocationCommandInput {
  professionalId: string;
  bookingId: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  heading?: number | null;
  speedMps?: number | null;
  /** Reverse-geocoded area name from the professional's phone; optional and untrusted. */
  areaLabel?: string | null;
}

export interface RecordBookingLocationStoreInput extends RecordBookingLocationCommandInput {
  areaLabel: string | null;
  recordedAt: string;
}

export type RecordBookingLocationResult = 'updated' | 'not_found' | 'not_active';

export interface BookingCreationResult {
  booking: ApiBooking;
  paymentIntent: null;
  duplicate: boolean;
}

export interface BookingPaymentContext {
  stage?: 'full' | 'deposit' | 'balance' | null;
  attempt?: number;
  bookingId: string;
  clientId: string;
  paymentMethod: ApiBookingPaymentMethod;
  amount: number;
  currency: 'ETB';
  bookingStatus: ApiBooking['status'];
  paymentIntent: ApiPaymentIntent | null;
}

/** Who is paying, as the hosted checkout shows it; taken from the signed-in client. */
export interface PaymentCustomer {
  firstName: string;
  lastName: string;
  email: string | null;
  phoneNumber: string | null;
}

export type VerifyBookingPaymentResult =
  | { result: 'not_found' }
  | { result: 'no_pending_payment' }
  /** The intent is not a provider payment (cash or sandbox); nothing to ask the provider. */
  | { result: 'unsupported'; paymentIntent: ApiPaymentIntent }
  | { result: 'verified'; status: 'captured' | 'failed' | 'pending'; paymentIntent: ApiPaymentIntent };

export type InitiateBookingPaymentResult =
  | { result: 'created' | 'duplicate'; paymentIntent: ApiPaymentIntent }
  | { result: 'not_found' }
  | { result: 'not_accepted' };

export interface RescheduleBookingCommandInput {
  clientId: string;
  bookingId: string;
  dateIso: string;
  time: string;
}

export interface RescheduleBookingStoreInput extends RescheduleBookingCommandInput {
  occurredAt: string;
}

export type RescheduleBookingResult =
  | { result: 'updated'; booking: ApiBooking }
  | { result: 'not_found' }
  | { result: 'not_allowed' }
  | { result: 'slot_unavailable' };

export interface CancelBookingCommandInput {
  clientId: string;
  bookingId: string;
}

export interface CancelBookingStoreInput extends CancelBookingCommandInput {
  occurredAt: string;
}

export type CancelBookingResult = 'cancelled' | 'not_found' | 'not_allowed';

/** A client hides a finished booking from their history; nothing financial changes. */
export interface ArchiveBookingCommandInput {
  clientId: string;
  bookingId: string;
}

export interface ArchiveBookingStoreInput extends ArchiveBookingCommandInput {
  occurredAt: string;
}

export type ArchiveBookingResult = 'archived' | 'not_found' | 'not_allowed';

export type ProfessionalBookingAction =
  | 'accept'
  | 'decline'
  | 'travel'
  | 'arrive'
  | 'check-in'
  | 'complete'
  | 'approve-reschedule'
  | 'decline-reschedule'
  | 'no-show';

export interface TransitionProfessionalBookingCommandInput {
  professionalId: string;
  bookingId: string;
  action: ProfessionalBookingAction;
  /**
   * Travel fee (whole ETB) the professional sets when accepting. Only used for
   * the 'accept' action. The store validates it against the administrator-set
   * platform cap and answers 'invalid_travel_fee' when it is out of range.
   */
  travelFee?: number;
  /**
   * What the client owes for services beyond the booking, named by the
   * professional at checkout ('complete' only). A whole number of ETB; the
   * matching service fee is computed by the store and both land on the
   * client's final payment.
   */
  extraAmount?: number;
  /** Short description of the extra services, shown to the client. */
  extraNote?: string;
}

export interface TransitionProfessionalBookingStoreInput extends TransitionProfessionalBookingCommandInput {
  occurredAt: string;
}

export type TransitionProfessionalBookingResult =
  | 'updated'
  | 'not_found'
  | 'invalid_transition'
  | 'invalid_travel_fee'
  | 'too_early'
  | 'payment_required';

export interface SubmitBookingReviewCommandInput {
  clientId: string;
  bookingId: string;
  techniqueRating: number;
  professionalismRating: number;
  tags: ReadonlyArray<string>;
  reviewText: string;
}

export interface SubmitBookingReviewStoreInput extends SubmitBookingReviewCommandInput {
  reviewId: string;
  occurredAt: string;
}

export type SubmitBookingReviewResult =
  | { result: 'created'; review: ApiBookingReview }
  | { result: 'not_found' }
  | { result: 'not_completed' }
  | { result: 'already_reviewed' };

export interface ProcessPaymentWebhookCommandInput {
  rawBody: string;
  eventId: string;
  provider: Exclude<ApiBookingPaymentMethod, 'cash'>;
  providerReference: string;
  status: Extract<ApiPaymentStatus, 'authorized' | 'captured' | 'failed'>;
}

export interface ProcessPaymentEventStoreInput extends Omit<ProcessPaymentWebhookCommandInput, 'rawBody'> {
  verifiedAmount?: number;
  verifiedCurrency?: string;
  payloadHash: string;
  occurredAt: string;
}

export type ProcessPaymentEventResult =
  | { result: 'updated'; paymentIntent: ApiPaymentIntent }
  | { result: 'duplicate'; paymentIntent: ApiPaymentIntent }
  | { result: 'not_found' }
  | { result: 'invalid_transition' };

export interface QueueProfessionalPayoutStoreInput {
  payoutId: string;
  professionalId: string;
  occurredAt: string;
}

export interface SettleProfessionalPayoutStoreInput {
  payoutId: string;
  professionalId: string;
  occurredAt: string;
  /** Transfer reference and note recorded by whoever paid the batch. */
  paidReference?: string | null;
  paidNote?: string | null;
  paidBy?: string | null;
}

export interface QueueAdminPayoutStoreInput extends AdminCommandContext {
  professionalId: string;
  payoutId: string;
}

export interface SettleAdminPayoutStoreInput extends AdminCommandContext {
  professionalId: string;
  payoutId: string;
  paidReference: string | null;
  paidNote: string | null;
}

export type ProfessionalPayoutCommandResult = ApiPayoutBatch | null;

export interface OpenSafetyIncidentCommandInput {
  userId: string;
  role: 'client' | 'professional';
  bookingId: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
}

export interface OpenSafetyIncidentStoreInput extends OpenSafetyIncidentCommandInput {
  incidentId: string;
  occurredAt: string;
}

export type OpenSafetyIncidentResult =
  | { result: 'created'; incident: ApiSafetyIncident }
  | { result: 'existing'; incident: ApiSafetyIncident }
  | { result: 'not_found' }
  | { result: 'not_active' };

export interface OpenBookingDisputeStoreInput {
  disputeId: string;
  clientId: string;
  bookingId: string;
  reason: string;
  occurredAt: string;
}

export interface ResolveSafetyIncidentStoreInput {
  auditId: string;
  adminId: string;
  incidentId: string;
  resolution: string;
  occurredAt: string;
}

export interface ResolveQualityFlagStoreInput {
  auditId: string;
  adminId: string;
  flagId: string;
  resolution: string;
  action: 'restore' | 'keep_hidden';
  occurredAt: string;
}

export interface ResolveBookingDisputeStoreInput {
  auditId: string;
  adminId: string;
  disputeId: string;
  status: Extract<ApiBookingDispute['status'], 'resolved' | 'rejected'>;
  resolution: string;
  occurredAt: string;
}

export interface TrustSafetyResolutionResult {
  safetyIncident?: ApiSafetyIncident;
  qualityFlag?: ApiProfessionalQualityFlag;
  dispute?: ApiBookingDispute;
}

export interface AdminRefundStoreInput {
  auditId: string;
  adminId: string;
  bookingId: string;
  occurredAt: string;
}

export type AdminRefundResult =
  | { result: 'refunded'; paymentIntent: ApiPaymentIntent }
  | { result: 'already_refunded'; paymentIntent: ApiPaymentIntent }
  | { result: 'not_found' }
  | { result: 'payout_locked' }
  | { result: 'not_refundable' };

export interface AdminCommandContext {
  auditId: string;
  adminId: string;
  occurredAt: string;
}

export interface UpsertServiceCategoryStoreInput extends AdminCommandContext {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

export interface UpdateCommissionStoreInput extends AdminCommandContext {
  commissionRateBps: number;
}

export interface UpdateTravelFeeCapStoreInput extends AdminCommandContext {
  travelFeeCap: number;
}

export interface UpsertZoneStoreInput extends AdminCommandContext {
  id: string;
  label: string;
  travelFee: number;
  active: boolean;
}

export interface CreatePromotionStoreInput extends AdminCommandContext {
  promotionId: string;
  code: string;
  description: string;
  discountPercent: number;
  active: boolean;
  startsAt: string;
  endsAt: string;
}

export interface SetPromotionActiveStoreInput extends AdminCommandContext {
  promotionId: string;
  active: boolean;
}

export interface CreateBroadcastStoreInput extends AdminCommandContext {
  broadcastId: string;
  audience: ApiAdminBroadcast['audience'];
  message: string;
}

export interface AdminCatalogCommandResults {
  category: ApiServiceCategory;
  settings: ApiAdminPlatformSettings;
  zone: ApiAdminZone;
  promotion: ApiPromotion;
  broadcast: ApiAdminBroadcast;
}

export type ProfessionalApplicationReviewAction = 'approve' | 'request-changes' | 'reject';

export interface ReviewProfessionalApplicationStoreInput extends AdminCommandContext {
  professionalId: string;
  action: ProfessionalApplicationReviewAction;
  reason?: string;
}

export interface DevelopmentApproveProfessionalApplicationStoreInput {
  professionalId: string;
  occurredAt: string;
}

export interface UpdateAdminProfessionalStoreInput extends AdminCommandContext {
  professionalId: string;
  featured: boolean;
  femaleOnlyEligible: boolean;
}

export interface SetAdminProfessionalStateStoreInput extends AdminCommandContext {
  professionalId: string;
  action: 'suspend' | 'restore';
}

export interface AdminProfessionalCommandResults {
  application: ApiProfessionalApplication;
  professional: ApiAdminProfessional;
}

export interface UpdateClientProfileStoreInput {
  userId: string;
  fullName: string;
  phoneNumber: string | null;
  preferredLanguage?: ApiClientPreferredLanguage;
  occurredAt: string;
}

export interface CompleteClientOnboardingStoreInput extends UpdateClientProfileStoreInput {
  preferredLanguage: ApiClientPreferredLanguage;
  address?: {
    id: string;
    label: string;
    zone: string;
    detail: string;
  };
}

export interface DeleteAccountStoreInput {
  userId: string;
  role: Exclude<ApiAccountRole, 'admin'>;
  occurredAt: string;
}

export type CompleteClientOnboardingResult =
  | { result: 'completed'; account: ApiClientAccount }
  | { result: 'client_not_found' }
  | { result: 'identity_documents_required' }
  | { result: 'service_zone_unavailable' };

export interface CreateClientAddressStoreInput {
  addressId: string;
  userId: string;
  label: string;
  zone: string;
  detail: string;
  makeDefault: boolean;
  latitude?: number | null;
  longitude?: number | null;
  occurredAt: string;
}

export interface UpdateClientAddressStoreInput extends Omit<CreateClientAddressStoreInput, 'makeDefault'> {}

export interface SelectClientAddressStoreInput {
  userId: string;
  addressId: string;
  occurredAt: string;
}

export type ClientAddressCommandResult =
  | { result: 'updated'; address: ApiClientAddress }
  | { result: 'not_found' }
  | { result: 'service_zone_unavailable' };

export interface UpdateProfessionalCatalogStoreInput {
  professionalId: string;
  settings: ApiProfessionalCatalogSettings;
  occurredAt: string;
}

export type UpdateProfessionalCatalogResult =
  | { result: 'updated'; settings: ApiProfessionalCatalogSettings }
  | { result: 'not_found' }
  | { result: 'invalid_zone' };
