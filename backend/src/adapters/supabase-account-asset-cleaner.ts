import type { ApiAccountRole } from '../../../shared/api-contracts.ts';
import type { AccountAssetCleaner } from '../application/ports.ts';

const PROFESSIONAL_BUCKET = 'professional-documents';
const PROFESSIONAL_DOCUMENT_KINDS = ['government_id', 'national_id_front', 'national_id_back', 'selfie', 'portfolio', 'certificate'] as const;
const CLIENT_BUCKET = 'client-identity-documents';
const CLIENT_DOCUMENT_KINDS = ['national_id_front', 'national_id_back', 'passport'] as const;
const PAGE_SIZE = 100;
const DELETE_BATCH_SIZE = 1_000;

interface StorageListItem {
  id?: unknown;
  name?: unknown;
}

export class SupabaseAccountAssetCleanerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseAccountAssetCleanerError';
  }
}

export class SupabaseAccountAssetCleaner implements AccountAssetCleaner {
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly fetcher: typeof fetch;

  constructor(baseUrl: string, secretKey: string, fetcher: typeof fetch = fetch) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
    this.fetcher = fetcher;
  }

  async deletePrivateAssets(
    userId: string,
    role: Exclude<ApiAccountRole, 'admin'>,
  ): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
      throw new SupabaseAccountAssetCleanerError('The account asset prefix is invalid.');
    }

    const paths: string[] = [];
    const bucket = role === 'client' ? CLIENT_BUCKET : PROFESSIONAL_BUCKET;
    const kinds: readonly string[] = role === 'client' ? CLIENT_DOCUMENT_KINDS : PROFESSIONAL_DOCUMENT_KINDS;
    for (const kind of kinds) {
      let offset = 0;
      while (true) {
        const items = await this.list(bucket, `${userId}/${kind}`, offset);
        for (const item of items) {
          if (typeof item.id === 'string' && typeof item.name === 'string' && item.name) {
            paths.push(`${userId}/${kind}/${item.name}`);
          }
        }
        if (items.length < PAGE_SIZE) break;
        offset += items.length;
      }
    }

    for (let offset = 0; offset < paths.length; offset += DELETE_BATCH_SIZE) {
      await this.remove(bucket, paths.slice(offset, offset + DELETE_BATCH_SIZE));
    }
  }

  private async list(bucket: string, prefix: string, offset: number): Promise<StorageListItem[]> {
    const response = await this.request(
      `${this.baseUrl}/storage/v1/object/list/${bucket}`,
      'POST',
      { prefix, limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } },
    );
    const result: unknown = await response.json().catch(() => null);
    if (!Array.isArray(result)) {
      throw new SupabaseAccountAssetCleanerError('Supabase returned an invalid private-asset listing.');
    }
    return result as StorageListItem[];
  }

  private async remove(bucket: string, paths: string[]): Promise<void> {
    await this.request(
      `${this.baseUrl}/storage/v1/object/${bucket}`,
      'DELETE',
      { prefixes: paths },
    );
  }

  private async request(url: string, method: 'POST' | 'DELETE', body: object): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method,
        headers: {
          apikey: this.secretKey,
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new SupabaseAccountAssetCleanerError('Supabase private-asset cleanup is unavailable.');
    }
    if (!response.ok) {
      throw new SupabaseAccountAssetCleanerError('Supabase rejected private-asset cleanup.');
    }
    return response;
  }
}
