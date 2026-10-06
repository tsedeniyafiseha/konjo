export const domainEventTypes = {
  bookingRequested: 'BookingRequested',
  bookingAccepted: 'BookingAccepted',
  bookingDeclined: 'BookingDeclined',
  professionalTravelStarted: 'ProfessionalTravelStarted',
  professionalArrived: 'ProfessionalArrived',
  visitStarted: 'VisitStarted',
  bookingCompleted: 'BookingCompleted',
  bookingCancelled: 'BookingCancelled',
  bookingReassigned: 'BookingReassigned',
  bookingRescheduled: 'BookingRescheduled',
  bookingRescheduleAccepted: 'BookingRescheduleAccepted',
  bookingRescheduleDeclined: 'BookingRescheduleDeclined',
  paymentAuthorizationRequested: 'PaymentAuthorizationRequested',
  paymentAuthorized: 'PaymentAuthorized',
  paymentCaptured: 'PaymentCaptured',
  paymentFailed: 'PaymentFailed',
  paymentRefunded: 'PaymentRefunded',
  reviewSubmitted: 'ReviewSubmitted',
  professionalRatingThresholdCrossed: 'ProfessionalRatingThresholdCrossed',
  safetyIncidentOpened: 'SafetyIncidentOpened',
  professionalApproved: 'ProfessionalApproved',
  professionalRejected: 'ProfessionalRejected',
  professionalApplicationSubmitted: 'professional.application_submitted',
  professionalSuspended: 'ProfessionalSuspended',
  payoutQueued: 'PayoutQueued',
  payoutPaid: 'PayoutPaid',
  accountDeleted: 'AccountDeleted',
} as const;

export type DomainEventType = typeof domainEventTypes[keyof typeof domainEventTypes];

export interface DomainEventEnvelope<
  TType extends DomainEventType = DomainEventType,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  eventId: string;
  eventType: TType;
  schemaVersion: number;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  occurredAt: string;
  correlationId: string;
  causationId: string | null;
  payload: TPayload;
  attempt: number;
}

export type BookingRequestedEvent = DomainEventEnvelope<
  'BookingRequested',
  {
    clientId: string;
    professionalId: string;
    assignmentVersion: number;
  }
>;

export type BookingParticipantEvent = DomainEventEnvelope<
  | 'BookingAccepted'
  | 'BookingDeclined'
  | 'ProfessionalTravelStarted'
  | 'ProfessionalArrived'
  | 'VisitStarted'
  | 'BookingCompleted',
  {
    clientId: string;
    professionalId: string;
    /** Set on BookingAccepted: the travel fee the professional named for this trip. */
    travelFee?: number;
    /** Set on BookingAccepted: the total the client now pays (service price + travel fee). */
    total?: number;
  }
>;

export type BookingCancelledEvent = DomainEventEnvelope<
  'BookingCancelled',
  {
    clientId: string;
    professionalId: string;
    cancelledBy: 'client' | 'professional';
    cancellationPolicy: 'full_refund' | 'travel_fee_forfeit' | 'client_no_show';
  }
>;

export type BookingReassignedEvent = DomainEventEnvelope<
  'BookingReassigned',
  {
    clientId: string;
    previousProfessionalId: string;
    professionalId: string;
    assignmentVersion: number;
  }
>;

export type BookingRescheduledEvent = DomainEventEnvelope<
  'BookingRescheduled',
  {
    clientId: string;
    professionalId: string;
    dateIso: string;
    time: string;
    /** True when the booking was already accepted, so the professional must approve the new time. */
    requiresApproval?: boolean;
  }
>;

/** The professional answered a reschedule request; the client is told either way. */
export type BookingRescheduleReviewedEvent = DomainEventEnvelope<
  'BookingRescheduleAccepted' | 'BookingRescheduleDeclined',
  {
    clientId: string;
    professionalId: string;
    dateIso: string;
    time: string;
  }
>;

export type PaymentStateEvent = DomainEventEnvelope<
  'PaymentAuthorizationRequested' | 'PaymentAuthorized' | 'PaymentCaptured' | 'PaymentFailed' | 'PaymentRefunded',
  {
    clientId: string;
    bookingId: string;
    paymentIntentId: string;
    provider: 'telebirr' | 'cbe' | 'card' | 'cash';
    reason: 'client_initiated' | 'provider_webhook' | 'booking_cancellation' | 'admin_refund' | 'cash_collection';
    status?: 'pending' | 'cash_due';
    refundedAmount?: number;
    professionalId?: string;
    stage?: 'full' | 'deposit' | 'balance';
  }
>;

export type ReviewSubmittedEvent = DomainEventEnvelope<
  'ReviewSubmitted',
  {
    clientId: string;
    professionalId: string;
    bookingId: string;
    reviewId: string;
    averageRating: number;
  }
>;

export type ProfessionalRatingThresholdCrossedEvent = DomainEventEnvelope<
  'ProfessionalRatingThresholdCrossed',
  {
    professionalId: string;
    bookingId: string;
    qualityFlagId: string;
    averageRating: number;
  }
>;

export type SafetyIncidentOpenedEvent = DomainEventEnvelope<
  'SafetyIncidentOpened',
  {
    bookingId: string;
    incidentId: string;
    reportedById: string;
    reportedByRole: 'client' | 'professional';
    counterpartId: string;
    coordinatesAvailable: boolean;
  }
>;

export type ProfessionalApprovedEvent = DomainEventEnvelope<
  'ProfessionalApproved',
  {
    professionalId: string;
    applicationId: string;
    language?: 'en' | 'am' | 'om';
  }
>;

export type ProfessionalRejectedEvent = DomainEventEnvelope<
  'ProfessionalRejected',
  {
    professionalId: string;
    applicationId: string;
    language?: 'en' | 'am' | 'om';
    reason?: string;
  }
>;

export type PayoutStateEvent = DomainEventEnvelope<
  'PayoutQueued' | 'PayoutPaid',
  {
    payoutId: string;
    professionalId: string;
    amount: number;
    bookingCount: number;
  }
>;

export type AccountDeletedEvent = DomainEventEnvelope<
  'AccountDeleted',
  {
    userId: string;
    role: 'client' | 'professional';
  }
>;
