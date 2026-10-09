import type { BlockedProfessionalsGateway, DiscoveryGateway } from '@/application/discovery/discovery-controller';
import { discoveryService } from '@/features/discovery/discovery-service';
import { contentModerationService } from '@/features/safety/content-moderation-service';
import { apiBaseUrl } from '@/services/api-client';

export const apiDiscoveryGateway: DiscoveryGateway = {
  configured: Boolean(apiBaseUrl),
  listProfessionals: () => discoveryService.listProfessionals(),
  listReviews: (professionalId) => discoveryService.listReviews(professionalId),
  listCategories: () => discoveryService.listCategories(),
  listPortfolio: (professionalId) => discoveryService.listPortfolio(professionalId),
  getAvailability: (input) => discoveryService.getAvailability(input),
};

export const apiBlockedProfessionalsGateway: BlockedProfessionalsGateway = {
  list: (accessToken) => contentModerationService.listBlockedProfessionals(accessToken),
  block: (professionalId, accessToken) => contentModerationService.blockProfessional(professionalId, accessToken),
};
