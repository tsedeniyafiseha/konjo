import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const PASSWORD_KEY_LENGTH = 64;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

export function isValidPassword(password: string): boolean {
  return password.length >= 10 && password.length <= 128;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, PASSWORD_KEY_LENGTH) as Buffer;
  return `scrypt:${salt.toString('base64url')}:${derivedKey.toString('base64url')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [algorithm, saltValue, hashValue] = storedHash.split(':');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, 'base64url');
  const actual = await scrypt(password, Buffer.from(saltValue, 'base64url'), expected.length) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifySecret(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const actualDigest = createHash('sha256').update(provided).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function createOtpCode(): string {
  return randomInt(0, 10_000).toString().padStart(4, '0');
}

export function hashOtpCode(challengeId: string, code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(`${challengeId}:${code}`).digest('hex');
}

export function verifyOtpCode(challengeId: string, code: string, storedHash: string, pepper: string): boolean {
  const actual = Buffer.from(hashOtpCode(challengeId, code, pepper), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
