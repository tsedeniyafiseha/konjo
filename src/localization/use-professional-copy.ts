import { useCallback, useMemo } from 'react';

import { useProfessionalRegistration } from '@/features/professional/registration/professional-registration-context';
import type { ProfessionalAppLanguage } from '@/features/professional/registration/professional-registration-types';
import {
  fillProfessionalCopy,
  localizedDayName,
  localizedShortDayNames,
  professionalCopy,
  type ProfessionalCopyKey,
} from '@/localization/professional-copy';

/**
 * The language the professional chose at registration (Profile → Language can
 * change it). The draft is checked first so a change applies as soon as it is
 * made, before the profile save lands.
 */
export function resolveProfessionalLanguage(
  application: { preferredLanguage: ProfessionalAppLanguage | null } | null | undefined,
  draft: { preferredLanguage: ProfessionalAppLanguage | null } | null | undefined,
): ProfessionalAppLanguage {
  return draft?.preferredLanguage ?? application?.preferredLanguage ?? 'en';
}

export function useProfessionalCopy() {
  const { application, draft } = useProfessionalRegistration();
  const language = resolveProfessionalLanguage(application, draft);
  const dictionary = professionalCopy[language];
  const t = useCallback(
    (key: ProfessionalCopyKey, params?: Record<string, string | number>) => fillProfessionalCopy(dictionary[key], params),
    [dictionary],
  );
  const dayName = useCallback((day: string) => localizedDayName(day, language), [language]);
  const shortDayNames = useMemo(() => localizedShortDayNames(language), [language]);
  return { language, isAmharic: language === 'am', t, dayName, shortDayNames };
}
