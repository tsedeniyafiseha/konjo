import { useCallback } from 'react';

import { useClientAccount } from '@/features/client/account/client-account-context';
import { clientCopy, type ClientCopyKey } from '@/localization/client-copy';
import { useClientLanguage } from '@/localization/client-language-context';

export function useClientCopy() {
  const { account, draft } = useClientAccount();
  const { language: publicLanguage } = useClientLanguage();
  const language = account?.profile.preferredLanguage ?? draft.preferredLanguage ?? publicLanguage;
  const dictionary = clientCopy[language];
  const t = useCallback((key: ClientCopyKey) => dictionary[key], [dictionary]);
  const categoryLabel = useCallback((slug: string, fallback: string) => {
    const keys: Partial<Record<string, ClientCopyKey>> = {
      hair: 'categoryHair',
      braids: 'categoryBraids',
      nails: 'categoryNails',
      makeup: 'categoryMakeup',
      barber: 'categoryBarber',
      massage: 'categoryMassage',
    };
    const key = keys[slug];
    return key ? dictionary[key] : fallback;
  }, [dictionary]);
  return { language, isAmharic: language === 'am', t, categoryLabel };
}
