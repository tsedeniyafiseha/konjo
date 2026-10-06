import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { ClientIdentityDocumentController } from '@/application/client-identity-documents/client-identity-document-controller';
import type { ClientIdentityDocumentKind } from '@/application/client-identity-documents/client-identity-document-contracts';
import { clientIdentityDocumentState } from '@/application/client-identity-documents/client-identity-document-contracts';
import { useAuthSession } from '@/features/auth/session-context';

type Value = ReturnType<typeof clientIdentityDocumentState> & {
  available: boolean;
  loading: boolean;
  loadFailed: boolean;
  refresh(): Promise<void>;
  busy: boolean;
  error: string | null;
  uploadDocument(kind: ClientIdentityDocumentKind): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;
  dismissError(): void;
};

const Context = createContext<Value | null>(null);

export function ClientIdentityDocumentProvider({ children, controller }: PropsWithChildren<{ controller: ClientIdentityDocumentController }>) {
  const { session } = useAuthSession();
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { void controller.activate(session); return () => controller.deactivate(); }, [controller, session]);
  const value = useMemo<Value>(() => ({
    ...clientIdentityDocumentState(snapshot.documents),
    available: snapshot.available,
    loading: snapshot.loadStatus === 'loading' || snapshot.loadStatus === 'idle',
    loadFailed: snapshot.loadStatus === 'error',
    refresh: () => controller.activate(session),
    busy: snapshot.mutationStatus !== 'idle',
    error: snapshot.error,
    uploadDocument: (kind) => controller.uploadDocument(kind),
    deleteDocument: (id) => controller.deleteDocument(id),
    dismissError: () => controller.dismissError(),
  }), [controller, session, snapshot]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useClientIdentityDocuments(): Value {
  const value = useContext(Context);
  if (!value) throw new Error('useClientIdentityDocuments must be used inside ClientIdentityDocumentProvider.');
  return value;
}
