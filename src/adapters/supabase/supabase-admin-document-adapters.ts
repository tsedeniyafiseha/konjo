import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  AdminDocumentPreviewGateway,
  AdminDocumentRepository,
  AdminReviewDocument,
} from '@/application/admin-documents/admin-document-contracts';
import type { Database, Tables } from '@/services/supabase-database.types';

type ProfessionalRow = Tables<'professional_documents'>;
type ClientRow = Tables<'client_identity_documents'>;

function failure(message: string, cause?: unknown): Error {
  return new Error(message, cause ? { cause } : undefined);
}

export class SupabaseAdminDocumentRepository implements AdminDocumentRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async listPending(): Promise<readonly AdminReviewDocument[]> {
    const [professionalResult, clientResult] = await Promise.all([
      this.client.from('professional_documents').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
      this.client.from('client_identity_documents').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
    ]);
    if (professionalResult.error && clientResult.error) {
      throw failure('The document review queue could not be loaded.', professionalResult.error ?? clientResult.error);
    }
    const professionalRows = professionalResult.error ? [] : professionalResult.data as ProfessionalRow[];
    const clientRows = clientResult.error ? [] : clientResult.data as ClientRow[];
    const ownerIds = [...new Set([
      ...professionalRows.map((row) => row.professional_id),
      ...clientRows.map((row) => row.client_id),
    ])];
    const names = new Map<string, string>();
    if (ownerIds.length) {
      const { data, error } = await this.client.from('profiles').select('user_id,full_name').in('user_id', ownerIds);
      if (!error) {
        for (const profile of data) names.set(profile.user_id, profile.full_name);
      }
    }
    return [
      ...professionalRows.map((row): AdminReviewDocument => ({
        id: row.id,
        ownerId: row.professional_id,
        ownerName: names.get(row.professional_id) || 'Professional',
        ownerRole: 'professional',
        kind: row.kind,
        storageBucket: 'professional-documents',
        storagePath: row.storage_path,
        status: row.status,
        rejectionReason: row.rejection_reason,
        createdAt: row.created_at,
      })),
      ...clientRows.map((row): AdminReviewDocument => ({
        id: row.id,
        ownerId: row.client_id,
        ownerName: names.get(row.client_id) || 'Client',
        ownerRole: 'client',
        kind: row.kind,
        storageBucket: 'client-identity-documents',
        storagePath: row.storage_path,
        status: row.status,
        rejectionReason: row.rejection_reason,
        createdAt: row.created_at,
      })),
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async review(input: Parameters<AdminDocumentRepository['review']>[0]): Promise<void> {
    const functionName = input.ownerRole === 'client'
      ? 'review_client_identity_document'
      : 'review_professional_document';
    const { error } = await this.client.rpc(functionName, {
      p_document_id: input.documentId,
      p_status: input.decision,
      ...(input.rejectionReason ? { p_rejection_reason: input.rejectionReason } : {}),
    });
    if (error) throw failure('The document decision could not be saved.', error);
  }
}

export class SupabaseAdminDocumentPreviewGateway implements AdminDocumentPreviewGateway {
  constructor(private readonly client: SupabaseClient<Database>) {}
  async createSignedPreview(storagePath: string, expiresInSeconds: number, storageBucket: AdminReviewDocument['storageBucket'] = 'professional-documents'): Promise<string> {
    const { data, error } = await this.client.storage.from(storageBucket).createSignedUrl(storagePath, expiresInSeconds);
    if (error || !data?.signedUrl) throw failure('The private document preview could not be created.', error);
    return data.signedUrl;
  }
}
