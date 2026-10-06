import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

import type { AdminDocumentController } from '@/application/admin-documents/admin-document-controller';
import type {
  AdminDocumentDecision,
  AdminReviewDocument,
} from '@/application/admin-documents/admin-document-contracts';
import { useAuthSession } from '@/features/auth/session-context';

interface AdminDocumentContextValue {
  documents: readonly AdminReviewDocument[];
  loading: boolean;
  activeDocumentId: string | null;
  error: string | null;
  refresh(): Promise<void>;
  previewDocument(documentId: string): Promise<void>;
  reviewDocument(
    documentId: string,
    decision: AdminDocumentDecision,
    rejectionReason?: string,
  ): Promise<void>;
  dismissError(): void;
  applicationImageUrl(storagePath: string): Promise<string | null>;
}

interface AdminDocumentProviderProps extends PropsWithChildren {
  controller: AdminDocumentController;
}

const AdminDocumentContext = createContext<AdminDocumentContextValue | null>(null);

export function AdminDocumentProvider({ children, controller }: AdminDocumentProviderProps) {
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

  const value = useMemo<AdminDocumentContextValue>(() => ({
    documents: snapshot.documents,
    loading: snapshot.loadStatus === 'loading',
    activeDocumentId: snapshot.activeDocumentId,
    error: snapshot.error,
    refresh: () => controller.refresh(),
    previewDocument: (documentId) => controller.previewDocument(documentId),
    reviewDocument: (documentId, decision, rejectionReason) => (
      controller.reviewDocument(documentId, decision, rejectionReason)
    ),
    dismissError: () => controller.dismissError(),
    applicationImageUrl: (storagePath) => controller.applicationImageUrl(storagePath),
  }), [controller, snapshot]);

  return (
    <AdminDocumentContext.Provider value={value}>
      {children}
    </AdminDocumentContext.Provider>
  );
}

export function useAdminDocuments(): AdminDocumentContextValue {
  const value = useContext(AdminDocumentContext);
  if (!value) throw new Error('useAdminDocuments must be used inside AdminDocumentProvider.');
  return value;
}
