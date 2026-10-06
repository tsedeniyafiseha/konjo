import { normalizePayoutMethod, type PayoutMethodType } from '../../../shared/payout-method.ts';

export const professionalSpecialties = [
  { id: 'hair', label: 'Hair styling' },
  { id: 'braids', label: 'Braids & natural hair' },
  { id: 'nails', label: 'Nail care' },
  { id: 'makeup', label: 'Makeup artistry' },
  { id: 'barber', label: 'Barbering' },
  { id: 'massage', label: 'Massage & wellness' },
] as const;

export type ProfessionalSpecialty = (typeof professionalSpecialties)[number]['id'];
export type ProfessionalAppLanguage = 'am' | 'om' | 'en';
export const professionalSpokenLanguages = [
  'Amharic',
  'Afaan Oromo',
  'Tigrinya',
  'Somali',
  'English',
  'Arabic',
  'French',
  'Italian',
] as const;
export type ProfessionalSpokenLanguage = (typeof professionalSpokenLanguages)[number];
export const professionalLanguageProficiencies = ['basic', 'conversational', 'fluent', 'native'] as const;
export type ProfessionalLanguageProficiency = (typeof professionalLanguageProficiencies)[number];
export interface ProfessionalLanguageSkill {
  language: ProfessionalSpokenLanguage;
  proficiency: ProfessionalLanguageProficiency;
}
export const professionalEducationLevels = [
  'secondary',
  'certificate',
  'diploma',
  'bachelors',
  'postgraduate',
] as const;
export type ProfessionalEducationLevel = (typeof professionalEducationLevels)[number];
export const professionalGenders = ['female', 'male', 'unspecified'] as const;
export type ProfessionalGender = (typeof professionalGenders)[number];

/** Draft of how the professional wants Konjo to pay them; validated by normalizePayoutMethod. */
export interface ProfessionalPayoutMethodDraft {
  type: PayoutMethodType | null;
  accountName: string;
  accountNumber: string;
  bankName: string;
}

export const emptyPayoutMethodDraft: ProfessionalPayoutMethodDraft = {
  type: null,
  accountName: '',
  accountNumber: '',
  bankName: '',
};
export type ProfessionalApplicationStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected' | 'suspended';

export interface ProfessionalProfileDraft {
  legalName: string;
  displayName: string;
  email: string;
  specialty: ProfessionalSpecialty | null;
  bio: string;
  yearsExperience: string;
  educationLevel: ProfessionalEducationLevel | null;
  gender: ProfessionalGender | null;
  payoutMethod: ProfessionalPayoutMethodDraft;
  languageSkills: readonly ProfessionalLanguageSkill[];
  baseZone: string;
  portfolioCount: number;
}

export interface ProfessionalIdentityDraft {
  credentialAdded: boolean;
}

export interface ProfessionalServiceDraft {
  id: string;
  category: string;
  name: string;
  durationMinutes: number;
  price: number;
  note: string;
  popular: boolean;
}

export interface ProfessionalWorkingDay {
  day: string;
  hours: string;
  enabled: boolean;
}

export interface ProfessionalTravelZone {
  id: string;
  label: string;
  active: boolean;
}

export interface ProfessionalRegistrationDraft {
  preferredLanguage: ProfessionalAppLanguage | null;
  profile: ProfessionalProfileDraft;
  identity: ProfessionalIdentityDraft;
  services: readonly ProfessionalServiceDraft[];
  workingDays: readonly ProfessionalWorkingDay[];
  travelZones: readonly ProfessionalTravelZone[];
  sameDayBookings: boolean;
  termsAccepted: boolean;
}

export interface ProfessionalApplication extends ProfessionalRegistrationDraft {
  id: string;
  status: ProfessionalApplicationStatus;
  submittedAt: number;
  /** Administrator note returned with a rejection. */
  reviewNote?: string | null;
}

