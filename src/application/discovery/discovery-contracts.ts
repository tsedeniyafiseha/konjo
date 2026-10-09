export interface ServiceCategory {
  id: string;
  label: string;
  initial: string;
}

export interface ProfessionalService {
  id: string;
  name: string;
  tag?: string;
  price: number;
  duration: string;
  note: string;
  description: string;
}

export interface ProfessionalReview {
  id: string;
  name: string;
  zone: string;
  rating: string;
  text: string;
  time: string;
  service: string;
}

export type ProfessionalLanguageProficiency = 'basic' | 'conversational' | 'fluent' | 'native';

export interface ProfessionalLanguageSkill {
  language: string;
  proficiency: ProfessionalLanguageProficiency;
}

export interface Professional {
  id: string;
  name: string;
  firstName: string;
  service: string;
  category: string;
  rating: number;
  reviews: number;
  priceFrom: number;
  zone: string;
  nextSlot: string;
  available?: boolean;
  /** The professional's own availability switch: false means they are not taking bookings. */
  acceptingBookings?: boolean;
  /** On the way to, or in the middle of, another visit right now; new bookings are refused until it ends. */
  onVisit?: boolean;
  featured?: boolean;
  femaleOnlyEligible?: boolean;
  travelZones?: readonly string[];
  languages?: readonly string[];
  languageSkills?: readonly ProfessionalLanguageSkill[];
  educationLevel?: string | null;
  gender: 'female' | 'male' | 'unspecified';
  distanceKm: number;
  initials: string;
  image?: number;
  bio: string;
  stats: readonly { value: string; label: string }[];
  services: readonly ProfessionalService[];
  portfolio: readonly string[];
  reviewsList: readonly ProfessionalReview[];
}

export interface ProfessionalAvailabilityInput {
  professionalId: string;
  dateIso: string;
  serviceId?: string;
  excludeBookingId?: string;
}

/** Higher scores indicate a stronger communication fit for the client's app language. */
export function professionalLanguageMatchScore(
  professional: Pick<Professional, 'languageSkills' | 'languages'>,
  appLanguage: 'en' | 'am',
): number {
  const requested = appLanguage === 'en' ? 'English' : 'Amharic';
  const skill = professional.languageSkills?.find((item) => item.language === requested);
  if (!skill) return professional.languages?.includes(requested) ? 1 : 0;
  return { basic: 1, conversational: 2, fluent: 3, native: 4 }[skill.proficiency];
}
