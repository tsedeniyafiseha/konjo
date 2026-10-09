import type {
  WebsiteApplicationFileStore,
  WebsiteSubmissionStore,
} from '../bootstrap/backend-dependencies.ts';
import type { MultipartFile } from '../multipart.ts';
import {
  prepareApplicationFiles,
  type StoredApplicationFile,
} from '../uploads.ts';
import { supabaseServiceHeaders } from './supabase-service-headers.ts';

const APPLICATION_BUCKET = 'website-professional-applications';

export class SupabaseWebsiteSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseWebsiteSubmissionError';
  }
}

export class SupabaseWebsiteSubmissionRepository
implements WebsiteSubmissionStore, WebsiteApplicationFileStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly fetcher: typeof fetch;

  constructor(baseUrl: string, secretKey: string, fetcher: typeof fetch = fetch) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
    this.fetcher = fetcher;
  }

  async createContactMessage(input: Parameters<WebsiteSubmissionStore['createContactMessage']>[0]): Promise<void> {
    await this.insert('website_contact_messages', {
      id: input.id,
      full_name: input.fullName,
      email: input.email,
      topic: input.topic,
      message: input.message,
      recipient: input.recipient,
      submitted_at: input.submittedAt,
    });
  }

  async createProfessionalApplication(
    input: Parameters<WebsiteSubmissionStore['createProfessionalApplication']>[0],
  ): Promise<void> {
    await this.insert('website_professional_applications', {
      id: input.id,
      full_name: input.fullName,
      email: input.email,
      phone: input.phone,
      location: input.location,
      specialties: input.specialties,
      languages: input.languages,
      years_experience: input.yearsExperience,
      introduction: input.introduction,
      files: input.files,
      submitted_at: input.submittedAt,
    });
  }

  async store(
    applicationId: string,
    files: ReadonlyArray<MultipartFile>,
  ): Promise<ReadonlyArray<StoredApplicationFile>> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(applicationId)) {
      throw new SupabaseWebsiteSubmissionError('The website application ID is invalid.');
    }
    const prepared = prepareApplicationFiles(files);
    const uploaded: string[] = [];
    try {
      for (const file of prepared) {
        const path = `${applicationId}/${file.metadata.storedName}`;
        const response = await this.fetcher(
          `${this.baseUrl}/storage/v1/object/${APPLICATION_BUCKET}/${path}`,
          {
            method: 'POST',
            headers: supabaseServiceHeaders(this.secretKey, {
              'Content-Type': file.metadata.mimeType,
              'x-upsert': 'false',
            }),
            body: file.data,
          },
        );
        if (!response.ok) throw new SupabaseWebsiteSubmissionError('Supabase rejected a website application file.');
        uploaded.push(path);
      }
    } catch (error) {
      await this.remove(uploaded).catch(() => undefined);
      if (error instanceof SupabaseWebsiteSubmissionError) throw error;
      throw new SupabaseWebsiteSubmissionError('Supabase website file storage is unavailable.');
    }
    return prepared.map((file) => file.metadata);
  }

  private async insert(table: string, body: object): Promise<void> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/rest/v1/${table}`, {
        method: 'POST',
        headers: supabaseServiceHeaders(this.secretKey, {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        }),
        body: JSON.stringify(body),
      });
    } catch {
      throw new SupabaseWebsiteSubmissionError('Supabase website submission storage is unavailable.');
    }
    if (!response.ok) {
      throw new SupabaseWebsiteSubmissionError('Supabase rejected the website submission.');
    }
  }

  private async remove(paths: ReadonlyArray<string>): Promise<void> {
    if (paths.length === 0) return;
    const response = await this.fetcher(`${this.baseUrl}/storage/v1/object/${APPLICATION_BUCKET}`, {
      method: 'DELETE',
      headers: supabaseServiceHeaders(this.secretKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!response.ok) throw new SupabaseWebsiteSubmissionError('Supabase could not roll back uploaded files.');
  }
}
