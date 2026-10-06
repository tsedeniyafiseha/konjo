import type { Href } from 'expo-router';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { professionalEntryRoute } from '@/application/professional-registration/professional-entry-route';
import { useProfessionalDocuments } from '@/features/professional/documents/professional-document-context';

import { useProfessionalRegistration } from '@/features/professional/registration/professional-registration-context';

export default function ProfessionalEntryRoute() {
  const { application, draft, loadStatus, saveApprovedProfile, setPreferredLanguage } = useProfessionalRegistration();
  const { documents, loading } = useProfessionalDocuments();
  const { initial } = useLocalSearchParams<{ initial?: string }>();
  const initialLanguage = initial === 'en' || initial === 'am' || initial === 'om' ? initial : null;
  // The language chosen on the entry screen is the one the professional wants
  // to work in: it applies at once (the draft is read first everywhere) and,
  // for an approved profile, is saved so every later sign-in keeps it.
  const needsLanguage = initialLanguage !== null && draft.preferredLanguage !== initialLanguage;
  useEffect(() => {
    if (loadStatus !== 'ready' || !needsLanguage) return;
    setPreferredLanguage(initialLanguage);
    if (application?.status === 'approved' && application.preferredLanguage !== initialLanguage) {
      saveApprovedProfile({ ...draft, preferredLanguage: initialLanguage }).catch((error: unknown) => {
        if (__DEV__) console.warn('Unable to save the professional language preference.', error);
      });
    }
  }, [application, draft, loadStatus, needsLanguage, initialLanguage, saveApprovedProfile, setPreferredLanguage]);
  if (loadStatus !== 'ready' || needsLanguage || (!application && loading)) return null;
  const href = professionalEntryRoute(application, draft, documents);
  return <Redirect href={href as Href} />;
}
