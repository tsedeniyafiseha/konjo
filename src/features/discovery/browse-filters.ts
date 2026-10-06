import { professionalLanguageMatchScore } from '@/application/discovery/discovery-contracts';
import type { Professional } from '@/features/discovery/data';

export type SortOption = 'rating' | 'distance' | 'price';
export type GenderOption = 'female' | 'male';

export const sortOptions: readonly SortOption[] = ['rating', 'distance', 'price'];
export const languageOptions = ['English', 'Amharic', 'Afaan Oromo', 'Tigrinya', 'Somali', 'Arabic', 'French', 'Italian'] as const;
export const genderOptions: readonly GenderOption[] = ['female', 'male'];
export const ratingOptions: readonly number[] = [3, 4, 4.5];

/** Everything the client can narrow the specialist list by. */
export interface BrowseFilters {
  sortBy: SortOption | null;
  /** Minimum average rating, e.g. 4 means 4.0 and up. */
  minRating: number | null;
  gender: GenderOption | null;
  /** Any of these spoken at conversational level or better. */
  languages: readonly string[];
  category: string | null;
  zone: string | null;
}

export const emptyBrowseFilters: BrowseFilters = { sortBy: null, minRating: null, gender: null, languages: [], category: null, zone: null };

export function countActiveFilters(filters: BrowseFilters): number {
  return Number(filters.sortBy !== null) + Number(filters.minRating !== null) + Number(filters.gender !== null) +
    Number(filters.languages.length > 0) + Number(filters.category !== null) + Number(filters.zone !== null);
}

export function speaksLanguage(professional: Professional, language: string): boolean {
  return professional.languageSkills?.some((skill) => skill.language === language && skill.proficiency !== 'basic') ||
    professional.languages?.includes(language) || false;
}

/** Applies the filters, the free-text query and the sort; pure so the sheet can preview counts. */
export function applyBrowseFilters(
  professionals: readonly Professional[],
  filters: BrowseFilters,
  query: string,
  uiLanguage: Parameters<typeof professionalLanguageMatchScore>[1],
): Professional[] {
  const sorters: Record<SortOption, (a: Professional, b: Professional) => number> = {
    rating: (a, b) => b.rating - a.rating,
    distance: (a, b) => a.distanceKm - b.distanceKm,
    price: (a, b) => a.priceFrom - b.priceFrom,
  };
  const needle = query.trim().toLowerCase();
  const matches = professionals.filter((professional) =>
    (!filters.category || professional.category === filters.category) &&
    (!filters.gender || professional.gender === filters.gender) &&
    (filters.minRating === null || professional.rating >= filters.minRating) &&
    (!filters.zone || (professional.travelZones ?? [professional.zone]).includes(filters.zone)) &&
    (!filters.languages.length || filters.languages.some((language) => speaksLanguage(professional, language))) &&
    (!needle || `${professional.name} ${professional.service} ${professional.zone}`.toLowerCase().includes(needle)));
  return filters.sortBy
    ? matches.sort(sorters[filters.sortBy])
    : matches.sort((left, right) => (
      professionalLanguageMatchScore(right, uiLanguage) - professionalLanguageMatchScore(left, uiLanguage) ||
      Number(Boolean(right.featured)) - Number(Boolean(left.featured)) ||
      Number(Boolean(right.available)) - Number(Boolean(left.available)) ||
      right.rating - left.rating
    ));
}
