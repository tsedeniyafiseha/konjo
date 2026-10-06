import { supabaseServiceHeaders } from './supabase-service-headers.ts';
import type { ApiPortfolioFeedItem, ApiProfessionalPortfolioItem } from '../../../shared/api-contracts.ts';
import type { ProfessionalPortfolioReadStore } from '../application/ports.ts';

interface PortfolioPath {
  id: string;
  storagePath: string;
  createdAt: string;
}

export class SupabaseProfessionalPortfolioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseProfessionalPortfolioError';
  }
}

export class SupabaseProfessionalPortfolioRepository implements ProfessionalPortfolioReadStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly now: () => Date;

  constructor(baseUrl: string, secretKey: string, now: () => Date = () => new Date()) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
    this.now = now;
  }

  async listApprovedPortfolio(professionalId: string): Promise<ReadonlyArray<ApiProfessionalPortfolioItem>> {
    const paths = await this.listPaths(professionalId);
    return Promise.all(paths.map(async (item) => ({
      id: item.id,
      url: await this.sign(item.storagePath),
      expiresAt: new Date(this.now().getTime() + 5 * 60 * 1000).toISOString(),
    })));
  }

  async listPortfolioFeed(limit: number): Promise<ReadonlyArray<ApiPortfolioFeedItem>> {
    const response = await this.request('/rest/v1/rpc/list_portfolio_feed', { p_limit: limit });
    const rows = await response.json() as unknown;
    if (!Array.isArray(rows)) throw new SupabaseProfessionalPortfolioError('Supabase returned an invalid portfolio feed.');
    const expiresAt = new Date(this.now().getTime() + 5 * 60 * 1000).toISOString();
    const items = await Promise.all(rows.map(async (row: Record<string, unknown>) => {
      if (typeof row.storagePath !== 'string' || typeof row.id !== 'string') return null;
      try {
        return {
          id: row.id,
          url: await this.sign(row.storagePath),
          expiresAt,
          professionalId: String(row.professionalId),
          professionalName: String(row.professionalName ?? ''),
          specialty: String(row.specialty ?? ''),
          available: row.available === true,
        } satisfies ApiPortfolioFeedItem;
      } catch {
        return null;
      }
    }));
    return items.filter((item): item is ApiPortfolioFeedItem => item !== null);
  }

  private async listPaths(professionalId: string): Promise<PortfolioPath[]> {
    const response = await this.request('/rest/v1/rpc/list_approved_professional_portfolio_paths', {
      p_professional_id: professionalId,
    });
    const result = await response.json() as unknown;
    if (!Array.isArray(result) || !result.every((item) => (
      item && typeof item === 'object' &&
      typeof (item as PortfolioPath).id === 'string' &&
      typeof (item as PortfolioPath).storagePath === 'string'
    ))) {
      throw new SupabaseProfessionalPortfolioError('Supabase returned invalid portfolio metadata.');
    }
    return result as PortfolioPath[];
  }

  private async sign(storagePath: string): Promise<string> {
    const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/');
    const response = await this.request(
      `/storage/v1/object/sign/professional-documents/${encodedPath}`,
      { expiresIn: 300 },
    );
    const result = await response.json() as { signedURL?: unknown };
    if (typeof result.signedURL !== 'string' || !result.signedURL) {
      throw new SupabaseProfessionalPortfolioError('Supabase did not return a portfolio preview URL.');
    }
    if (result.signedURL.startsWith('http')) return result.signedURL;
    // Storage returns the signed path relative to its own API root
    // ("/object/sign/..."), not to the project URL.
    const signedPath = result.signedURL.startsWith('/storage/v1/')
      ? result.signedURL
      : `/storage/v1${result.signedURL.startsWith('/') ? '' : '/'}${result.signedURL}`;
    return `${this.baseUrl}${signedPath}`;
  }

  private async request(path: string, body: Record<string, unknown>): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: supabaseServiceHeaders(this.secretKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
    } catch {
      throw new SupabaseProfessionalPortfolioError('Supabase portfolio media is unavailable.');
    }
    if (!response.ok) {
      throw new SupabaseProfessionalPortfolioError('Supabase rejected the portfolio media request.');
    }
    return response;
  }
}
