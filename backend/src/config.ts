import { resolve } from 'node:path';

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function operationalLogLevel(value: string | undefined): 'info' | 'error' | 'silent' {
  return value === 'error' || value === 'silent' ? value : 'info';
}

function paymentMode(value: string | undefined): 'cash_only' | 'chapa' {
  return value === 'cash_only' ? 'cash_only' : 'chapa';
}

const deploymentEnvironment = process.env.KONJO_ENVIRONMENT?.trim().toLowerCase();
const apiHost = process.env.KONJO_API_HOST?.trim() || '127.0.0.1';
const apiPort = positiveInteger(process.env.KONJO_API_PORT || process.env.PORT, 4000);
const renderExternalUrl = process.env.RENDER_EXTERNAL_URL?.trim().replace(/\/$/, '') || null;

export const backendConfig = {
  // An explicit Konjo environment takes precedence over a hosting provider's
  // NODE_ENV. This lets the Render preview use test integrations while the
  // production profile still enforces live credentials and HTTPS URLs.
  production: deploymentEnvironment === 'production' ||
    (!deploymentEnvironment && process.env.NODE_ENV === 'production'),
  // Number of reverse-proxy hops in front of the API; 0 means the socket
  // address is the client. Used to read the right X-Forwarded-For entry.
  trustedProxyHops: Math.max(0, Math.min(10, Number.parseInt(process.env.KONJO_TRUSTED_PROXY_HOPS ?? '0', 10) || 0)),
  host: apiHost,
  port: apiPort,
  databasePath: resolve(process.env.KONJO_DATABASE_PATH?.trim() || 'backend/data/konjo.db'),
  allowedOrigins: new Set(
    (process.env.KONJO_ALLOWED_ORIGINS || 'http://localhost:8081,http://localhost:8082')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ),
  sessionLifetimeMs: positiveInteger(process.env.KONJO_SESSION_DAYS, 30) * 24 * 60 * 60 * 1000,
  authMode: process.env.KONJO_AUTH_MODE === 'provider' ? 'provider' : 'development',
  authPepper: process.env.KONJO_AUTH_PEPPER?.trim() || 'konjo-local-development-pepper-change-before-deployment',
  otpDeliveryUrl: process.env.KONJO_OTP_DELIVERY_URL?.trim() || null,
  otpDeliveryToken: process.env.KONJO_OTP_DELIVERY_TOKEN?.trim() || null,
  emailDeliveryUrl: process.env.KONJO_EMAIL_DELIVERY_URL?.trim() || null,
  emailDeliveryToken: process.env.KONJO_EMAIL_DELIVERY_TOKEN?.trim() || null,
  faydaVerificationUrl: process.env.KONJO_FAYDA_VERIFICATION_URL?.trim() || null,
  faydaVerificationToken: process.env.KONJO_FAYDA_VERIFICATION_TOKEN?.trim() || null,
  paymentWebhookSecret: process.env.KONJO_PAYMENT_WEBHOOK_SECRET?.trim() || 'konjo-local-payment-webhook-secret',
  paymentMode: paymentMode(process.env.KONJO_PAYMENT_MODE),
  chapaSecretKey: process.env.KONJO_CHAPA_SECRET_KEY?.trim() || null,
  chapaPublicKey: process.env.KONJO_CHAPA_PUBLIC_KEY?.trim() || null,
  chapaEncryptionKey: process.env.KONJO_CHAPA_ENCRYPTION_KEY?.trim() || null,
  // Public origins used in links handed to clients: the API (sandbox checkout,
  // provider webhooks) and the web app (return after checkout).
  publicApiUrl: process.env.KONJO_PUBLIC_API_URL?.trim().replace(/\/$/, '')
    || renderExternalUrl
    || `http://${apiHost}:${apiPort}`,
  publicWebUrl: process.env.KONJO_PUBLIC_WEB_URL?.trim().replace(/\/$/, '')
    || renderExternalUrl
    || 'http://localhost:8081',
  // Serves a local "pay now" page for sandbox intents so the whole booking flow
  // can be exercised without a Chapa account. Never enable in production.
  paymentSandboxCheckout: process.env.KONJO_PAYMENT_SANDBOX_CHECKOUT === 'true'
    || (process.env.KONJO_AUTH_MODE !== 'provider' && process.env.KONJO_PAYMENT_SANDBOX_CHECKOUT !== 'false'),
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN?.trim() || null,
  notificationDeliveryUrl: process.env.KONJO_NOTIFICATION_DELIVERY_URL?.trim() || null,
  notificationDeliveryToken: process.env.KONJO_NOTIFICATION_DELIVERY_TOKEN?.trim() || null,
  smsEthiopiaApiKey: process.env.SMSETHIOPIA_API_KEY?.trim() || null,
  professionalMockOtpEnabled: process.env.KONJO_ENABLE_PROFESSIONAL_MOCK_OTP === 'true',
  workerToken: process.env.KONJO_WORKER_TOKEN?.trim() || null,
  inProcessJobs: process.env.KONJO_IN_PROCESS_JOBS !== 'false',
  logLevel: operationalLogLevel(process.env.KONJO_LOG_LEVEL),
  developmentAdminEmail: process.env.KONJO_ADMIN_EMAIL?.trim().toLowerCase() || 'admin@konjo.local',
  developmentAdminPassword: process.env.KONJO_ADMIN_PASSWORD || 'Konjo-admin-test-2026',
  passwordResetUrl: process.env.KONJO_PASSWORD_RESET_URL?.trim() || 'http://localhost:8081/client-email?mode=reset',
  supabaseUrl: process.env.KONJO_SUPABASE_URL?.trim().replace(/\/$/, '') || null,
  supabasePublishableKey: process.env.KONJO_SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
    || null,
  // Server-only alias used by the existing Supabase deployment. Neither name
  // is Expo-public, so the privileged key stays out of the client bundle.
  supabaseSecretKey: process.env.KONJO_SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null,
  otpLifetimeMs: 5 * 60 * 1000,
  otpRequestWindowMs: 10 * 60 * 1000,
  otpRequestsPerWindow: 3,
  otpAttempts: 5,
  passwordResetLifetimeMs: 30 * 60 * 1000,
  rateLimitPerMinute: positiveInteger(process.env.KONJO_RATE_LIMIT_PER_MINUTE, 300),
  /** Per-address budget for /v1/auth/*: sign-in, OTP and reset attempts. */
  authRateLimitPerMinute: positiveInteger(process.env.KONJO_AUTH_RATE_LIMIT_PER_MINUTE, 30),
  requestBodyLimitBytes: 64 * 1024,
  uploadBodyLimitBytes: 20 * 1024 * 1024,
  applicationUploadPath: resolve(process.env.KONJO_APPLICATION_UPLOAD_PATH?.trim() || 'backend/data/applications'),
  contactEmail: process.env.KONJO_CONTACT_EMAIL?.trim() || 'Info@Konjo.com',
  careersEmail: process.env.KONJO_CAREERS_EMAIL?.trim() || 'HR@Konjo.com',
  founderEmail: process.env.KONJO_FOUNDER_EMAIL?.trim() || 'Hanna@Konjo.com',
} as const;

export type BackendConfig = typeof backendConfig;
