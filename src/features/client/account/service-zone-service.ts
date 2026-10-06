import type { ApiServiceZone } from '../../../../shared/api-contracts';
import { apiBaseUrl, apiRequest } from '@/services/api-client';

const developmentZones: ReadonlyArray<ApiServiceZone> = [
  { id: 'bole', label: 'Bole', travelFee: 0 },
  { id: 'cmc', label: 'CMC', travelFee: 150 },
  { id: 'kazanchis', label: 'Kazanchis', travelFee: 150 },
  { id: 'megenagna', label: 'Megenagna', travelFee: 150 },
  { id: 'old-airport', label: 'Old Airport', travelFee: 250 },
  { id: 'ayat', label: 'Ayat', travelFee: 250 },
  { id: 'summit', label: 'Summit', travelFee: 250 },
  { id: 'sarbet', label: 'Sarbet', travelFee: 250 },
];

export async function loadServiceZones(): Promise<ReadonlyArray<ApiServiceZone>> {
  if (!apiBaseUrl) return developmentZones;
  const response = await apiRequest<{ zones: ApiServiceZone[] }>('/v1/zones');
  return response.zones;
}
