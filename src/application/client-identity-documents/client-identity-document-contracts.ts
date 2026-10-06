export type ClientIdentityDocumentKind = 'national_id_front' | 'national_id_back' | 'passport';
export type ClientIdentityDocumentStatus = 'pending' | 'approved' | 'rejected';

export interface ClientIdentityDocument {
  id: string;
  clientId: string;
  kind: ClientIdentityDocumentKind;
  storagePath: string;
  status: ClientIdentityDocumentStatus;
  rejectionReason: string | null;
  createdAt: string;
}

export interface PickedClientIdentityDocument {
  name: string;
  mimeType: string;
  size: number;
  bytes: ArrayBuffer;
}

export interface ClientIdentityDocumentPicker {
  pick(kind: ClientIdentityDocumentKind): Promise<PickedClientIdentityDocument | null>;
}

export interface ClientIdentityDocumentRepository {
  list(clientId: string): Promise<readonly ClientIdentityDocument[]>;
  create(input: { clientId: string; kind: ClientIdentityDocumentKind; storagePath: string }): Promise<ClientIdentityDocument>;
  delete(clientId: string, documentId: string): Promise<void>;
}

export interface ClientIdentityDocumentStorage {
  upload(input: { path: string; file: PickedClientIdentityDocument }): Promise<void>;
  delete(path: string): Promise<void>;
}

export interface ClientIdentityDocumentRuntime {
  createStoragePath(clientId: string, kind: ClientIdentityDocumentKind, originalName: string): string;
}

export function clientIdentityDocumentState(documents: readonly ClientIdentityDocument[]) {
  const active = (kind: ClientIdentityDocumentKind) => documents.find(
    (document) => document.kind === kind && document.status !== 'rejected',
  );
  const passport = active('passport');
  const front = active('national_id_front');
  const back = active('national_id_back');
  const complete = Boolean(passport || (front && back));
  const approved = passport?.status === 'approved' || (
    front?.status === 'approved' && back?.status === 'approved'
  );
  const pending = complete && !approved;
  const rejectedReason = complete
    ? null
    : documents.find((document) => document.status === 'rejected')?.rejectionReason ?? null;
  return { passport, front, back, complete, approved, pending, rejectedReason };
}
