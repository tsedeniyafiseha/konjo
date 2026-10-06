import { legalAcceptanceGateway } from '@/bootstrap/client-composition-root';
import { LEGAL_VERSION } from './legal-content';

/**
 * Records that the signed-in person pressed "I understand and agree" for the
 * current Terms & Conditions and Privacy & Security version. Clients call it
 * right after their account is created and signed in; professionals call it
 * when they accept on the review step. It never blocks the flow: the press
 * already happened, and a failed write is logged for a later retry.
 */
export async function recordLegalAcceptance(): Promise<boolean> {
  try {
    await legalAcceptanceGateway.recordAcceptance(LEGAL_VERSION);
    return true;
  } catch (failure) {
    console.warn('[legal] acceptance could not be recorded', failure);
    return false;
  }
}
