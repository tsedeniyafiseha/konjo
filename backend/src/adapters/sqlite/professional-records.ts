import type { DatabaseSync } from 'node:sqlite';

import { parsePayoutMethod } from './payout-records.ts';
import type {
  ApiAdminProfessional,
  ApiProfessionalApplication,
  ApiProfessionalAppLanguage,
} from '../../../../shared/api-contracts.ts';

interface ProfessionalApplicationRow {
  id: string;
  user_id: string;
  preferred_language: ApiProfessionalAppLanguage;
  legal_name: string;
  display_name: string;
  email: string;
  specialty: string;
  bio: string;
  years_experience: number;
  education_level: ApiProfessionalApplication['profile']['educationLevel'];
  gender: ApiProfessionalApplication['profile']['gender'];
  payout_method_json?: string | null;
  languages_json: string;
  language_skills_json: string;
  base_zone: string;
  portfolio_count: number;
  credential_added: number;
  same_day_bookings: number;
  terms_accepted: number;
  status: ApiProfessionalApplication['status'];
  submitted_at: number;
  updated_at: string;
}

interface AdminProfessionalRow {
  id: string;
  display_name: string;
  category: string;
  featured: number;
  hidden: number;
  suspended: number;
  female_only_eligible: number;
  rating_baseline: number;
  review_count_baseline: number;
}

export function readProfessionalApplication(
  database: DatabaseSync,
  userId: string,
): ApiProfessionalApplication | null {
  const row = database.prepare('SELECT * FROM professional_applications WHERE user_id = ?')
    .get(userId) as unknown as ProfessionalApplicationRow | undefined;
  if (!row) return null;
  const services = database.prepare(`
    SELECT id, category, name, duration_minutes, price, note, popular
    FROM professional_application_services WHERE application_id = ? ORDER BY rowid
  `).all(row.id) as unknown as Array<{
    id: string;
    category: string;
    name: string;
    duration_minutes: number;
    price: number;
    note: string;
    popular: number;
  }>;
  const workingDays = database.prepare(`
    SELECT day, hours, enabled FROM professional_application_working_days
    WHERE application_id = ? ORDER BY rowid
  `).all(row.id) as unknown as Array<{ day: string; hours: string; enabled: number }>;
  const travelZones = database.prepare(`
    SELECT id, label, active FROM professional_application_travel_zones
    WHERE application_id = ? ORDER BY rowid
  `).all(row.id) as unknown as Array<{ id: string; label: string; active: number }>;

  return {
    id: row.id,
    status: row.status,
    submittedAt: row.submitted_at,
    preferredLanguage: row.preferred_language,
    profile: {
      legalName: row.legal_name,
      displayName: row.display_name,
      email: row.email,
      specialty: row.specialty,
      bio: row.bio,
      yearsExperience: String(row.years_experience),
      educationLevel: row.education_level,
      gender: row.gender,
      payoutMethod: parsePayoutMethod(row.payout_method_json),
      languages: JSON.parse(row.languages_json) as ApiProfessionalApplication['profile']['languages'],
      languageSkills: JSON.parse(row.language_skills_json) as ApiProfessionalApplication['profile']['languageSkills'],
      baseZone: row.base_zone,
      portfolioCount: row.portfolio_count,
    },
    identity: {
      credentialAdded: row.credential_added === 1,
    },
    services: services.map((service) => ({
      id: service.id,
      category: service.category,
      name: service.name,
      durationMinutes: service.duration_minutes,
      price: service.price,
      note: service.note,
      popular: service.popular === 1,
    })),
    workingDays: workingDays.map((day) => ({ ...day, enabled: day.enabled === 1 })),
    travelZones: travelZones.map((zone) => ({ ...zone, active: zone.active === 1 })),
    sameDayBookings: row.same_day_bookings === 1,
    termsAccepted: true,
  };
}

export function readAdminProfessional(
  database: DatabaseSync,
  professionalId: string,
): ApiAdminProfessional | null {
  const row = database.prepare(`
    SELECT id, display_name, category, featured, hidden, suspended, female_only_eligible,
      rating_baseline, review_count_baseline
    FROM professionals WHERE id = ?
  `).get(professionalId) as unknown as AdminProfessionalRow | undefined;
  if (!row) return null;
  const ratings = database.prepare(`
    SELECT COUNT(*) AS count,
      COALESCE(AVG((technique_rating + professionalism_rating) / 2.0), 0) AS rating
    FROM booking_reviews WHERE professional_id = ? AND visible = 1
  `).get(row.id) as unknown as { count: number; rating: number };
  const reviewCount = row.review_count_baseline + ratings.count;
  const rating = reviewCount === 0
    ? 0
    : ((row.rating_baseline * row.review_count_baseline) + ratings.rating * ratings.count) / reviewCount;
  return {
    id: row.id,
    displayName: row.display_name,
    approvalStatus: row.suspended === 1 ? 'suspended' : 'active',
    featured: row.featured === 1,
    femaleOnlyEligible: row.female_only_eligible === 1,
    hiddenForQuality: row.hidden === 1,
    category: row.category,
    rating: Number(rating.toFixed(2)),
    reviewCount,
  };
}

export function listAdminProfessionals(database: DatabaseSync): ReadonlyArray<ApiAdminProfessional> {
  const rows = database.prepare('SELECT id FROM professionals ORDER BY display_name')
    .all() as unknown as Array<{ id: string }>;
  return rows.flatMap((row) => {
    const professional = readAdminProfessional(database, row.id);
    return professional ? [professional] : [];
  });
}
