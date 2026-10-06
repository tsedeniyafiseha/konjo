import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { ApiErrorResponse } from '../../shared/api-contracts';

const LOOPBACK_HOST = /^(https?:\/\/)(127\.0\.0\.1|localhost|0\.0\.0\.0)(?=[:/]|$)/i;

/**
 * Where the Konjo API lives. EXPO_PUBLIC_API_BASE_URL is inlined at bundle
 * time. A native development build runs on an emulator or a phone, where
 * 127.0.0.1 is the device itself, so a loopback address is swapped for the
 * host Metro is served from: 10.0.2.2 on the Android emulator, or the Mac's
 * LAN address on a physical device. Web and release builds use it as given.
 */
function resolveApiBaseUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, '') || null;
  if (!configured || Platform.OS === 'web' || !__DEV__ || !LOOPBACK_HOST.test(configured)) return configured;
  const metroHost = Constants.expoConfig?.hostUri?.split(':')[0]?.trim();
  const deviceHost = metroHost && !/^(127\.0\.0\.1|localhost)$/i.test(metroHost)
    ? metroHost
    : Platform.OS === 'android' ? '10.0.2.2' : null;
  return deviceHost ? configured.replace(LOOPBACK_HOST, `$1${deviceHost}`) : configured;
}

export const apiBaseUrl = resolveApiBaseUrl();
if (__DEV__) console.log(`[api] base url ${apiBaseUrl ?? 'not configured'} (${Platform.OS}, metro ${Constants.expoConfig?.hostUri ?? 'unknown'})`);

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: Record<string, unknown>;
  token?: string;
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== 'object') return false;
  const error = (value as Partial<ApiErrorResponse>).error;
  return Boolean(error && typeof error.code === 'string' && typeof error.message === 'string');
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!apiBaseUrl) throw new ApiClientError(0, 'NOT_CONFIGURED', 'The Konjo API is not configured.');
  // Release builds must never talk to the API over plain HTTP.
  if (!__DEV__ && !/^https:\/\//.test(apiBaseUrl)) {
    throw new ApiClientError(0, 'NOT_CONFIGURED', 'Konjo is not configured for a secure connection.');
  }
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  headers.set('x-client-platform', Platform.OS);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers,
    });
  } catch {
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Unable to reach Konjo. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isApiErrorResponse(payload)) {
      throw new ApiClientError(response.status, payload.error.code, payload.error.message);
    }
    throw new ApiClientError(response.status, 'REQUEST_FAILED', 'Konjo could not complete this request.');
  }
  return payload as T;
}
