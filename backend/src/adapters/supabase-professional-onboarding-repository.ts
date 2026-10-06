import { supabaseServiceHeaders } from './supabase-service-headers.ts';
import type {
  ApiAdminProfessionalApplication,
  ApiProfessionalApplication,
  ApiProfessionalCatalogSettings,
} from '../../../shared/api-contracts.ts';
import type {
  ReviewProfessionalApplicationStoreInput,
  SubmitProfessionalApplicationStoreInput,
  SubmitProfessionalApplicationResult,
} from '../application/contracts.ts';
import type {
  AdminProfessionalApplicationCommandStore,
  AdminProfessionalApplicationReadStore,
  ProfessionalApplicationCommandStore,
  ProfessionalApplicationReadStore,
} from '../application/ports.ts';

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

const serviceCategorySlugs = new Map([
  ['hair', 'hair'],
  ['hair styling', 'hair'],
  ['braids', 'braids'],
  ['braids & natural hair', 'braids'],
  ['nails', 'nails'],
  ['nail care', 'nails'],
  ['makeup', 'makeup'],
  ['makeup artistry', 'makeup'],
  ['barber', 'barber'],
  ['barbering', 'barber'],
  ['massage', 'massage'],
  ['massage & wellness', 'massage'],
]);

export class SupabaseProfessionalOnboardingError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SupabaseProfessionalOnboardingError';
    this.status = status;
  }
}

function time24(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) throw new Error(`Unsupported working time: ${value}`);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) throw new Error(`Unsupported working time: ${value}`);
  const period = match[3].toUpperCase();
  if (period === 'AM' && hour === 12) hour = 0;
  if (period === 'PM' && hour !== 12) hour += 12;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function workingDayPayload(day: ApiProfessionalCatalogSettings['workingDays'][number]) {
  const weekday = weekdays.get(day.day);
  if (weekday === undefined) throw new Error(`Unsupported working day: ${day.day}`);
  if (!day.enabled) {
    return { ...day, weekday, startsAt: '', endsAt: '' };
  }
  const [startsAt, endsAt] = day.hours.split(/\s+[–-]\s+/).map(time24);
  if (!startsAt || !endsAt) throw new Error(`Unsupported working hours: ${day.hours}`);
  return { ...day, weekday, startsAt, endsAt };
}

export function professionalCatalogPayload(settings: ApiProfessionalCatalogSettings) {
  return {
    ...settings,
    services: settings.services.map((service) => ({
      ...service,
      category: serviceCategorySlugs.get(service.category.trim().toLowerCase()) ?? service.category.trim().toLowerCase(),
    })),
    workingDays: settings.workingDays.map(workingDayPayload),
  };
}

function applicationPayload(input: SubmitProfessionalApplicationStoreInput) {
  return {
    ...input.application,
    ...professionalCatalogPayload(input.application),
  };
}

function isApplication(value: unknown): value is ApiProfessionalApplication {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as JsonRecord;
  return typeof candidate.id === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.submittedAt === 'number' &&
    !!candidate.profile && typeof candidate.profile === 'object' &&
    Array.isArray(candidate.services) &&
    Array.isArray(candidate.workingDays) &&
    Array.isArray(candidate.travelZones);
}

export class SupabaseProfessionalOnboardingRepository
implements
  ProfessionalApplicationCommandStore,
  ProfessionalApplicationReadStore,
  AdminProfessionalApplicationReadStore,
  AdminProfessionalApplicationCommandStore {
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(baseUrl: string, secretKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.secretKey = secretKey;
  }

  async submitApplication(
    input: SubmitProfessionalApplicationStoreInput,
  ): Promise<SubmitProfessionalApplicationResult> {
    const result = await this.rpc('submit_professional_application', {
      p_professional_id: input.userId,
      p_application_reference: input.applicationId,
      p_payload: applicationPayload(input),
      p_submitted_at: input.occurredAt,
    });
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new SupabaseProfessionalOnboardingError(502, 'Supabase returned an invalid application result.');
    }
    const response = result as JsonRecord;
    if (
      response.result === 'not_editable'
    ) {
      return { result: response.result };
    }
    if (response.result !== 'submitted' || !isApplication(response.application)) {
      throw new SupabaseProfessionalOnboardingError(502, 'Supabase returned an invalid submitted application.');
    }
    return { result: 'submitted', application: response.application };
  }

  async getApplication(userId: string): Promise<ApiProfessionalApplication | null> {
    const result = await this.rpc('get_professional_application', {
      p_professional_id: userId,
    });
    if (result === null) return null;
    if (!isApplication(result)) {
      throw new SupabaseProfessionalOnboardingError(502, 'Supabase returned an invalid professional application.');
    }
    return result;
  }

  async listProfessionalApplications(
    status?: ApiProfessionalApplication['status'],
  ): Promise<ReadonlyArray<ApiAdminProfessionalApplication>> {
    const result = await this.rpc('list_professional_applications', {
      p_status: status ?? null,
    });
    if (!Array.isArray(result)) {
      throw new SupabaseProfessionalOnboardingError(502, 'Supabase returned an invalid application list.');
    }
    return result as ApiAdminProfessionalApplication[];
  }

  async reviewApplication(
    input: ReviewProfessionalApplicationStoreInput,
  ): Promise<ApiProfessionalApplication | null> {
    const result = await this.rpc('review_professional_application', {
      p_admin_id: input.adminId,
      p_professional_id: input.professionalId,
      p_action: input.action,
      p_occurred_at: input.occurredAt,
      ...(input.reason ? { p_reason: input.reason } : {}),
    });
    if (result === null) return null;
    if (!isApplication(result)) {
      throw new SupabaseProfessionalOnboardingError(502, 'Supabase returned an invalid reviewed application.');
    }
    return result;
  }

  private async rpc(name: string, body: JsonRecord): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: supabaseServiceHeaders(this.secretKey, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
    } catch {
      throw new SupabaseProfessionalOnboardingError(503, 'Supabase could not be reached.');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => null) as { message?: string } | null;
      throw new SupabaseProfessionalOnboardingError(
        response.status,
        error?.message || 'Supabase rejected the onboarding command.',
      );
    }
    if (response.status === 204) return null;
    return response.json();
  }
}
