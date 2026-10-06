import type {
  ProfessionalRegistrationGateway,
  ProfessionalRegistrationRuntime,
} from '@/application/professional-registration/professional-registration-controller';
import { professionalRegistrationService } from './professional-registration-service';

export const apiProfessionalRegistrationGateway: ProfessionalRegistrationGateway = {
  loadApplication: (accessToken) => (
    professionalRegistrationService.getApplication(accessToken)
  ),
  submitApplication: (draft, accessToken) => (
    professionalRegistrationService.submitApplication(draft, accessToken)
  ),
};

let serviceSequence = 0;

export const systemProfessionalRegistrationRuntime: ProfessionalRegistrationRuntime = {
  createServiceId() {
    serviceSequence += 1;
    return `service-${Date.now()}-${serviceSequence}`;
  },
};
