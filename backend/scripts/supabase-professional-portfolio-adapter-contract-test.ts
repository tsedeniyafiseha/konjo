import assert from 'node:assert/strict';

import { SupabaseProfessionalPortfolioRepository } from '../src/adapters/supabase-professional-portfolio-repository.ts';

const calls: Array<{ url: string; init: RequestInit }> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  calls.push({ url: String(input), init });
  if (calls.length === 1) {
    return Response.json([{
      id: 'document-1',
      storagePath: 'professional-1/portfolio/work image.jpg',
      createdAt: '2026-09-18T12:00:00.000Z',
    }]);
  }
  return Response.json({ signedURL: '/storage/v1/object/sign/signed-path?token=short-lived' });
};

try {
  const repository = new SupabaseProfessionalPortfolioRepository(
    'https://project.supabase.co/',
    'sb_secret_server_only',
    () => new Date('2026-09-18T12:00:00.000Z'),
  );
  assert.deepEqual(await repository.listApprovedPortfolio('professional-1'), [{
    id: 'document-1',
    url: 'https://project.supabase.co/storage/v1/object/sign/signed-path?token=short-lived',
    expiresAt: '2026-09-18T12:05:00.000Z',
  }]);
  assert.equal(
    calls[0].url,
    'https://project.supabase.co/rest/v1/rpc/list_approved_professional_portfolio_paths',
  );
  assert.equal(
    calls[1].url,
    'https://project.supabase.co/storage/v1/object/sign/professional-documents/professional-1/portfolio/work%20image.jpg',
  );
  for (const call of calls) {
    const headers = call.init.headers as Record<string, string>;
    assert.equal(headers.apikey, 'sb_secret_server_only');
    assert.equal(headers.Authorization, undefined);
  }
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { expiresIn: 300 });
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Supabase approved portfolio adapter contract passed.');
