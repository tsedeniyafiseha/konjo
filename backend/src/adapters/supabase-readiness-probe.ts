import type { ReadinessProbe } from '../application/ports.ts';
import { supabaseServiceHeaders } from './supabase-service-headers.ts';

export class SupabaseReadinessProbe implements ReadinessProbe {
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly fetcher: typeof fetch;

  constructor(
    baseUrl: string,
    secretKey: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
    this.fetcher = fetcher;
  }

  async check(): Promise<void> {
    let response: Response;
    try {
      response = await this.fetcher(
        `${this.baseUrl}/rest/v1/platform_settings?select=key&limit=1`,
        {
          method: 'GET',
          headers: supabaseServiceHeaders(this.secretKey, { Accept: 'application/json' }),
          signal: AbortSignal.timeout(5_000),
        },
      );
    } catch {
      throw new Error('The persistence provider is unavailable.');
    }

    if (!response.ok) throw new Error('The persistence provider rejected the readiness check.');
  }
}
