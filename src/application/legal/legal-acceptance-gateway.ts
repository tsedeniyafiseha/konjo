/** Records that the signed-in person accepted the legal documents at a given version. */
export interface LegalAcceptanceGateway {
  recordAcceptance(version: string): Promise<void>;
}
