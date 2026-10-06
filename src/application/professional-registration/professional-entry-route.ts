import type { ProfessionalDocument } from '../professional-documents/professional-document-contracts';
import {
  isAvailabilityComplete,
  isExperienceComplete,
  isProfileComplete,
  isServicesComplete,
  type ProfessionalApplication,
  type ProfessionalRegistrationDraft,
} from './professional-registration-contracts.ts';

/** Only an explicit admin approval unlocks professional app routes. */
export function professionalRouteRedirect(application: ProfessionalApplication | null, pathname: string): string | null {
  if (pathname === '/pro' || pathname === '/pro/') return null;
  const onboarding = pathname === '/pro/onboarding' || pathname.startsWith('/pro/onboarding/');
  const pending = pathname === '/pro/pending';
  if (!application) return onboarding ? null : '/pro';
  if (application.status === 'approved') return onboarding || pending ? '/pro/home' : null;
  if (pending) return null;
  if (onboarding && (application.status === 'rejected' || application.status === 'changes_requested')) return null;
  return '/pro/pending';
}

/** Resume saved work; submitted applications always take precedence over drafts. */
export function professionalEntryRoute(
  application: ProfessionalApplication | null,
  draft: ProfessionalRegistrationDraft,
  documents: readonly ProfessionalDocument[],
): string {
  if (application) return application.status === 'approved' ? '/pro/home' : '/pro/pending';
  if (!draft.preferredLanguage) return '/pro/onboarding/language';
  if (!isProfileComplete(draft.profile)) return '/pro/onboarding/profile';
  if (!isExperienceComplete(draft.profile)) return '/pro/onboarding/experience';
  const active = documents.filter((document) => document.status !== 'rejected');
  const hasIdentity = ['national_id_front', 'national_id_back', 'government_id'].every(
    (kind) => active.some((document) => document.kind === kind),
  );
  const hasEducation = active.some((document) => document.kind === 'certificate' && document.credentialType !== 'course');
  if (!hasIdentity || !hasEducation) return '/pro/onboarding/identity';
  if (active.filter((document) => document.kind === 'portfolio').length < 3) return '/pro/onboarding/portfolio';
  if (!isServicesComplete(draft.services)) return '/pro/onboarding/services';
  if (!isAvailabilityComplete(draft)) return '/pro/onboarding/availability';
  return '/pro/onboarding/review';
}
