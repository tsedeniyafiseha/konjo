import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProfessionalRegistrationGateway } from '@/application/professional-registration/professional-registration-controller';
import type {
  ProfessionalApplication,
  ProfessionalRegistrationDraft,
} from '@/application/professional-registration/professional-registration-contracts';
import type { Database, Json } from '@/services/supabase-database.types';

type JsonRecord = Record<string, unknown>;

const weekdays = new Map([
  ['Sunday', 0],
  ['Monday', 1],
  ['Tuesday', 2],
  ['Wednesday', 3],
  ['Thursday', 4],
  ['Friday', 5],
  ['Saturday', 6],
]);

function parseTime24(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const period = match[3].toUpperCase();
  if (period === 'AM' && hour === 12) hour = 0;
  if (period === 'PM' && hour !== 12) hour += 12;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function payload(draft: ProfessionalRegistrationDraft): Json {
  return {
    ...draft,
    services: draft.services.map((service) => ({ ...service })),
    workingDays: draft.workingDays.map((day) => {
      const weekday = weekdays.get(day.day);
      if (weekday === undefined) throw new Error(`Unsupported working day: ${day.day}`);
      if (!day.enabled) return { ...day, weekday, startsAt: '', endsAt: '' };
      // Professionals can be booked around the clock, so a day without a
      // readable time range (e.g. an old "Day off" label on a day switched on)
      // is stored as the full day rather than blocking the submission.
      const [startsAtValue, endsAtValue] = day.hours.split(/\s+[–-]\s+/);
      const parsed = startsAtValue && endsAtValue ? [parseTime24(startsAtValue), parseTime24(endsAtValue)] : [null, null];
      const [startsAt, endsAt] = parsed[0] && parsed[1] ? parsed : ['00:00:00', '23:59:00'];
      return {
        ...day,
        weekday,
        hours: parsed[0] && parsed[1] ? day.hours : '12:00 AM – 11:59 PM',
        startsAt,
        endsAt,
      };
    }),
    travelZones: draft.travelZones.map((zone) => ({ ...zone })),
  } as unknown as Json;
}

function isApplication(value: unknown): value is ProfessionalApplication {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as JsonRecord;
  return typeof candidate.id === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.submittedAt === 'number' &&
    Boolean(candidate.profile) &&
    Array.isArray(candidate.services) &&
    Array.isArray(candidate.workingDays) &&
    Array.isArray(candidate.travelZones);
}

function application(value: unknown): ProfessionalApplication | null {
  if (value === null) return null;
  if (!isApplication(value)) throw new Error('Supabase returned an invalid professional application.');
  return value;
}

function reference(): string {
  const nonce = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `KJ-PRO-${Date.now().toString(36).toUpperCase()}-${nonce}`;
}

export class SupabaseProfessionalRegistrationGateway implements ProfessionalRegistrationGateway {
  private readonly client: SupabaseClient<Database>;

  constructor(client: SupabaseClient<Database>) {
    this.client = client;
  }

  async loadDraft(): Promise<{ draft: ProfessionalRegistrationDraft; revision: number } | null> {
    const { data, error } = await this.client.from('professional_registration_drafts').select('draft,revision').maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return { draft: data.draft as unknown as ProfessionalRegistrationDraft, revision: data.revision };
  }

  async saveDraft(draft: ProfessionalRegistrationDraft, expectedRevision: number): Promise<number> {
    const { data, error } = await this.client.rpc('save_my_professional_registration_draft', {
      p_draft: draft as unknown as Json, p_expected_revision: expectedRevision,
    });
    if (error) throw new Error(error.message);
    if (typeof data !== 'number') throw new Error('Your registration draft could not be saved.');
    return data;
  }

  async loadApplication(): Promise<ProfessionalApplication | null> {
    const { data, error } = await this.client.rpc('get_my_professional_application');
    if (error) throw new Error(error.message);
    return application(data);
  }

  async submitApplication(draft: ProfessionalRegistrationDraft): Promise<ProfessionalApplication> {
    const { data, error } = await this.client.rpc('submit_my_professional_application', {
      p_application_reference: reference(),
      p_payload: payload(draft),
    });
    if (error) throw new Error(error.message);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Supabase returned an invalid application result.');
    }
    const result = data as JsonRecord;
    if (result.result === 'not_editable') {
      throw new Error('This professional application is already under review.');
    }
    if (result.result !== 'submitted') {
      throw new Error('Supabase did not accept the professional application.');
    }
    const submitted = application(result.application);
    if (!submitted) throw new Error('Supabase did not return the saved professional application.');
    return submitted;
  }

  async updateApprovedProfile(draft: ProfessionalRegistrationDraft): Promise<ProfessionalApplication> {
    const { data, error } = await this.client.rpc('update_my_professional_profile', {
      p_payload: payload(draft),
    });
    if (error) throw new Error(error.message);
    const updated = application(data);
    if (!updated) throw new Error('Supabase did not return the updated profile.');
    return updated;
  }

  async listZones(): Promise<readonly { id: string; label: string }[]> {
    const { data, error } = await this.client.rpc('list_active_zones');
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data as { id: string; label: string }[] : [];
  }

}
