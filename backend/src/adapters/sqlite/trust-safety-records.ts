import type {
  ApiBookingDispute,
  ApiProfessionalQualityFlag,
  ApiSafetyIncident,
} from '../../../../shared/api-contracts.ts';

export interface BookingDisputeRow {
  id: string;
  booking_id: string;
  client_id: string;
  reason: string;
  status: ApiBookingDispute['status'];
  resolution: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ProfessionalQualityFlagRow {
  id: string;
  professional_id: string;
  professional_name: string;
  booking_id: string;
  average_rating: number;
  status: ApiProfessionalQualityFlag['status'];
  resolution: string;
  created_at: string;
  resolved_at: string | null;
}

export interface SafetyIncidentRow {
  id: string;
  booking_id: string;
  reported_by_id: string;
  reported_by_role: 'client' | 'professional';
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  status: 'open' | 'resolved';
  resolution: string;
  created_at: string;
  resolved_at: string | null;
}

export function toApiBookingDispute(row: BookingDisputeRow): ApiBookingDispute {
  return {
    id: row.id,
    bookingId: row.booking_id,
    clientId: row.client_id,
    reason: row.reason,
    status: row.status,
    resolution: row.resolution,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export function toApiProfessionalQualityFlag(row: ProfessionalQualityFlagRow): ApiProfessionalQualityFlag {
  return {
    id: row.id,
    professionalId: row.professional_id,
    professionalName: row.professional_name,
    bookingId: row.booking_id,
    averageRating: row.average_rating,
    status: row.status,
    resolution: row.resolution,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

export function toApiSafetyIncident(row: SafetyIncidentRow): ApiSafetyIncident {
  return {
    id: row.id,
    bookingId: row.booking_id,
    reportedById: row.reported_by_id,
    reportedByRole: row.reported_by_role,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyMeters: row.accuracy_meters,
    status: row.status,
    resolution: row.resolution,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}
