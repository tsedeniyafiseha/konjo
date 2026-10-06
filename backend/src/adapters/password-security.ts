import type { PasswordSecurity } from '../application/ports.ts';
import { hashPassword, verifyPassword } from '../security.ts';

export const passwordSecurity: PasswordSecurity = {
  hash: hashPassword,
  verify: verifyPassword,
};
