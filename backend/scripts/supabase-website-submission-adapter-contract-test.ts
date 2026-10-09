import assert from 'node:assert/strict';

import { SupabaseWebsiteSubmissionRepository } from '../src/adapters/supabase-website-submission-repository.ts';

interface RecordedRequest {
  url: string;
  init: RequestInit;
}

const requests: RecordedRequest[] = [];
const fetcher = (async (input: string | URL | Request, init: RequestInit = {}) => {
  requests.push({ url: String(input), init });
  return new Response(null, { status: 201 });
}) as typeof fetch;

const repository = new SupabaseWebsiteSubmissionRepository(
  'https://example.supabase.co/',
  'server-secret',
  fetcher,
);

await repository.createContactMessage({
  id: '00000000-0000-4000-8000-000000000001',
  fullName: 'Test Contact',
  email: 'contact@example.com',
  topic: 'general',
  message: 'Hello',
  recipient: 'info@example.com',
  submittedAt: '2026-10-09T00:00:00.000Z',
});

assert.equal(requests[0]?.url, 'https://example.supabase.co/rest/v1/website_contact_messages');
assert.equal(requests[0]?.init.method, 'POST');
assert.deepEqual(JSON.parse(String(requests[0]?.init.body)), {
  id: '00000000-0000-4000-8000-000000000001',
  full_name: 'Test Contact',
  email: 'contact@example.com',
  topic: 'general',
  message: 'Hello',
  recipient: 'info@example.com',
  submitted_at: '2026-10-09T00:00:00.000Z',
});

requests.length = 0;
const files = await repository.store(
  '00000000-0000-4000-8000-000000000002',
  [
    {
      fieldName: 'cv',
      fileName: 'resume.pdf',
      mimeType: 'application/pdf',
      data: Buffer.from('%PDF-1.4\n%%EOF'),
    },
    {
      fieldName: 'portfolio',
      fileName: 'work.png',
      mimeType: 'image/png',
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    },
  ],
);

assert.deepEqual(files.map((file) => file.storedName), ['cv-1.pdf', 'portfolio-2.png']);
assert.equal(requests.length, 2);
assert.match(requests[0]?.url ?? '', /website-professional-applications\/00000000-0000-4000-8000-000000000002\/cv-1\.pdf$/);
assert.match(requests[1]?.url ?? '', /website-professional-applications\/00000000-0000-4000-8000-000000000002\/portfolio-2\.png$/);

console.log('Supabase website submission adapter contract passed.');
