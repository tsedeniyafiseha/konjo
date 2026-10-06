export type ProfessionalDocumentKind =
  | 'government_id'
  | 'national_id_front'
  | 'national_id_back'
  | 'selfie'
  | 'portfolio'
  | 'certificate';

export type ProfessionalDocumentStatus = 'pending' | 'approved' | 'rejected';
export type ProfessionalCredentialType = 'education' | 'course';

export interface ProfessionalDocument {
  id: string;
  professionalId: string;
  kind: ProfessionalDocumentKind;
  credentialType?: ProfessionalCredentialType | null;
  storagePath: string;
  status: ProfessionalDocumentStatus;
  rejectionReason: string | null;
  createdAt: string;
}

export interface PickedProfessionalDocument {
  name: string;
  mimeType: string;
  size: number;
  bytes: ArrayBuffer;
}

export interface ProfessionalDocumentPicker {
  pick(kind: ProfessionalDocumentKind): Promise<PickedProfessionalDocument | null>;
}

export interface ProfessionalDocumentRepository {
  list(professionalId: string): Promise<readonly ProfessionalDocument[]>;
  create(input: {
    professionalId: string;
    kind: ProfessionalDocumentKind;
    credentialType?: ProfessionalCredentialType;
    storagePath: string;
  }): Promise<ProfessionalDocument>;
  delete(professionalId: string, documentId: string): Promise<void>;
}

export interface ProfessionalDocumentStorage {
  upload(input: {
    path: string;
    file: PickedProfessionalDocument;
  }): Promise<void>;
  delete(path: string): Promise<void>;
  /** Short-lived private URL so the owner can see their own uploaded image. */
  createPreviewUrl?(path: string, expiresInSeconds: number): Promise<string>;
}

export interface ProfessionalDocumentRuntime {
  createStoragePath(
    professionalId: string,
    kind: ProfessionalDocumentKind,
    originalName: string,
  ): string;
}
