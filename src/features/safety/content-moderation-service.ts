import type {
  ApiContentReport,
  ApiContentReportReason,
  ApiContentReportTarget,
} from '../../../shared/api-contracts';
import { apiRequest } from '@/services/api-client';

export const contentModerationService = {
  async report(input: {
    targetType: ApiContentReportTarget;
    targetId: string;
    reason: ApiContentReportReason;
    details: string;
  }, token: string): Promise<ApiContentReport> {
    const response = await apiRequest<{ contentReport: ApiContentReport }>(
      '/v1/content-reports',
      { method: 'POST', token, body: input },
    );
    return response.contentReport;
  },

  async listBlockedProfessionals(token: string): Promise<readonly string[]> {
    const response = await apiRequest<{ professionalIds: string[] }>(
      '/v1/client/blocked-professionals',
      { token },
    );
    return response.professionalIds;
  },

  async blockProfessional(professionalId: string, token: string): Promise<void> {
    await apiRequest<void>(
      `/v1/client/blocked-professionals/${encodeURIComponent(professionalId)}`,
      { method: 'PUT', token },
    );
  },
};
