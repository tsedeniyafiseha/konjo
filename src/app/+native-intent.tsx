import { normalizeNativeAuthPath } from '@/features/auth/auth-callback-url';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return normalizeNativeAuthPath(path);
}