export const initialProfessionalRegistrationDraft: ProfessionalRegistrationDraft = {
  preferredLanguage: null,
  profile: {
    legalName: '',
    displayName: '',
    email: '',
    specialty: null,
    bio: '',
    yearsExperience: '',
    educationLevel: null,
    gender: null,
    payoutMethod: emptyPayoutMethodDraft,
    languageSkills: [{ language: 'Amharic', proficiency: 'native' }],
    baseZone: '',
    portfolioCount: 0,
  },
  identity: {
    credentialAdded: false,
  },
  services: [{
    id: 'service-1',
    category: '',
    name: '',
    durationMinutes: 60,
    price: 0,
    note: '',
    popular: false,
  }],
  workingDays: [
    { day: 'Monday', hours: '12:00 AM – 11:59 PM', enabled: true },
    { day: 'Tuesday', hours: '12:00 AM – 11:59 PM', enabled: true },
    { day: 'Wednesday', hours: '12:00 AM – 11:59 PM', enabled: true },
    { day: 'Thursday', hours: '12:00 AM – 11:59 PM', enabled: true },
    { day: 'Friday', hours: '12:00 AM – 11:59 PM', enabled: true },
    { day: 'Saturday', hours: '12:00 AM – 11:59 PM', enabled: true },
    { day: 'Sunday', hours: '12:00 AM – 11:59 PM', enabled: true },
  ],
  travelZones: [
    { id: 'bole', label: 'Bole', active: true },
    { id: 'cmc', label: 'CMC', active: true },
    { id: 'kazanchis', label: 'Kazanchis', active: true },
    { id: 'old-airport', label: 'Old Airport', active: false },
    { id: 'ayat', label: 'Ayat', active: false },
    { id: 'megenagna', label: 'Megenagna', active: false },
    { id: 'summit', label: 'Summit', active: false },
    { id: 'sarbet', label: 'Sarbet', active: false },
  ],
  sameDayBookings: true,
  termsAccepted: false,
};

export function getSpecialtyLabel(specialty: ProfessionalSpecialty | null): string {
  return professionalSpecialties.find((item) => item.id === specialty)?.label ?? 'Beauty professional';
}

export function serviceCategoryForSpecialty(
  specialty: ProfessionalSpecialty | null,
): string {
  return specialty ?? '';
}

export function withPrimarySpecialtyServiceCategories(
  draft: ProfessionalRegistrationDraft,
): ProfessionalRegistrationDraft {
  const legacyProfile = draft.profile as ProfessionalProfileDraft & {
    languages?: readonly ProfessionalSpokenLanguage[];
    educationLevel?: ProfessionalEducationLevel | null;
    languageSkills?: readonly ProfessionalLanguageSkill[];
    gender?: ProfessionalGender | null;
    payoutMethod?: Partial<ProfessionalPayoutMethodDraft> | null;
  };
  const languageSkills = legacyProfile.languageSkills?.length
    ? legacyProfile.languageSkills
    : (legacyProfile.languages ?? []).map((language) => ({
        language,
        proficiency: 'conversational' as const,
      }));
  const category = serviceCategoryForSpecialty(draft.profile.specialty);
  const name = draft.profile.specialty ? getSpecialtyLabel(draft.profile.specialty) : '';
  return {
    ...draft,
    profile: {
      ...draft.profile,
      educationLevel: legacyProfile.educationLevel ?? null,
      gender: legacyProfile.gender ?? null,
      payoutMethod: { ...emptyPayoutMethodDraft, ...(legacyProfile.payoutMethod ?? {}) },
      languageSkills,
    },
    services: draft.services.map((service) => ({ ...service, category, name })),
  };
}

export function isPayoutMethodComplete(payoutMethod: ProfessionalPayoutMethodDraft): boolean {
  return normalizePayoutMethod(payoutMethod) !== null;
}

export function isProfileComplete(profile: ProfessionalProfileDraft): boolean {
  return profile.legalName.trim().length >= 3 &&
    profile.displayName.trim().length >= 2 &&
    profile.specialty !== null &&
    profile.gender !== null &&
    isPayoutMethodComplete(profile.payoutMethod) &&
    profile.baseZone.length > 0;
}

export function isExperienceComplete(profile: ProfessionalProfileDraft): boolean {
  const years = Number(profile.yearsExperience);
  return Number.isInteger(years) && years >= 0 && years <= 60 &&
    profile.educationLevel !== null &&
    profile.gender !== null &&
    profile.languageSkills.length > 0 &&
    new Set(profile.languageSkills.map((skill) => skill.language)).size === profile.languageSkills.length &&
    profile.bio.trim().length >= 30;
}

export function isServicesComplete(services: readonly ProfessionalServiceDraft[]): boolean {
  return services.length > 0 && services.every((service) => (
    service.category.trim().length > 0 && service.name.trim().length >= 2 && service.price > 0
  ));
}

// Professionals are bookable around the clock while their availability switch
// is on, so only the travel zones are chosen during registration.
export function isAvailabilityComplete(draft: ProfessionalRegistrationDraft): boolean {
  return draft.travelZones.some((zone) => zone.active);
}

export function isProfessionalRegistrationComplete(draft: ProfessionalRegistrationDraft): boolean {
  return draft.preferredLanguage !== null &&
    isProfileComplete(draft.profile) &&
    isExperienceComplete(draft.profile) &&
    isServicesComplete(draft.services) &&
    isAvailabilityComplete(draft) &&
    draft.termsAccepted;
}
