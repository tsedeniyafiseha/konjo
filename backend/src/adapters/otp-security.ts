import type { OtpSecurity } from '../application/ports.ts';
import { createOtpCode, hashOtpCode, verifyOtpCode } from '../security.ts';

export function createOtpSecurity(pepper: string): OtpSecurity {
  return {
    createCode: createOtpCode,
    hash: (challengeId, code) => hashOtpCode(challengeId, code, pepper),
    verify: (challengeId, code, storedHash) => verifyOtpCode(challengeId, code, storedHash, pepper),
  };
}
