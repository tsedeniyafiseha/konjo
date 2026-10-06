import type { ClientAccountRuntime } from '@/application/client-account/client-account-controller';
import { getZoneTravelFee } from '@/features/booking/data';

export const systemClientAccountRuntime: ClientAccountRuntime = {
  now: () => Date.now(),
  createAddressId: () => `address-${Date.now()}`,
  travelFeeFor: getZoneTravelFee,
};
