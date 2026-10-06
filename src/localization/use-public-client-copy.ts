import { useCallback } from 'react';

import { clientCopy, type ClientCopyKey } from '@/localization/client-copy';
import { useClientLanguage } from '@/localization/client-language-context';

export function usePublicClientCopy() {
  const { language, setLanguage } = useClientLanguage();
  const dictionary = clientCopy[language];
  const t = useCallback((key: ClientCopyKey) => dictionary[key], [dictionary]);
  return { language, isAmharic: language === 'am', setLanguage, t };
}
