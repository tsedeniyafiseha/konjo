import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { ProfessionalDocumentController } from '@/application/professional-documents/professional-document-controller';
import type { ProfessionalCredentialType, ProfessionalDocument, ProfessionalDocumentKind } from '@/application/professional-documents/professional-document-contracts';
import { useAuthSession } from '@/features/auth/session-context';

interface ProfessionalDocumentContextValue {
  documents: readonly ProfessionalDocument[];
  available: boolean;
  loading: boolean;
  mutationStatus: 'idle' | 'picking' | 'uploading' | 'deleting';
  error: string | null;
  uploadDocument(kind: ProfessionalDocumentKind, credentialType?: ProfessionalCredentialType): Promise<void>;
  deleteDocument(documentId: string): Promise<void>;
  dismissError(): void;
  previewUrl(documentId: string): Promise<string | null>;
}

interface ProfessionalDocumentProviderProps extends PropsWithChildren {
  controller: ProfessionalDocumentController;
}

const ProfessionalDocumentContext = createContext<ProfessionalDocumentContextValue | null>(null);

export function ProfessionalDocumentProvider({
  children,
  controller,
}: ProfessionalDocumentProviderProps) {
  const { session } = useAuthSession();
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.activate(session);
    return () => controller.deactivate();
  }, [controller, session]);

  const value = useMemo<ProfessionalDocumentContextValue>(() => ({
    documents: snapshot.documents,
    available: snapshot.available,
    loading: snapshot.loadStatus !== 'ready',
    mutationStatus: snapshot.mutationStatus,
    error: snapshot.error,
    uploadDocument: (kind, credentialType) => controller.uploadDocument(kind, credentialType),
    deleteDocument: (documentId) => controller.deleteDocument(documentId),
    dismissError: () => controller.dismissError(),
    previewUrl: (documentId) => controller.previewUrl(documentId),
  }), [controller, snapshot]);

  return (
    <ProfessionalDocumentContext.Provider value={value}>
      {children}
    </ProfessionalDocumentContext.Provider>
  );
}

export function useProfessionalDocuments(): ProfessionalDocumentContextValue {
  const value = useContext(ProfessionalDocumentContext);
  if (!value) {
    throw new Error('useProfessionalDocuments must be used inside ProfessionalDocumentProvider.');
  }
  return value;
}
