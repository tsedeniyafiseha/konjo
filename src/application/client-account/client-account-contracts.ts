import type { AuthSession } from '../auth/session-controller';
import type { BookingAddress } from '../booking/booking-contracts';

export type ClientPreferredLanguage = 'en' | 'am';

export interface ClientProfile {
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  preferredLanguage: ClientPreferredLanguage;
}

export interface ClientAccount {
  profile: ClientProfile;
  addresses: readonly BookingAddress[];
  defaultAddressId: string | null;
  completedAt: number;
}

export interface ClientOnboardingDraft {
  fullName: string;
  email: string;
  phoneNumber: string;
  preferredLanguage: ClientPreferredLanguage;
}

export interface ClientAddressInput {
  label: string;
  zone: string;
  detail: string;
  latitude?: number | null;
  longitude?: number | null;
}

export function createClientDraft(
  session: AuthSession | null,
  preferredLanguage: ClientPreferredLanguage = 'en',
): ClientOnboardingDraft {
  return {
    fullName: session?.displayName ?? '',
    email: session?.email ?? '',
    phoneNumber: session?.phoneNumber ?? '',
    preferredLanguage,
  };
}

export function isClientProfileComplete(draft: ClientOnboardingDraft): boolean {
  const emailValid = draft.email.length === 0 || /^\S+@\S+\.\S+$/.test(draft.email.trim());
  return draft.fullName.trim().length >= 2 && emailValid;
}
