import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  ClientIdentityDocument,
  ClientIdentityDocumentRepository,
  ClientIdentityDocumentStorage,
} from '@/application/client-identity-documents/client-identity-document-contracts';
import type { Database, Tables } from '@/services/supabase-database.types';

const BUCKET = 'client-identity-documents';
type Row = Tables<'client_identity_documents'>;

function fromRow(row: Row): ClientIdentityDocument {
  return { id: row.id, clientId: row.client_id, kind: row.kind, storagePath: row.storage_path, status: row.status, rejectionReason: row.rejection_reason, createdAt: row.created_at };
}

function failure(message: string, cause?: unknown): Error { return new Error(message, cause ? { cause } : undefined); }

export class SupabaseClientIdentityDocumentRepository implements ClientIdentityDocumentRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}
  async list(clientId: string): Promise<readonly ClientIdentityDocument[]> {
    const { data, error } = await this.client.from('client_identity_documents').select('*').eq('client_id', clientId).order('created_at', { ascending: false });
    if (error) throw failure('Client identity documents could not be loaded.', error);
    return (data as Row[]).map(fromRow);
  }
  async create(input: Parameters<ClientIdentityDocumentRepository['create']>[0]): Promise<ClientIdentityDocument> {
    const { data, error } = await this.client.from('client_identity_documents').insert({ client_id: input.clientId, kind: input.kind, storage_path: input.storagePath }).select('*').single();
    if (error || !data) throw failure('The identity review record could not be created.', error);
    return fromRow(data as Row);
  }
  async delete(clientId: string, documentId: string): Promise<void> {
    const { error } = await this.client.from('client_identity_documents').delete().eq('id', documentId).eq('client_id', clientId);
    if (error) throw failure('The identity review record could not be deleted.', error);
  }
}

export class SupabaseClientIdentityDocumentStorage implements ClientIdentityDocumentStorage {
  constructor(private readonly client: SupabaseClient<Database>) {}
  async upload(input: Parameters<ClientIdentityDocumentStorage['upload']>[0]): Promise<void> {
    const { error } = await this.client.storage.from(BUCKET).upload(input.path, input.file.bytes, { contentType: input.file.mimeType, cacheControl: '3600', upsert: false });
    if (error) throw failure('The private identity document could not be uploaded.', error);
  }
  async delete(path: string): Promise<void> {
    const { error } = await this.client.storage.from(BUCKET).remove([path]);
    if (error) throw failure('The private identity document could not be deleted.', error);
  }
}
