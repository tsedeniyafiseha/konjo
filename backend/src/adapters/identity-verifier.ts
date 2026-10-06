import { IdentityVerificationError, type IdentityVerifier } from '../application/ports.ts';
import { isValidFaydaIdentifier } from '../../../shared/fayda-identifier.ts';

interface IdentityVerifierConfig {
  mode: 'development' | 'provider';
  verificationUrl: string | null;
  verificationToken: string | null;
}

export function createIdentityVerifier(config: IdentityVerifierConfig): IdentityVerifier {
  return {
    async verify(identifier) {
      if (!isValidFaydaIdentifier(identifier)) {
        throw new IdentityVerificationError('Enter a valid 12-digit FIN or 16-digit FAN/FCN.');
      }
      if (config.mode === 'development') return { lastFour: identifier.slice(-4) };
      if (!config.verificationUrl || !config.verificationToken) {
        throw new IdentityVerificationError('The Fayda verification provider is not configured.');
      }

      let response: Response;
      try {
        response = await fetch(config.verificationUrl, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${config.verificationToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ identifier }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        throw new IdentityVerificationError('The Fayda verification provider could not be reached.');
      }
      if (!response.ok) {
        throw new IdentityVerificationError('The Fayda identity could not be verified.');
      }
      const result: unknown = await response.json().catch(() => null);
      if (!result || typeof result !== 'object' || (result as { verified?: unknown }).verified !== true) {
        throw new IdentityVerificationError('The Fayda identity could not be verified.');
      }
      return { lastFour: identifier.slice(-4) };
    },
  };
}
