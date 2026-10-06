import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { ClientPreferredLanguage } from '@/application/client-account/client-account-contracts';
import type { ClientLanguageController } from '@/application/language/client-language-controller';

interface ClientLanguageContextValue {
  language: ClientPreferredLanguage;
  setLanguage: (language: ClientPreferredLanguage) => void;
}

interface ClientLanguageProviderProps extends PropsWithChildren {
  controller: ClientLanguageController;
}

const ClientLanguageContext = createContext<ClientLanguageContextValue | null>(null);

export function ClientLanguageProvider({ children, controller }: ClientLanguageProviderProps) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.restore();
    return () => controller.deactivate();
  }, [controller]);

  const setLanguage = useCallback(
    (language: ClientPreferredLanguage) => controller.setLanguage(language),
    [controller],
  );
  const value = useMemo(() => ({
    language: snapshot.language,
    setLanguage,
  }), [setLanguage, snapshot.language]);

  return <ClientLanguageContext.Provider value={value}>{children}</ClientLanguageContext.Provider>;
}

export function useClientLanguage(): ClientLanguageContextValue {
  const value = useContext(ClientLanguageContext);
  if (!value) throw new Error('useClientLanguage must be used inside ClientLanguageProvider.');
  return value;
}
