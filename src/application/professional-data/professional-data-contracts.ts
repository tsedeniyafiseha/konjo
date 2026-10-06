import type { ApiBookingPaymentSummary } from '../../../shared/api-contracts';
export type ProfessionalJobStatus = 'offer' | 'accepted' | 'traveling' | 'onsite';

export interface ProfessionalJobLocation {
  latitude: number;
  longitude: number;
  recordedAt?: string;
}

export interface ProfessionalJob {
  paymentSummary?: ApiBookingPaymentSummary;
  arrivedAt?: string | null;
  startedAt?: string | null;
  id: string;
  clientId?: string;
  name: string;
  initials: string;
  service: string;
  description: string;
  price: number;
  payment: string;
  time: string;
  /** New time the client asked for, awaiting this professional's answer. */
  proposedDateIso?: string | null;
  proposedTime?: string | null;
  /** Appointment start as an absolute timestamp. Travel cannot begin before this instant. */
  scheduledStartAt?: number;
  address: string;
  addressDetail: string;
  travelFee: number;
  /** Extra services named at checkout, Konjo's fee on them, and what they were for. */
  extraAmount?: number;
  extraFee?: number;
  extraNote?: string | null;
  commissionRateBps?: number;
  status: ProfessionalJobStatus;
  /** Client's address pin, when they shared one. */
  destination?: ProfessionalJobLocation | null;
  /** Last position this professional reported for the job. */
  lastReported?: ProfessionalJobLocation | null;
  /** Set for finished bookings shown in the recent list; `status` is then historical. */
  outcome?: 'completed' | 'cancelled';
  completedAt?: string | null;
}

/** Once a booking is accepted the professional may set off whenever they choose. */
export function canStartProfessionalTravel(_job: ProfessionalJob, _now: number): boolean {
  return true;
}

export interface ProfessionalService {
  id: string;
  category: string;
  name: string;
  durationMinutes: number;
  price: number;
  note: string;
  popular: boolean;
}

export interface WorkingDay {
  day: string;
  hours: string;
  enabled: boolean;
}

export interface TravelZone {
  id: string;
  label: string;
  active: boolean;
}

export interface ProfessionalCatalogSettings {
  services: readonly ProfessionalService[];
  workingDays: readonly WorkingDay[];
  travelZones: readonly TravelZone[];
  sameDayBookings: boolean;
}

export interface ProfessionalDataApplication extends ProfessionalCatalogSettings {
  id: string;
  status: 'pending' | 'approved' | 'changes_requested' | 'rejected' | 'suspended';
}

export type ProfessionalBookingAction =
  | 'accept'
  | 'decline'
  | 'travel'
  | 'arrive'
  | 'check-in'
  | 'complete'
  | 'no-show'
  | 'approve-reschedule'
  | 'decline-reschedule';
