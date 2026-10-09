import type { PayoutMethod } from './payout-method';

export type ApiAccountRole = 'client' | 'professional' | 'admin';

export interface ApiUser {
  id: string;
  role: ApiAccountRole;
  email: string | null;
  fullName: string;
  phoneNumber: string | null;
  createdAt: string;
}

export interface ApiOtpChallenge {
  id: string;
  phoneNumber: string;
  expiresAt: number;
  developmentCode?: string;
}

export interface ApiPasswordResetRequest {
  accepted: true;
  developmentToken?: string;
}

export interface ApiSession {
  token: string;
  expiresAt: number;
}

export interface AuthApiResponse {
  user: ApiUser;
  session: ApiSession;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export interface ApiProfessionalService {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
}

export interface ApiProfessionalPortfolioItem {
  id: string;
  url: string;
  expiresAt: string;
}

/** A published portfolio photo shown on the client home feed. */
export interface ApiPortfolioFeedItem extends ApiProfessionalPortfolioItem {
  professionalId: string;
  professionalName: string;
  specialty: string;
  available: boolean;
}

export interface ApiProfessionalSummary {
  id: string;
  displayName: string;
  specialty: string;
  category: string;
  baseZone: string;
  bio: string;
  yearsExperience: number;
  educationLevel: ApiProfessionalEducationLevel | null;
  languages: ReadonlyArray<string>;
  languageSkills: ReadonlyArray<ApiProfessionalLanguageSkill>;
  /** Registered at onboarding; shown on the public profile and used by client filters. */
  gender: ApiProfessionalGender;
  rating: number;
  reviewCount: number;
  available: boolean;
  availableToday: boolean;
  /** True while the professional is on the way to, or in the middle of, another visit; bookings are refused meanwhile. */
  onVisit?: boolean;
  nextAvailableSlot: string | null;
  featured: boolean;
  femaleOnlyEligible: boolean;
  travelZones: ReadonlyArray<string>;
  workingDays: ReadonlyArray<{ day: string; enabled: boolean }>;
  services: ReadonlyArray<ApiProfessionalService>;
}

export interface ApiProfessionalAvailability {
  professionalId: string;
  dateIso: string;
  available: boolean;
  slots: ReadonlyArray<string>;
}

export type ApiClientPreferredLanguage = 'en' | 'am';

export interface ApiClientAddress {
  id: string;
  label: string;
  zone: string;
  detail: string;
  fee: number;
  isDefault: boolean;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: string;
}

export interface ApiServiceZone {
  id: string;
  label: string;
  travelFee: number;
}

export interface ApiServiceCategory {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface ApiAdminPlatformSettings {
  commissionRateBps: number;
  commissionRatePercent: number;
  /** Maximum travel fee (ETB, whole number) a professional may set when accepting a booking. */
  travelFeeCap: number;
  updatedAt: string;
}

export interface ApiClientAccount {
  profile: {
    fullName: string;
    email: string | null;
    phoneNumber: string | null;
    preferredLanguage: ApiClientPreferredLanguage;
  };
  addresses: ReadonlyArray<ApiClientAddress>;
  defaultAddressId: string | null;
  completedAt: string;
}

export interface ApiNotificationPreferences {
  bookingUpdates: boolean;
  promotions: boolean;
  smsReminders: boolean;
}

export interface ApiClientData {
  account: ApiClientAccount | null;
  favouriteIds: ReadonlyArray<string>;
  notificationPreferences: ApiNotificationPreferences;
}

export type ApiProfessionalAppLanguage = 'am' | 'om' | 'en';
export type ApiProfessionalSpokenLanguage = 'Amharic' | 'Afaan Oromo' | 'Tigrinya' | 'Somali' | 'English' | 'Arabic' | 'French' | 'Italian';
export type ApiProfessionalLanguageProficiency = 'basic' | 'conversational' | 'fluent' | 'native';
export interface ApiProfessionalLanguageSkill {
  language: ApiProfessionalSpokenLanguage;
  proficiency: ApiProfessionalLanguageProficiency;
}
export type ApiProfessionalEducationLevel = 'secondary' | 'certificate' | 'diploma' | 'bachelors' | 'postgraduate';
export type ApiProfessionalGender = 'female' | 'male' | 'unspecified';
export type ApiProfessionalPayoutMethod = PayoutMethod;
export type ApiProfessionalApplicationStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected' | 'suspended';

export interface ApiProfessionalApplication {
  id: string;
  status: ApiProfessionalApplicationStatus;
  submittedAt: number;
  preferredLanguage: ApiProfessionalAppLanguage;
  /** Administrator note shown to the professional after a rejection. */
  reviewNote?: string | null;
  profile: {
    legalName: string;
    displayName: string;
    email: string;
    specialty: string;
    bio: string;
    yearsExperience: string;
    educationLevel: ApiProfessionalEducationLevel | null;
    gender: ApiProfessionalGender | null;
    languages: ReadonlyArray<ApiProfessionalSpokenLanguage>;
    languageSkills: ReadonlyArray<ApiProfessionalLanguageSkill>;
    baseZone: string;
    portfolioCount: number;
    /** Where Konjo sends this professional's earnings. Null for legacy applications. */
    payoutMethod: ApiProfessionalPayoutMethod | null;
  };
  identity: {
    credentialAdded: boolean;
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

export interface ApiProfessionalJob {
  paymentSummary?: ApiBookingPaymentSummary;
  arrivedAt?: string | null;
  id: string;
  clientId?: string;
  clientName: string;
  serviceName: string;
  servicePrice: number;
  travelFee: number;
  /** Extra services the professional named at checkout; added to the client's final payment. */
  extraAmount?: number;
  extraFee?: number;
  extraNote?: string | null;
  total: number;
  commissionRateBps: number;
  paymentMethod: ApiBookingPaymentMethod;
  dateIso: string;
  time: string;
  /** A new time the client asked for, awaiting this professional's answer. */
  proposedDateIso?: string | null;
  proposedTime?: string | null;
  addressLabel: string;
  addressZone: string;
  addressDetail: string;
  latitude?: number | null;
  longitude?: number | null;
  status: ApiBookingStatus;
  startedAt: string | null;
  completedAt: string | null;
  tracking?: ApiBookingTracking | null;
}

export interface ApiProfessionalDashboard {
  jobs: ReadonlyArray<ApiProfessionalJob>;
  /** Completed or cancelled bookings from the last 30 days, newest first, with their payment state. */
  recentJobs: ReadonlyArray<ApiProfessionalJob>;
  available: boolean;
  completedCount: number;
  weekEarnings: number;
  /** Average client rating (0 while unrated) and how many reviews it is based on. */
  rating: number;
  reviewCount: number;
  /** Platform-wide maximum travel fee (ETB) the professional may set on acceptance. */
  travelFeeCap: number;
}

export interface ApiProfessionalCatalogSettings {
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
}

export type ApiBookingStatus = 'requested' | 'accepted' | 'on_the_way' | 'in_progress' | 'completed' | 'cancelled';
export type ApiBookingPaymentMethod = 'telebirr' | 'cbe' | 'card' | 'cash';
export type ApiPaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'cash_due'
  | 'cash_collected'
  | 'refunded'
  | 'failed';

export type ApiBookingCancellationPolicy = 'full_refund' | 'travel_fee_forfeit' | 'client_no_show';

export interface ApiPaymentIntent {
  stage?: 'full' | 'deposit' | 'balance';
  attempt?: number;
  id: string;
  bookingId: string;
  provider: ApiBookingPaymentMethod;
  providerReference: string;
  status: ApiPaymentStatus;
  amount: number;
  refundedAmount: number;
  currency: 'ETB';
  /** Provider-hosted checkout page for online methods; null for cash. */
  checkoutUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Amounts throughout the API are ETB, with at most two decimal places. */
export interface ApiBookingPaymentSummary {
  plan: 'full' | 'split';
  depositAmount: number;
  balanceAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  depositPaid: boolean;
  fullyPaid: boolean;
  dueStage: 'full' | 'deposit' | 'balance' | null;
}

export interface ApiPayoutBatch {
  id: string;
  professionalId: string;
  status: 'queued' | 'paid' | 'failed';
  amount: number;
  bookingCount: number;
  createdAt: string;
  paidAt: string | null;
  /** Snapshot of the professional's payout method when the batch was prepared. */
  payoutMethod: ApiProfessionalPayoutMethod | null;
  /** Transfer reference the administrator recorded when marking it paid. */
  paidReference: string | null;
  paidNote: string | null;
}

/** Earnings not yet grouped into a payout batch, one row per professional. */
export interface ApiAdminPendingPayout {
  professionalId: string;
  displayName: string;
  amount: number;
  bookingCount: number;
  oldestEarningAt: string;
  payoutMethod: ApiProfessionalPayoutMethod | null;
}

export type ApiDevicePlatform = 'ios' | 'android' | 'web';

export interface ApiDeviceRegistration {
  id: string;
  platform: ApiDevicePlatform;
  tokenPreview: string;
  createdAt: string;
}

export interface ApiNotificationRecord {
  id: string;
  channel: 'push' | 'sms';
  template: string;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  /** Template context (bookingId, status, …) used to render and deep-link the record. */
  payload?: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}

/** Latest reported position of the professional assigned to a booking. */
export interface ApiBookingTracking {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  heading: number | null;
  speedMps: number | null;
  /** Human-readable area near the point, e.g. "Bole, Addis Ababa"; null until geocoded. */
  areaLabel: string | null;
  recordedAt: string;
}

export interface ApiAdminSummary {
  pendingApplications: number;
  activeProfessionals: number;
  openBookings: number;
  openNotificationFailures: number;
  queuedPayoutAmount: number;
  capturedPaymentAmount: number;
  openQualityFlags: number;
  openSafetyIncidents: number;
  openContentReports: number;
}

export type ApiProfessionalDocumentKind =
  | 'national_id_front'
  | 'national_id_back'
  | 'government_id'
  | 'portfolio'
  | 'certificate';

export interface ApiAdminApplicationDocument {
  id: string;
  kind: ApiProfessionalDocumentKind;
  credentialType?: 'education' | 'course' | null;
  storagePath: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface ApiAdminProfessionalApplication {
  userId: string;
  phoneNumber: string | null;
  application: ApiProfessionalApplication;
  /** Private evidence submitted with the application (ID images and portfolio). */
  documents?: ReadonlyArray<ApiAdminApplicationDocument>;
}

export interface ApiAdminProfessional {
  id: string;
  displayName: string;
  approvalStatus: 'active' | 'suspended';
  featured: boolean;
  femaleOnlyEligible: boolean;
  hiddenForQuality: boolean;
  /** Whether the professional currently accepts new bookings. */
  available?: boolean;
  category: string;
  rating: number;
  reviewCount: number;
}

export interface ApiAdminBooking extends ApiBooking {
  clientName: string;
  professionalName: string;
}

export interface ApiAdminAuditLog {
  id: string;
  adminId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ApiDomainEventDeadLetter {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  occurredAt: string;
  correlationId: string;
  causationId: string | null;
  attempts: number;
  lastError: string;
  failedAt: string;
}

export interface ApiAdminZone {
  id: string;
  label: string;
  travelFee: number;
  active: boolean;
  updatedAt: string;
}

export interface ApiPromotion {
  id: string;
  code: string;
  description: string;
  discountPercent: number;
  active: boolean;
  startsAt: string;
  endsAt: string;
  createdAt: string;
}

export interface ApiBookingDispute {
  id: string;
  bookingId: string;
  clientId: string;
  reason: string;
  status: 'open' | 'resolved' | 'rejected';
  resolution: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ApiAdminBroadcast {
  id: string;
  audience: 'all' | 'clients' | 'professionals';
  message: string;
  recipientCount: number;
  createdAt: string;
}

export interface ApiProfessionalQualityFlag {
  id: string;
  professionalId: string;
  professionalName: string;
  bookingId: string;
  averageRating: number;
  status: 'open' | 'resolved';
  resolution: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ApiClientIdentityStatus {
  verified: boolean;
  faydaLastFour: string | null;
  verifiedAt: string | null;
}

export interface ApiSafetyIncident {
  id: string;
  bookingId: string;
  reportedById: string;
  reportedByRole: 'client' | 'professional';
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  status: 'open' | 'resolved';
  resolution: string;
  createdAt: string;
  resolvedAt: string | null;
}

export type ApiContentReportTarget = 'professional' | 'review';
export type ApiContentReportReason =
  | 'harassment'
  | 'inappropriate_content'
  | 'fraud_or_spam'
  | 'safety_concern'
  | 'other';

export interface ApiContentReport {
  id: string;
  reportedById: string;
  targetType: ApiContentReportTarget;
  targetId: string;
  professionalId: string;
  professionalName: string;
  reason: ApiContentReportReason;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolution: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ApiBookingReview {
  id: string;
  techniqueRating: number;
  professionalismRating: number;
  tags: ReadonlyArray<string>;
  reviewText: string;
  createdAt: string;
}

export interface ApiProfessionalReview {
  id: string;
  clientName: string;
  techniqueRating: number;
  professionalismRating: number;
  averageRating: number;
  tags: ReadonlyArray<string>;
  reviewText: string;
  createdAt: string;
}

export interface ApiBooking {
  paymentSummary?: ApiBookingPaymentSummary;
  payments?: ReadonlyArray<ApiPaymentIntent>;
  acceptedAt?: string | null;
  travelStartedAt?: string | null;
  arrivedAt?: string | null;
  id: string;
  clientId: string;
  professionalId: string;
  serviceId: string;
  serviceName: string;
  dateIso: string;
  time: string;
  /** A new time the client asked for on an accepted booking, awaiting the professional's answer. */
  proposedDateIso?: string | null;
  proposedTime?: string | null;
  addressLabel: string;
  addressZone: string;
  addressDetail: string;
  latitude?: number | null;
  longitude?: number | null;
  femaleOnly: boolean;
  paymentMethod: ApiBookingPaymentMethod;
  servicePrice: number;
  serviceFee?: number;
  travelFee: number;
  /** Extras the client added at the final payment, and Konjo's fee on them. */
  extraAmount?: number;
  extraFee?: number;
  /** Description of the extra services, written by the professional at checkout. */
  extraNote?: string | null;
  /** Reward taken off the service price (funded by Konjo), and why it applied. */
  discountAmount?: number;
  discountRateBps?: number;
  discountReason?: ApiRewardReason | null;
  total: number;
  commissionRateBps: number;
  status: ApiBookingStatus;
  cancellationPolicy: ApiBookingCancellationPolicy | null;
  /** Who ended a cancelled booking: a professional decline vs a client cancellation. */
  cancelledBy?: 'client' | 'professional' | null;
  cancellationReason?: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  paymentIntent?: ApiPaymentIntent | null;
  tracking?: ApiBookingTracking | null;
  review?: ApiBookingReview;
}

export type ApiRewardReason = 'first_booking' | 'loyalty';

/** The client's standing in the rewards programme and the reward their next booking gets. */
export interface ApiClientRewards {
  /** Discount rate for rewards, in basis points (2000 = 20%). */
  discountRateBps: number;
  /** A coupon is earned after this many completed bookings. */
  everyBookings: number;
  completedBookings: number;
  bookingsUntilNextCoupon: number;
  availableCoupons: number;
  /** The reward applied to the next booking, if any. */
  offer: { reason: ApiRewardReason; rateBps: number } | null;
}

/** An address candidate from the geocoding provider, with validated coordinates. */
export interface ApiAddressCandidate {
  id: string;
  /** Formatted address without the country suffix, e.g. "Bole Road, Addis Ababa". */
  label: string;
  /** Neighbourhood or sub-city when the provider knows it, e.g. "Bole"; null otherwise. */
  area: string | null;
  latitude: number;
  longitude: number;
}
