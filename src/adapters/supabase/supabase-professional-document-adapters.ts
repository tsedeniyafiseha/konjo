import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  ProfessionalDocument,
  ProfessionalDocumentRepository,
  ProfessionalDocumentStorage,
} from '@/application/professional-documents/professional-document-contracts';
import type { Database, Tables } from '@/services/supabase-database.types';

const BUCKET = 'professional-documents';

type ProfessionalDocumentRow = Pick<
  Tables<'professional_documents'>,
  | 'id'
  | 'professional_id'
  | 'kind'
  | 'credential_type'
  | 'storage_path'
  | 'status'
  | 'rejection_reason'
  | 'created_at'
>;

function documentFromRow(row: ProfessionalDocumentRow): ProfessionalDocument {
  return {
    id: row.id,
    professionalId: row.professional_id,
    kind: row.kind,
    credentialType: row.credential_type === 'education' || row.credential_type === 'course' ? row.credential_type : null,
    storagePath: row.storage_path,
    status: row.status,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
  };
}

function failure(error: { message: string } | null, fallback: string): Error {
  return new Error(fallback, error ? { cause: error } : undefined);
}

function isCredentialTypeUnavailable(error: { message: string } | null): boolean {
  return Boolean(error?.message && /credential_type|credential type|column .* does not exist/i.test(error.message));
}

function legacyDocumentFromRow(row: Omit<ProfessionalDocumentRow, 'credential_type'>): ProfessionalDocument {
  return documentFromRow({ ...row, credential_type: row.kind === 'certificate' ? 'education' : null });
}

export class SupabaseProfessionalDocumentRepository implements ProfessionalDocumentRepository {
  private readonly client: SupabaseClient<Database>;

  constructor(client: SupabaseClient<Database>) {
    this.client = client;
  }

  async list(professionalId: string): Promise<readonly ProfessionalDocument[]> {
    const { data, error } = await this.client
      .from('professional_documents')
      .select('id,professional_id,kind,credential_type,storage_path,status,rejection_reason,created_at')
      .eq('professional_id', professionalId)
      .order('created_at', { ascending: false });
    if (!error) return (data as ProfessionalDocumentRow[]).map(documentFromRow);
    if (!isCredentialTypeUnavailable(error)) throw failure(error, 'Professional documents could not be loaded.');
    const legacy = await this.client
      .from('professional_documents')
      .select('id,professional_id,kind,storage_path,status,rejection_reason,created_at')
      .eq('professional_id', professionalId)
      .order('created_at', { ascending: false });
    if (legacy.error) throw failure(legacy.error, 'Professional documents could not be loaded.');
    return (legacy.data as Omit<ProfessionalDocumentRow, 'credential_type'>[]).map(legacyDocumentFromRow);
  }

  async create(input: {
    professionalId: string;
    kind: ProfessionalDocument['kind'];
    credentialType?: ProfessionalDocument['credentialType'];
    storagePath: string;
  }): Promise<ProfessionalDocument> {
    const { data, error } = await this.client
      .from('professional_documents')
      .insert({
        professional_id: input.professionalId,
        kind: input.kind,
        credential_type: input.credentialType ?? (input.kind === 'certificate' ? 'education' : null),
        storage_path: input.storagePath,
      })
      .select('id,professional_id,kind,credential_type,storage_path,status,rejection_reason,created_at')
      .single();
    if (!error && data) return documentFromRow(data as ProfessionalDocumentRow);
    if (!isCredentialTypeUnavailable(error)) throw failure(error, 'The document review record could not be created.');
    const legacy = await this.client
      .from('professional_documents')
      .insert({ professional_id: input.professionalId, kind: input.kind, storage_path: input.storagePath })
      .select('id,professional_id,kind,storage_path,status,rejection_reason,created_at')
      .single();
    if (legacy.error || !legacy.data) throw failure(legacy.error, 'The document review record could not be created.');
    return legacyDocumentFromRow(legacy.data as Omit<ProfessionalDocumentRow, 'credential_type'>);
  }

  async delete(professionalId: string, documentId: string): Promise<void> {
    const { error } = await this.client
      .from('professional_documents')
      .delete()
      .eq('id', documentId)
      .eq('professional_id', professionalId);
    if (error) throw failure(error, 'The document review record could not be deleted.');
  }
}

export class SupabaseProfessionalDocumentStorage implements ProfessionalDocumentStorage {
  private readonly client: SupabaseClient<Database>;

  constructor(client: SupabaseClient<Database>) {
    this.client = client;
  }

  async upload(input: Parameters<ProfessionalDocumentStorage['upload']>[0]): Promise<void> {
    const { error } = await this.client.storage
      .from(BUCKET)
      .upload(input.path, input.file.bytes, {
        contentType: input.file.mimeType,
        cacheControl: '3600',
        upsert: false,
      });
    if (error) throw failure(error, 'The private document object could not be uploaded.');
  }

  async delete(path: string): Promise<void> {
    const { error } = await this.client.storage.from(BUCKET).remove([path]);
    if (error) throw failure(error, 'The private document object could not be deleted.');
  }

  async createPreviewUrl(path: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) throw failure(error, 'The private preview could not be created.');
    return data.signedUrl;
  }
}
