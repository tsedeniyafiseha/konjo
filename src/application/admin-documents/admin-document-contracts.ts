import type { ProfessionalDocumentStatus } from '@/application/professional-documents/professional-document-contracts';

export interface AdminReviewDocument {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerRole: 'client' | 'professional';
  kind: string;
  storageBucket: 'client-identity-documents' | 'professional-documents';
  storagePath: string;
  status: ProfessionalDocumentStatus;
  rejectionReason: string | null;
  createdAt: string;
}

export type AdminDocumentDecision = Extract<
  ProfessionalDocumentStatus,
  'approved' | 'rejected'
>;

export interface AdminDocumentRepository {
  listPending(): Promise<readonly AdminReviewDocument[]>;
  review(input: {
    documentId: string;
    ownerRole: AdminReviewDocument['ownerRole'];
    decision: AdminDocumentDecision;
    rejectionReason?: string;
  }): Promise<void>;
}

export interface AdminDocumentPreviewGateway {
  createSignedPreview(storagePath: string, expiresInSeconds: number, storageBucket?: AdminReviewDocument['storageBucket']): Promise<string>;
}

export interface AdminDocumentViewTarget {
  open(url: string): Promise<void>;
  cancel(): void;
}

export interface AdminDocumentViewer {
  prepare(): AdminDocumentViewTarget;
}
