import type { ApiProfessionalApplication } from '../../../../shared/api-contracts';
import { apiBaseUrl, ApiClientError, apiRequest } from '@/services/api-client';
import {
  isProfessionalRegistrationComplete,
  type ProfessionalApplication,
  type ProfessionalRegistrationDraft,
  type ProfessionalSpecialty,
  emptyPayoutMethodDraft,
} from '@/application/professional-registration/professional-registration-contracts';

export class ProfessionalRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfessionalRegistrationError';
  }
}

export interface ProfessionalRegistrationService {
  getApplication(accessToken?: string): Promise<ProfessionalApplication | null>;
  submitApplication(draft: ProfessionalRegistrationDraft, accessToken?: string): Promise<ProfessionalApplication>;
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const developmentService: ProfessionalRegistrationService = {
  async getApplication() {
    return null;
  },
  async submitApplication(draft) {
    await wait(750);
    if (!isProfessionalRegistrationComplete(draft)) {
      throw new ProfessionalRegistrationError('Complete every required registration step before submitting.');
    }
    return {
      ...draft,
      id: `KJ-PRO-${Date.now().toString().slice(-6)}`,
      status: 'pending',
      submittedAt: Date.now(),
    };
  },
};

function applicationFromApi(application: ApiProfessionalApplication): ProfessionalApplication {
  return {
    ...application,
    profile: {
      ...application.profile,
      specialty: application.profile.specialty as ProfessionalSpecialty,
      // The API sends the normalised method (or null for legacy accounts); the draft keeps editable strings.
      payoutMethod: {
        ...emptyPayoutMethodDraft,
        ...(application.profile.payoutMethod ?? {}),
        bankName: application.profile.payoutMethod?.bankName ?? '',
      },
    },
  };
}

function registrationError(error: unknown, fallback: string): ProfessionalRegistrationError {
  if (error instanceof ApiClientError) return new ProfessionalRegistrationError(error.message);
  return new ProfessionalRegistrationError(fallback);
}

const apiService: ProfessionalRegistrationService = {
  async getApplication(accessToken) {
    if (!accessToken) throw new ProfessionalRegistrationError('Your session has expired. Please sign in again.');
    try {
      const response = await apiRequest<{ application: ApiProfessionalApplication | null }>(
        '/v1/professional/application',
        { token: accessToken },
      );
      return response.application ? applicationFromApi(response.application) : null;
    } catch (error) {
      throw registrationError(error, 'We could not restore your professional application.');
    }
  },
  async submitApplication(draft, accessToken) {
    if (!accessToken) throw new ProfessionalRegistrationError('Your session has expired. Please sign in again.');
    if (!isProfessionalRegistrationComplete(draft)) {
      throw new ProfessionalRegistrationError('Complete every required registration step before submitting.');
    }
    try {
      const response = await apiRequest<{ application: ApiProfessionalApplication }>(
        '/v1/professional/application',
        { method: 'PUT', token: accessToken, body: { ...draft } },
      );
      return applicationFromApi(response.application);
    } catch (error) {
      throw registrationError(error, 'We could not submit your professional application.');
    }
  },
};

const unavailableService: ProfessionalRegistrationService = {
  async getApplication() {
    throw new ProfessionalRegistrationError('Professional applications are temporarily unavailable.');
  },
  async submitApplication() {
    throw new ProfessionalRegistrationError('Professional applications are temporarily unavailable.');
  },
};

export const professionalRegistrationService = apiBaseUrl
  ? apiService
  : __DEV__ ? developmentService : unavailableService;
