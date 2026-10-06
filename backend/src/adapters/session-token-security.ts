import type { SessionTokenSecurity } from '../application/ports.ts';
import { createSessionToken, hashSessionToken } from '../security.ts';

export const sessionTokenSecurity: SessionTokenSecurity = {
  createToken: createSessionToken,
  hashToken: hashSessionToken,
};
