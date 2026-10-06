import type { PropsWithChildren } from 'react';
import { createContext, useContext } from 'react';

import type { ClientAuthenticationGateway } from '@/application/auth/client-auth-contracts';
import type { PhoneAuthenticationGateway } from '@/application/auth/phone-auth-contracts';

const ClientAuthContext = createContext<ClientAuthenticationGateway | null>(null);
const PhoneAuthContext = createContext<PhoneAuthenticationGateway | null>(null);
const ProfessionalAuthContext = createContext<ClientAuthenticationGateway | null>(null);

interface ClientAuthProviderProps extends PropsWithChildren {
  gateway: ClientAuthenticationGateway;
  phoneGateway: PhoneAuthenticationGateway;
  professionalGateway: ClientAuthenticationGateway | null;
}

export function ClientAuthProvider({ children, gateway, phoneGateway, professionalGateway }: ClientAuthProviderProps) {
  return (
    <ClientAuthContext.Provider value={gateway}>
      <PhoneAuthContext.Provider value={phoneGateway}>
        <ProfessionalAuthContext.Provider value={professionalGateway}>
          {children}
        </ProfessionalAuthContext.Provider>
      </PhoneAuthContext.Provider>
    </ClientAuthContext.Provider>
  );
}

export function useProfessionalAuthentication(): ClientAuthenticationGateway | null {
  return useContext(ProfessionalAuthContext);
}

export function useClientAuthentication(): ClientAuthenticationGateway {
  const gateway = useContext(ClientAuthContext);
  if (!gateway) throw new Error('useClientAuthentication must be used inside ClientAuthProvider.');
  return gateway;
}

export function usePhoneAuthentication(): PhoneAuthenticationGateway {
  const gateway = useContext(PhoneAuthContext);
  if (!gateway) throw new Error('usePhoneAuthentication must be used inside ClientAuthProvider.');
  return gateway;
}
