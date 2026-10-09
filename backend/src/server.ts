import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  ApiAccountRole,
  ApiBookingPaymentMethod,
  ApiBookingStatus,
  ApiClientPreferredLanguage,
  ApiContentReportReason,
  ApiContentReportTarget,
  ApiDevicePlatform,
  ApiErrorResponse,
  ApiNotificationPreferences,
  ApiPaymentStatus,
  AuthApiResponse,
  ApiUser,
} from '../../shared/api-contracts.ts';
import { isValidFaydaIdentifier } from '../../shared/fayda-identifier.ts';
import { normalizePayoutMethod } from '../../shared/payout-method.ts';
import {
  PROFESSIONAL_MOCK_OTP_CHALLENGE_PREFIX,
  PROFESSIONAL_MOCK_OTP_CODE,
  PROFESSIONAL_MOCK_OTP_CODE_LENGTH,
  PROFESSIONAL_MOCK_OTP_LIFETIME_MS,
} from '../../shared/mock-professional-otp.ts';
import { InvalidAddressQueryError } from './application/search-addresses.ts';
import { GeocodingError, MockProfessionalRegistrationError } from './application/ports.ts';
import type { ProfessionalApplicationInput } from './application/contracts.ts';
import { IdentityVerificationError, OtpDeliveryError, PaymentProviderError } from './application/ports.ts';
import { OtpRequestRateLimitedError } from './application/request-otp.ts';
import { AccessTokenAuthenticationUnavailableError } from './application/authenticate-access-token.ts';
import type { BackendDependencies } from './bootstrap/backend-dependencies.ts';
import { sendEmail } from './email.ts';
import { parseMultipart } from './multipart.ts';
import {
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  verifySecret,
} from './security.ts';

type JsonRecord = Record<string, unknown>;

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

const backendDependencyKey = Symbol.for('konjo.backend.dependencies');
const injectedDependencies = (globalThis as unknown as { [backendDependencyKey]: BackendDependencies })[backendDependencyKey];
const nodeCompositionPath = './bootstrap/' + 'composition-root.ts';
const dependencies = injectedDependencies ??
  (await import(nodeCompositionPath) as { createBackendDependencies(): BackendDependencies }).createBackendDependencies();

const {
  accessTokenAuthenticator,
  accounts,
  adminExportAudit,
  adminCatalog,
  adminPayouts,
  adminProfessionals,
  adminReads,
  addressSearch,
  backgroundJobs,
  cancelBooking,
  archiveBooking,
  clientAccounts,
  clientAddresses,
  clientPreferences,
  clientReads,
  config,
  createBooking,
  database,
  domainEventDeadLetters,
  initiateBookingPayment,
  logger,
  marketplaceReads,
  passwordResets,
  processPaymentWebhook,
  verifyBookingPayment,
  paymentKeyMode,
  professionalPayouts,
  professionalMockAuth,
  professionalPortfolio,
  professionalReads,
  professionalSelfService,
  requestOtp,
  readiness,
  rescheduleBooking,
  sessions,
  submitBookingReview,
  submitProfessionalApplication,
  trustSafety,
  transitionProfessionalBooking,
  bookingTracking,
  verifyIdentity,
  verifyOtp,
  websiteApplicationFiles,
} = dependencies;
const requestsByAddress = new Map<string, { count: number; resetsAt: number }>();
const publicSubmissionsByAddress = new Map<string, { count: number; resetsAt: number }>();
const professionalMockOtpChallenges = new Map<string, { phoneNumber: string; expiresAt: number }>();
/** Hashes of bearer tokens that resolved to a user; only these earn a per-session budget. */
const validatedTokenHashes = new Set<string>();
const MAX_TRACKED_KEYS = 20_000;
const requestIdentities = new WeakMap<IncomingMessage, ApiUser | null>();
const websiteDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../website');
const websiteFiles = new Map<string, { path: string; contentType: string; cache: string }>([
  ['/', { path: 'home.html', contentType: 'text/html; charset=utf-8', cache: 'no-cache' }],
  ['/privacy', { path: 'privacy.html', contentType: 'text/html; charset=utf-8', cache: 'no-cache' }],
  ['/terms', { path: 'terms.html', contentType: 'text/html; charset=utf-8', cache: 'no-cache' }],
  ['/delete-account', { path: 'delete-account.html', contentType: 'text/html; charset=utf-8', cache: 'no-cache' }],
  ['/site.css', { path: 'site.css', contentType: 'text/css; charset=utf-8', cache: 'public, max-age=3600' }],
  ['/site.js', { path: 'site.js', contentType: 'text/javascript; charset=utf-8', cache: 'public, max-age=3600' }],
  ['/assets/konjo-brand.png', { path: 'assets/konjo-brand.png', contentType: 'image/png', cache: 'public, max-age=86400' }],
  ['/assets/konjo-service.jpg', { path: 'assets/konjo-service.jpg', contentType: 'image/jpeg', cache: 'public, max-age=86400' }],
  ['/assets/fonts/bodoni-moda-600.ttf', { path: 'assets/fonts/bodoni-moda-600.ttf', contentType: 'font/ttf', cache: 'public, max-age=31536000, immutable' }],
  ['/assets/fonts/plus-jakarta-sans-400.ttf', { path: 'assets/fonts/plus-jakarta-sans-400.ttf', contentType: 'font/ttf', cache: 'public, max-age=31536000, immutable' }],
  ['/assets/fonts/plus-jakarta-sans-500.ttf', { path: 'assets/fonts/plus-jakarta-sans-500.ttf', contentType: 'font/ttf', cache: 'public, max-age=31536000, immutable' }],
  ['/assets/fonts/plus-jakarta-sans-600.ttf', { path: 'assets/fonts/plus-jakarta-sans-600.ttf', contentType: 'font/ttf', cache: 'public, max-age=31536000, immutable' }],
]);

function requestId(request: IncomingMessage): string {
  const provided = request.headers['x-request-id'];
  return typeof provided === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(provided)
    ? provided
    : randomUUID();
}

function setSecurityHeaders(response: ServerResponse) {
  response.setHeader('Cache-Control', 'no-store');
  if (config.production) response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
}

function applyCors(request: IncomingMessage, response: ServerResponse) {
  const origin = request.headers.origin;
  if (!origin) return;
  try {
    if (new URL(origin).host === request.headers.host) return;
  } catch {
    throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'This application origin is not allowed.');
  }
  if (!config.allowedOrigins.has(origin)) {
    throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'This application origin is not allowed.');
  }
  // A web client and API commonly use different hosts (including localhost vs
  // 127.0.0.1 in development). CORS is the authorization boundary here; a
  // same-site CORP header would make the browser discard an otherwise allowed
  // response before the app can read it.
  response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id, X-Client-Platform');
  response.setHeader('Access-Control-Allow-Methods', 'DELETE, GET, OPTIONS, PATCH, POST, PUT');
  response.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
  response.setHeader('Access-Control-Max-Age', '600');
  response.setHeader('Vary', 'Origin');
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, status: number, html: string) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  // The sandbox checkout page is a plain form: inline styles only, no scripts.
  response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  response.end(html);
}

async function sendWebsiteFile(response: ServerResponse, pathname: string): Promise<boolean> {
  const asset = websiteFiles.get(pathname);
  if (!asset) return false;
  const content = await readFile(resolve(websiteDirectory, asset.path));
  response.statusCode = 200;
  response.setHeader('Content-Type', asset.contentType);
  response.setHeader('Cache-Control', asset.cache);
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self'; object-src 'none'; script-src 'self'; style-src 'self'",
  );
  response.end(content);
  return true;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character));
}

function optionalNumberField(body: JsonRecord, field: string): number | null {
  const value = body[field];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(400, 'INVALID_INPUT', `${field} is not valid.`);
  }
  return value;
}

/** Chapa v2 webhook events that settle a payment; everything else is acknowledged and ignored. */
function chapaEventOutcome(event: string): 'captured' | 'failed' | 'ignored' {
  if (event === 'payment.success') return 'captured';
  if (event === 'payment.failed' || event === 'payment.cancelled') return 'failed';
  return 'ignored';
}

/** Chapa v1 webhooks carried only a status. */
function chapaStatusOutcome(status: string | null | undefined): 'captured' | 'failed' | null {
  const value = (status ?? '').toLowerCase();
  return value === 'success' ? 'captured' : value === 'failed' ? 'failed' : null;
}

/** The signed-in client as the hosted checkout presents them. */
function paymentCustomer(user: { fullName: string; email: string | null; phoneNumber: string | null }) {
  const parts = user.fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? 'Konjo';
  const lastName = parts.slice(1).join(' ') || 'Client';
  return { firstName, lastName, email: user.email, phoneNumber: user.phoneNumber };
}

function optionalTextField(body: JsonRecord, field: string, maxLength: number): string | null {
  const value = body[field];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new HttpError(400, 'INVALID_INPUT', `${field} is not valid.`);
  }
  return value;
}

/** Both coordinates or neither; each within range. */
function coordinateFields(body: JsonRecord): { latitude: number | null; longitude: number | null } {
  const latitude = optionalNumberField(body, 'latitude');
  const longitude = optionalNumberField(body, 'longitude');
  if ((latitude === null) !== (longitude === null)) {
    throw new HttpError(400, 'INVALID_INPUT', 'latitude and longitude must be provided together.');
  }
  if (latitude !== null && longitude !== null && (Math.abs(latitude) > 90 || Math.abs(longitude) > 180)) {
    throw new HttpError(400, 'INVALID_INPUT', 'The coordinates are out of range.');
  }
  return { latitude, longitude };
}

function csvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // A leading =, +, -, @ or control character would run as a formula in a spreadsheet.
  const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sendCsv(response: ServerResponse, filename: string, rows: ReadonlyArray<ReadonlyArray<unknown>>) {
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  response.end(rows.map((row) => row.map(csvCell).join(',')).join('\n'));
}

function errorBody(code: string, message: string): ApiErrorResponse {
  return { error: { code, message } };
}

async function readRawJson(request: IncomingMessage): Promise<{ body: JsonRecord; rawBody: string }> {
  const contentType = request.headers['content-type'];
  if (!contentType?.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the request as application/json.');
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > config.requestBodyLimitBytes) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
    }
    chunks.push(buffer);
  }

  try {
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Object expected');
    return { body: parsed as JsonRecord, rawBody };
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'The request body is not valid JSON.');
  }
}

async function readJson(request: IncomingMessage): Promise<JsonRecord> {
  return (await readRawJson(request)).body;
}

async function readBody(request: IncomingMessage, maximumBytes: number): Promise<Buffer> {
  const declaredLength = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBytes) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function publicFormField(fields: Readonly<Record<string, string>>, name: string, maximumLength: number): string {
  const value = fields[name]?.trim();
  if (!value || value.length > maximumLength || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new HttpError(400, 'INVALID_INPUT', `${name} is not valid.`);
  }
  return value;
}

/** The caller's address, honouring X-Forwarded-For only for the configured number of trusted proxy hops. */
function clientAddress(request: IncomingMessage): string {
  const socketAddress = request.socket.remoteAddress ?? 'unknown';
  if (config.trustedProxyHops === 0) return socketAddress;
  const forwarded = request.headers['x-forwarded-for'];
  const chain = (Array.isArray(forwarded) ? forwarded.join(',') : forwarded ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const candidate = chain[chain.length - config.trustedProxyHops];
  return candidate && candidate.length <= 64 ? candidate : socketAddress;
}

function bumpWindow(bucket: Map<string, { count: number; resetsAt: number }>, key: string, windowMs: number, limit: number, now: number): boolean {
  if (bucket.size > MAX_TRACKED_KEYS) {
    for (const [entryKey, entry] of bucket) if (entry.resetsAt <= now) bucket.delete(entryKey);
    if (bucket.size > MAX_TRACKED_KEYS) bucket.clear();
  }
  const current = bucket.get(key);
  if (!current || current.resetsAt <= now) {
    bucket.set(key, { count: 1, resetsAt: now + windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function enforcePublicSubmissionRateLimit(request: IncomingMessage): void {
  if (!bumpWindow(publicSubmissionsByAddress, clientAddress(request), 60 * 60 * 1000, 5, Date.now())) {
    throw new HttpError(429, 'RATE_LIMITED', 'Too many submissions. Please wait and try again.');
  }
}

/** Like readJson, but a request without a body is treated as an empty object. */
async function readOptionalJson(request: IncomingMessage): Promise<JsonRecord> {
  const contentLength = Number(request.headers['content-length'] ?? 0);
  const hasBody = Boolean(request.headers['transfer-encoding']) || (Number.isFinite(contentLength) && contentLength > 0);
  return hasBody ? readJson(request) : {};
}

function textField(body: JsonRecord, field: string, options?: { optional?: boolean; maxLength?: number }): string | null {
  const value = body[field];
  if (options?.optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'INVALID_INPUT', `${field} is required.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > (options?.maxLength ?? 200)) {
    throw new HttpError(400, 'INVALID_INPUT', `${field} is not valid.`);
  }
  return trimmed;
}

function isBookingPaymentMethod(value: string | null): value is ApiBookingPaymentMethod {
  return value === 'telebirr' || value === 'cbe' || value === 'card' || value === 'cash';
}

function isWebhookPaymentStatus(value: string | null): value is Extract<ApiPaymentStatus, 'authorized' | 'captured' | 'failed'> {
  return value === 'authorized' || value === 'captured' || value === 'failed';
}

function isBookableDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= new Date().toISOString().slice(0, 10);
}

function isAccountRole(value: string | null): value is Exclude<ApiAccountRole, 'admin'> {
  return value === 'client' || value === 'professional';
}

function isClientPreferredLanguage(value: string | null): value is ApiClientPreferredLanguage {
  return value === 'en' || value === 'am';
}

function isDevicePlatform(value: string | null): value is ApiDevicePlatform {
  return value === 'ios' || value === 'android' || value === 'web';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function notificationPreferences(body: JsonRecord): ApiNotificationPreferences {
  const bookingUpdates = body.bookingUpdates;
  const promotions = body.promotions;
  const smsReminders = body.smsReminders;
  if (
    typeof bookingUpdates !== 'boolean' ||
    typeof promotions !== 'boolean' ||
    typeof smsReminders !== 'boolean'
  ) {
    throw new HttpError(400, 'INVALID_INPUT', 'All notification preferences must be true or false.');
  }
  return { bookingUpdates, promotions, smsReminders };
}

function recordField(body: JsonRecord, field: string): JsonRecord {
  const value = body[field];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'INVALID_INPUT', `${field} is required.`);
  }
  return value as JsonRecord;
}

function professionalApplicationInput(body: JsonRecord): ProfessionalApplicationInput {
  const preferredLanguage = textField(body, 'preferredLanguage', { maxLength: 2 });
  if (preferredLanguage !== 'am' && preferredLanguage !== 'om' && preferredLanguage !== 'en') {
    throw new HttpError(400, 'INVALID_INPUT', 'Choose a supported application language.');
  }
  const profile = recordField(body, 'profile');
  const legalName = textField(profile, 'legalName', { maxLength: 120 });
  const displayName = textField(profile, 'displayName', { maxLength: 80 });
  const email = textField(profile, 'email', { optional: true, maxLength: 254 }) ?? '';
  const specialty = textField(profile, 'specialty', { maxLength: 40 });
  const bio = textField(profile, 'bio', { maxLength: 280 });
  const baseZone = textField(profile, 'baseZone', { maxLength: 80 });
  const yearsExperience = Number(profile.yearsExperience);
  const portfolioCount = profile.portfolioCount;
  const educationLevel = profile.educationLevel;
  const gender = profile.gender;
  const languageSkills = profile.languageSkills;
  const payoutMethod = normalizePayoutMethod(profile.payoutMethod);
  const validSpecialties = new Set(['hair', 'braids', 'nails', 'makeup', 'barber', 'massage']);
  const validEducationLevels = new Set(['secondary', 'certificate', 'diploma', 'bachelors', 'postgraduate']);
  const validGenders = new Set(['female', 'male', 'unspecified']);
  const validLanguages = new Set(['Amharic', 'Afaan Oromo', 'Tigrinya', 'Somali', 'English', 'Arabic', 'French', 'Italian']);
  const validProficiencies = new Set(['basic', 'conversational', 'fluent', 'native']);
  if (
    !legalName || legalName.length < 3 ||
    !displayName || displayName.length < 2 ||
    (email && !isValidEmail(email)) ||
    !specialty || !validSpecialties.has(specialty) ||
    !bio || bio.length < 30 ||
    !baseZone ||
    !Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > 60 ||
    typeof educationLevel !== 'string' || !validEducationLevels.has(educationLevel) ||
    typeof gender !== 'string' || !validGenders.has(gender) ||
    !payoutMethod ||
    typeof portfolioCount !== 'number' || !Number.isInteger(portfolioCount) || portfolioCount < 0 ||
    !Array.isArray(languageSkills) || languageSkills.length === 0 ||
    !languageSkills.every((skill) => {
      if (!skill || typeof skill !== 'object' || Array.isArray(skill)) return false;
      const candidate = skill as JsonRecord;
      return typeof candidate.language === 'string' && validLanguages.has(candidate.language) &&
        typeof candidate.proficiency === 'string' && validProficiencies.has(candidate.proficiency);
    }) ||
    new Set(languageSkills.map((skill) => (skill as JsonRecord).language)).size !== languageSkills.length
  ) {
    throw new HttpError(400, 'INVALID_INPUT', 'Complete the professional profile and experience details.');
  }

  if (!Array.isArray(body.services) || body.services.length === 0 || body.services.length > 20) {
    throw new HttpError(400, 'INVALID_INPUT', 'Add between one and twenty services.');
  }
  const services = body.services.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new HttpError(400, 'INVALID_INPUT', `Service ${index + 1} is not valid.`);
    }
    const service = value as JsonRecord;
    const id = textField(service, 'id', { maxLength: 80 });
    const category = textField(service, 'category', { maxLength: 80 });
    const name = textField(service, 'name', { maxLength: 120 });
    const note = textField(service, 'note', { optional: true, maxLength: 500 }) ?? '';
    const durationMinutes = service.durationMinutes;
    const price = service.price;
    const popular = service.popular ?? false;
    if (
      !id || !category || !name || name.length < 2 ||
      typeof durationMinutes !== 'number' || !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 720 ||
      typeof price !== 'number' || !Number.isInteger(price) || price <= 0 || price > 1_000_000 ||
      typeof popular !== 'boolean'
    ) {
      throw new HttpError(400, 'INVALID_INPUT', `Service ${index + 1} is not valid.`);
    }
    return { id, category, name, durationMinutes, price, note, popular };
  });
  if (new Set(services.map((service) => service.id)).size !== services.length) {
    throw new HttpError(400, 'INVALID_INPUT', 'Every service must have a unique identifier.');
  }

  if (!Array.isArray(body.workingDays) || body.workingDays.length === 0 || body.workingDays.length > 7) {
    throw new HttpError(400, 'INVALID_INPUT', 'Add a valid weekly schedule.');
  }
  const workingDays = body.workingDays.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new HttpError(400, 'INVALID_INPUT', 'A working day is not valid.');
    }
    const dayValue = value as JsonRecord;
    const day = textField(dayValue, 'day', { maxLength: 20 });
    const hours = textField(dayValue, 'hours', { maxLength: 60 });
    const enabled = dayValue.enabled;
    if (!day || !hours || typeof enabled !== 'boolean') {
      throw new HttpError(400, 'INVALID_INPUT', 'A working day is not valid.');
    }
    return { day, hours, enabled };
  });
  if (new Set(workingDays.map((day) => day.day)).size !== workingDays.length) {
    throw new HttpError(400, 'INVALID_INPUT', 'Every working day must be unique.');
  }

  if (!Array.isArray(body.travelZones) || body.travelZones.length === 0 || body.travelZones.length > 20) {
    throw new HttpError(400, 'INVALID_INPUT', 'Add valid travel zones.');
  }
  const travelZones = body.travelZones.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new HttpError(400, 'INVALID_INPUT', 'A travel zone is not valid.');
    }
    const zone = value as JsonRecord;
    const id = textField(zone, 'id', { maxLength: 80 });
    const label = textField(zone, 'label', { maxLength: 80 });
    const active = zone.active;
    if (!id || !label || typeof active !== 'boolean') {
      throw new HttpError(400, 'INVALID_INPUT', 'A travel zone is not valid.');
    }
    return { id, label, active };
  });
  if (new Set(travelZones.map((zone) => zone.id)).size !== travelZones.length) {
    throw new HttpError(400, 'INVALID_INPUT', 'Every travel zone must be unique.');
  }
  if (!workingDays.some((day) => day.enabled) || !travelZones.some((zone) => zone.active)) {
    throw new HttpError(400, 'INVALID_INPUT', 'Enable at least one working day and travel zone.');
  }
  if (typeof body.sameDayBookings !== 'boolean' || body.termsAccepted !== true) {
    throw new HttpError(400, 'INVALID_INPUT', 'Accept the terms and choose a booking preference.');
  }

  return {
    preferredLanguage,
    profile: {
      legalName,
      displayName,
      email,
      specialty,
      bio,
      yearsExperience,
      educationLevel: educationLevel as ProfessionalApplicationInput['profile']['educationLevel'],
      gender: gender as ProfessionalApplicationInput['profile']['gender'],
      payoutMethod,
      languageSkills: languageSkills as unknown as ProfessionalApplicationInput['profile']['languageSkills'],
      baseZone,
      portfolioCount,
    },
    services,
    workingDays,
    travelZones,
    sameDayBookings: body.sameDayBookings,
    termsAccepted: true,
  };
}

function isEthiopianPhoneNumber(value: string | null): value is string {
  return Boolean(value && /^\+251[79]\d{8}$/.test(value));
}

function enforceRateLimit(request: IncomingMessage) {
  const path = (request.url ?? '/').split('?')[0];
  if (path === '/health' || path === '/ready') return;
  const now = Date.now();
  const address = clientAddress(request);
  // Signed-in sessions are limited individually so several devices behind one
  // address (an emulator, an office network) do not share a single budget —
  // but only once the token has actually resolved to a user. An unknown token
  // shares the address budget, so guessing tokens or credentials cannot mint
  // fresh budgets.
  const authorization = request.headers.authorization;
  const token = typeof authorization === 'string' && authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : '';
  const tokenHash = token ? createHash('sha256').update(token).digest('hex') : '';
  const key = tokenHash && validatedTokenHashes.has(tokenHash) ? `session:${tokenHash}` : `address:${address}`;
  if (!bumpWindow(requestsByAddress, key, 60_000, config.rateLimitPerMinute, now)) {
    throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please wait and try again.');
  }
  // Sign-in, OTP and password-reset attempts get a much smaller per-address budget.
  if (path.startsWith('/v1/auth/') && !bumpWindow(requestsByAddress, `auth:${address}`, 60_000, config.authRateLimitPerMinute, now)) {
    throw new HttpError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Please wait a minute and try again.');
  }
}

function rememberValidatedToken(token: string): void {
  if (validatedTokenHashes.size > MAX_TRACKED_KEYS) validatedTokenHashes.clear();
  validatedTokenHashes.add(createHash('sha256').update(token).digest('hex'));
}

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  const token = authorization.slice(7).trim();
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  return token;
}

function authenticatedUser(request: IncomingMessage): { token: string; user: ApiUser } {
  const token = bearerToken(request);
  const user = requestIdentities.has(request)
    ? requestIdentities.get(request) ?? null
    : sessions.resolve(token);
  if (!user) throw new HttpError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  return { token, user };
}

function authenticatedAdmin(request: IncomingMessage): { token: string; user: ApiUser } {
  const authenticated = authenticatedUser(request);
  if (authenticated.user.role !== 'admin') {
    throw new HttpError(403, 'FORBIDDEN', 'An administrator account is required.');
  }
  return authenticated;
}

function createAuthenticatedResponse(user: ApiUser): AuthApiResponse {
  return sessions.issue(user);
}

async function route(request: IncomingMessage, response: ServerResponse) {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (method === 'GET' && await sendWebsiteFile(response, url.pathname)) return;

  if (method === 'POST' && url.pathname === '/v1/public/contact') {
    enforcePublicSubmissionRateLimit(request);
    const body = await readJson(request);
    const fullName = textField(body, 'fullName', { maxLength: 100 });
    const email = normalizeEmail(textField(body, 'email', { maxLength: 200 }) ?? '');
    const topic = textField(body, 'topic', { maxLength: 30 });
    const message = textField(body, 'message', { maxLength: 3000 });
    if (!fullName || !message || !isValidEmail(email) || (topic !== 'general' && topic !== 'careers' && topic !== 'partnerships')) {
      throw new HttpError(400, 'INVALID_INPUT', 'Please check your contact details and message.');
    }
    const recipient = topic === 'careers' ? config.careersEmail : topic === 'partnerships' ? config.founderEmail : config.contactEmail;
    const messageId = randomUUID();
    const submittedAt = new Date().toISOString();
    await database.websiteSubmissionStore.createContactMessage({
      id: messageId,
      fullName,
      email,
      topic,
      message,
      recipient,
      submittedAt,
    });
    let emailStatus: 'sent' | 'stored' = 'stored';
    try {
      emailStatus = await sendEmail({
        to: recipient,
        replyTo: email,
        subject: `Konjo website: ${topic} enquiry`,
        text: [`Name: ${fullName}`, `Email: ${email}`, `Topic: ${topic}`, '', message].join('\n'),
      });
    } catch (error) {
      logger.error('website_contact_email_failed', {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    sendJson(response, 201, { messageId, emailStatus });
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/public/professional-applications') {
    enforcePublicSubmissionRateLimit(request);
    const contentType = request.headers['content-type'];
    if (!contentType?.toLowerCase().startsWith('multipart/form-data')) {
      throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the application as multipart form data.');
    }
    let payload;
    try {
      payload = parseMultipart(contentType, await readBody(request, config.uploadBodyLimitBytes));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(400, 'INVALID_MULTIPART', 'The application form could not be read.');
    }
    const fullName = publicFormField(payload.fields, 'fullName', 100);
    const email = normalizeEmail(publicFormField(payload.fields, 'email', 200));
    const phone = publicFormField(payload.fields, 'phone', 30);
    const location = publicFormField(payload.fields, 'location', 100);
    const specialties = publicFormField(payload.fields, 'specialties', 240);
    const languages = publicFormField(payload.fields, 'languages', 120);
    const introduction = publicFormField(payload.fields, 'introduction', 1200);
    const yearsExperience = Number(payload.fields.yearsExperience);
    if (!isValidEmail(email) || !Number.isInteger(yearsExperience) || yearsExperience < 0 || yearsExperience > 60 || payload.fields.consent !== 'yes') {
      throw new HttpError(400, 'INVALID_INPUT', 'Please check your application details and consent.');
    }
    const cvFiles = payload.files.filter((file) => file.fieldName === 'cv');
    const portfolioFiles = payload.files.filter((file) => file.fieldName === 'portfolio');
    const acceptedCvTypes = new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
    const acceptedPortfolioTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
    if (cvFiles.length !== 1 || cvFiles[0].data.length > 5 * 1024 * 1024 || !acceptedCvTypes.has(cvFiles[0].mimeType)) {
      throw new HttpError(400, 'INVALID_CV', 'Attach one PDF, DOC or DOCX CV no larger than 5 MB.');
    }
    if (portfolioFiles.length < 1 || portfolioFiles.length > 6 || portfolioFiles.some((file) => file.data.length > 5 * 1024 * 1024 || !acceptedPortfolioTypes.has(file.mimeType))) {
      throw new HttpError(400, 'INVALID_PORTFOLIO', 'Attach 1 to 6 PDF, JPG or PNG portfolio files, each no larger than 5 MB.');
    }
    if (payload.files.length !== cvFiles.length + portfolioFiles.length) {
      throw new HttpError(400, 'INVALID_ATTACHMENTS', 'The application includes an unsupported attachment field.');
    }

    const applicationId = randomUUID();
    let storedFiles;
    try {
      storedFiles = await websiteApplicationFiles.store(applicationId, payload.files);
    } catch {
      throw new HttpError(400, 'INVALID_ATTACHMENTS', 'One or more attachments are not valid.');
    }
    const submittedAt = new Date().toISOString();
    await database.websiteSubmissionStore.createProfessionalApplication({
      id: applicationId,
      fullName,
      email,
      phone,
      location,
      specialties,
      languages,
      yearsExperience,
      introduction,
      files: storedFiles,
      submittedAt,
    });
    let emailStatus: 'sent' | 'stored' = 'stored';
    try {
      emailStatus = await sendEmail({
        to: config.careersEmail,
        replyTo: email,
        subject: `Konjo professional application — ${fullName}`,
        text: [
          `Application ID: ${applicationId}`,
          `Name: ${fullName}`,
          `Email: ${email}`,
          `Phone / WhatsApp: ${phone}`,
          `Location: ${location}`,
          `Specialties: ${specialties}`,
          `Languages: ${languages}`,
          `Years of experience: ${yearsExperience}`,
          '',
          introduction,
        ].join('\n'),
        attachments: payload.files,
      });
    } catch (error) {
      logger.error('website_application_email_failed', {
        applicationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    sendJson(response, 201, { applicationId, emailStatus });
    return;
  }

  if (request.headers.authorization?.startsWith('Bearer ')) {
    const token = bearerToken(request);
    try {
      const identity = await accessTokenAuthenticator.authenticate(token);
      requestIdentities.set(request, identity);
      if (identity) rememberValidatedToken(token);
    } catch (error) {
      if (error instanceof AccessTokenAuthenticationUnavailableError) {
        throw new HttpError(503, 'AUTHENTICATION_UNAVAILABLE', error.message);
      }
      throw error;
    }
  }

  if (method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok', service: 'konjo-api', timestamp: new Date().toISOString() });
    return;
  }

  if (method === 'GET' && url.pathname === '/ready') {
    if (!await readiness.execute()) {
      throw new HttpError(503, 'SERVICE_NOT_READY', 'The service is not ready to accept traffic.');
    }
    sendJson(response, 200, { status: 'ready', service: 'konjo-api', timestamp: new Date().toISOString() });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/zones') {
    sendJson(response, 200, { zones: await marketplaceReads.listServiceZones() });
    return;
  }

  // Address search for saved addresses. A signed-in account is required so
  // the geocoding quota is not open to the internet, and lookups are budgeted
  // per address on top of the general limit.
  if (method === 'GET' && (url.pathname === '/v1/addresses/search' || url.pathname === '/v1/addresses/reverse')) {
    authenticatedUser(request);
    if (!addressSearch) throw new HttpError(503, 'ADDRESS_SEARCH_UNAVAILABLE', 'Address search is not configured.');
    if (!bumpWindow(requestsByAddress, `geocode:${clientAddress(request)}`, 60_000, 60, Date.now())) {
      throw new HttpError(429, 'RATE_LIMITED', 'Too many address lookups. Try again in a minute.');
    }
    try {
      if (url.pathname === '/v1/addresses/search') {
        sendJson(response, 200, { candidates: await addressSearch.search(url.searchParams.get('query') ?? '') });
      } else {
        const candidate = await addressSearch.reverse(Number(url.searchParams.get('latitude')), Number(url.searchParams.get('longitude')));
        sendJson(response, 200, { candidate });
      }
    } catch (error) {
      if (error instanceof InvalidAddressQueryError) throw new HttpError(400, 'INVALID_ADDRESS_QUERY', error.message);
      if (error instanceof GeocodingError) {
        logger.error('address_search_failed', { error: error.message });
        throw new HttpError(502, 'ADDRESS_SEARCH_FAILED', 'Address search is temporarily unavailable. Add directions and pin your location instead.');
      }
      throw error;
    }
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/categories') {
    sendJson(response, 200, { categories: await marketplaceReads.listServiceCategories() });
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/internal/jobs/run') {
    if (!config.workerToken) throw new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.');
    const providedToken = request.headers['x-konjo-worker-token'];
    if (Array.isArray(providedToken) || !verifySecret(providedToken, config.workerToken)) {
      throw new HttpError(401, 'WORKER_UNAUTHENTICATED', 'Worker authentication is required.');
    }
    const result = await backgroundJobs.run();
    logger.info('background_jobs_completed', {
      trigger: 'scheduler',
      skipped: result.skipped,
      reassigned: result.reassigned.length,
      reminders: result.reminders,
      delivered: result.delivered,
      failed: result.failed,
      events: result.events,
    });
    sendJson(response, 200, result);
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/auth/otp/request') {
    const body = await readJson(request);
    const phoneNumber = textField(body, 'phoneNumber', { maxLength: 13 });
    const role = textField(body, 'role', { maxLength: 20 });
    if (!isEthiopianPhoneNumber(phoneNumber) || !isAccountRole(role)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Enter a valid Ethiopian mobile number and account role.');
    }

    try {
      const challenge = await requestOtp.execute({ phoneNumber, role });
      sendJson(response, 201, { challenge });
      return;
    } catch (error) {
      if (error instanceof OtpRequestRateLimitedError) {
        throw new HttpError(429, 'OTP_RATE_LIMITED', error.message);
      }
      if (error instanceof OtpDeliveryError) {
        throw new HttpError(503, 'OTP_DELIVERY_UNAVAILABLE', 'A verification code could not be sent. Please try again.');
      }
      throw error;
    }
  }

  if (method === 'POST' && url.pathname === '/v1/auth/professional/mock-otp/request') {
    if (!professionalMockAuth || config.production) {
      throw new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
    const body = await readJson(request);
    const phoneNumber = textField(body, 'phoneNumber', { maxLength: 13 });
    if (!isEthiopianPhoneNumber(phoneNumber)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Enter a valid Ethiopian mobile number.');
    }
    const expiresAt = Date.now() + PROFESSIONAL_MOCK_OTP_LIFETIME_MS;
    const challengeId = `${PROFESSIONAL_MOCK_OTP_CHALLENGE_PREFIX}${randomUUID()}`;
    professionalMockOtpChallenges.set(challengeId, { phoneNumber, expiresAt });
    sendJson(response, 201, {
      challenge: {
        id: challengeId,
        phoneNumber,
        expiresAt,
        codeLength: PROFESSIONAL_MOCK_OTP_CODE_LENGTH,
        developmentCode: PROFESSIONAL_MOCK_OTP_CODE,
      },
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/auth/professional/mock-otp/verify') {
    if (!professionalMockAuth || config.production) {
      throw new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.');
    }
    const body = await readJson(request);
    const challengeId = textField(body, 'challengeId', { maxLength: 100 });
    const phoneNumber = textField(body, 'phoneNumber', { maxLength: 13 });
    const code = textField(body, 'code', { maxLength: PROFESSIONAL_MOCK_OTP_CODE_LENGTH });
    const challenge = challengeId ? professionalMockOtpChallenges.get(challengeId) : null;
    if (
      !challengeId || !challenge || challenge.expiresAt <= Date.now() ||
      challenge.phoneNumber !== phoneNumber
    ) {
      if (challengeId) professionalMockOtpChallenges.delete(challengeId);
      throw new HttpError(401, 'OTP_CHALLENGE_INVALID', 'This verification code has expired. Request a new code.');
    }
    if (code !== PROFESSIONAL_MOCK_OTP_CODE) {
      throw new HttpError(401, 'INVALID_OTP', 'That verification code is not correct.');
    }
    try {
      const session = await professionalMockAuth.register(challenge.phoneNumber);
      professionalMockOtpChallenges.delete(challengeId);
      sendJson(response, 200, { session });
      return;
    } catch (error) {
      if (error instanceof MockProfessionalRegistrationError && error.failure === 'phone_in_use') {
        throw new HttpError(409, 'PHONE_ALREADY_IN_USE', error.message);
      }
      logger.error('professional_mock_registration_failed', {
        error: error instanceof Error ? error.message : 'Unknown Supabase authentication error',
      });
      throw new HttpError(503, 'AUTH_PROVIDER_UNAVAILABLE', 'The professional account could not be created. Please try again.');
    }
  }

  if (method === 'POST' && url.pathname === '/v1/auth/otp/verify') {
    const body = await readJson(request);
    const challengeId = textField(body, 'challengeId', { maxLength: 80 });
    const code = textField(body, 'code', { maxLength: 4 });
    const role = textField(body, 'role', { maxLength: 20 });
    if (!challengeId || !code || !/^\d{4}$/.test(code) || !isAccountRole(role)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Enter the four-digit verification code.');
    }

    const currentUser = request.headers.authorization?.startsWith('Bearer ')
      ? authenticatedUser(request).user
      : null;
    if (currentUser && currentUser.role !== role) {
      throw new HttpError(403, 'ROLE_MISMATCH', 'The verification role does not match the signed-in account.');
    }
    const result = verifyOtp.execute({
      challengeId,
      code,
      role,
      shouldCreateUser: body.shouldCreateUser !== false,
      ...(currentUser ? { authenticatedUserId: currentUser.id } : {}),
    });
    if (result.result === 'invalid_challenge') {
      throw new HttpError(401, 'OTP_CHALLENGE_INVALID', 'This verification code has expired. Request a new code.');
    }
    if (result.result === 'invalid_code') {
      throw new HttpError(401, 'INVALID_OTP', 'That verification code is not correct.');
    }
    if (result.result === 'phone_in_use') {
      throw new HttpError(409, 'PHONE_ALREADY_IN_USE', 'This phone number is already connected to another account.');
    }
    if (result.result === 'account_not_found') {
      throw new HttpError(404, 'ACCOUNT_NOT_FOUND', 'No professional account was found for this phone number. Choose Register to create one.');
    }
    sendJson(response, 200, createAuthenticatedResponse(result.user));
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/auth/register/client') {
    const body = await readJson(request);
    const emailValue = textField(body, 'email', { maxLength: 254 });
    const fullName = textField(body, 'fullName', { maxLength: 120 });
    const password = textField(body, 'password', { maxLength: 128 });
    if (!emailValue || !isValidEmail(emailValue) || !fullName || fullName.length < 2 || !password || !isValidPassword(password)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Enter a valid name, email, and password of at least 10 characters.');
    }
    try {
      const user = await accounts.registerClient(normalizeEmail(emailValue), fullName, password);
      sendJson(response, 201, createAuthenticatedResponse(user));
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes('UNIQUE constraint failed') || error.message.includes('PROMOTION_CODE_EXISTS')
      )) {
        throw new HttpError(409, 'EMAIL_IN_USE', 'An account already exists for this email address.');
      }
      throw error;
    }
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/auth/login/client') {
    const body = await readJson(request);
    const email = textField(body, 'email', { maxLength: 254 });
    const password = textField(body, 'password', { maxLength: 128 });
    const user = email && password
      ? await accounts.loginClient(normalizeEmail(email), password)
      : null;
    if (!user) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'The email or password is not correct.');
    }
    sendJson(response, 200, createAuthenticatedResponse(user));
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/auth/login/admin') {
    const body = await readJson(request);
    const email = textField(body, 'email', { maxLength: 254 });
    const password = textField(body, 'password', { maxLength: 128 });
    const user = email && password
      ? await accounts.loginAdmin(normalizeEmail(email), password)
      : null;
    if (!user) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'The email or password is not correct.');
    }
    sendJson(response, 200, createAuthenticatedResponse(user));
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/auth/password-reset/request') {
    const body = await readJson(request);
    const emailValue = textField(body, 'email', { maxLength: 254 });
    if (!emailValue || !isValidEmail(emailValue)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Enter a valid email address.');
    }

    const result = await passwordResets.request(normalizeEmail(emailValue));
    if (result.deliveryError) {
      logger.error('password_reset_email_failed', { error: result.deliveryError.message });
    }
    sendJson(response, 202, result.response);
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/auth/password-reset/confirm') {
    const body = await readJson(request);
    const token = textField(body, 'token', { maxLength: 128 });
    const password = textField(body, 'password', { maxLength: 128 });
    if (!token || !password || !isValidPassword(password)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Enter a valid reset token and password of at least 10 characters.');
    }
    const changed = await passwordResets.confirm(token, password);
    if (!changed) {
      throw new HttpError(401, 'PASSWORD_RESET_INVALID', 'This password reset link is invalid or expired.');
    }
    response.statusCode = 204;
    response.end();
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/auth/logout') {
    const token = bearerToken(request);
    sessions.revoke(token);
    response.statusCode = 204;
    response.end();
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/me/rewards') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    sendJson(response, 200, { rewards: await clientReads.getRewards(user.id) });
    return;
  }

  if (url.pathname === '/v1/me') {
    const { user } = authenticatedUser(request);
    if (method === 'GET') {
      sendJson(response, 200, { user });
      return;
    }
    if (method === 'PATCH') {
      if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'This profile cannot be edited here.');
      const body = await readJson(request);
      const fullName = textField(body, 'fullName', { maxLength: 120 });
      const preferredLanguage = textField(body, 'preferredLanguage', { optional: true, maxLength: 2 });
      if (!fullName || fullName.length < 2) throw new HttpError(400, 'INVALID_INPUT', 'Enter your full name.');
      if (preferredLanguage && !isClientPreferredLanguage(preferredLanguage)) {
        throw new HttpError(400, 'INVALID_INPUT', 'Choose a supported language.');
      }
      const updated = await clientAccounts.updateProfile(user.id, {
        fullName,
        phoneNumber: user.phoneNumber,
        ...(isClientPreferredLanguage(preferredLanguage) ? { preferredLanguage } : {}),
      });
      if (!updated) throw new HttpError(404, 'CLIENT_NOT_FOUND', 'The client account could not be found.');
      sendJson(response, 200, { user: updated });
      return;
    }
    if (method === 'DELETE') {
      if (user.role === 'admin') throw new HttpError(403, 'FORBIDDEN', 'Administrator accounts require out-of-band removal.');
      await clientAccounts.deleteAccount(user.id, user.role);
      response.statusCode = 204;
      response.end();
      return;
    }
  }

  if (method === 'GET' && url.pathname === '/v1/admin/summary') {
    authenticatedAdmin(request);
    sendJson(response, 200, { summary: await adminReads.getSummary() });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/domain-events/dead-letters') {
    authenticatedAdmin(request);
    const requestedLimit = url.searchParams.get('limit');
    const limit = requestedLimit === null ? 50 : Number(requestedLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new HttpError(400, 'INVALID_LIMIT', 'The dead-letter limit must be between 1 and 100.');
    }
    sendJson(response, 200, { events: await domainEventDeadLetters.list(limit) });
    return;
  }

  const adminDomainEventReplayMatch = url.pathname.match(
    /^\/v1\/admin\/domain-events\/dead-letters\/([^/]+)\/replay$/,
  );
  if (method === 'POST' && adminDomainEventReplayMatch) {
    const { user } = authenticatedAdmin(request);
    const eventId = decodeURIComponent(adminDomainEventReplayMatch[1]);
    const result = await domainEventDeadLetters.replay(eventId, user.id);
    if (result === 'not_found') {
      throw new HttpError(404, 'DOMAIN_EVENT_NOT_FOUND', 'The domain event was not found.');
    }
    if (result === 'not_failed') {
      throw new HttpError(409, 'DOMAIN_EVENT_NOT_FAILED', 'Only failed domain events can be replayed.');
    }
    sendJson(response, 202, { eventId, status: 'pending' });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/professional-applications') {
    authenticatedAdmin(request);
    const statusValue = url.searchParams.get('status');
    const status = statusValue === 'pending' || statusValue === 'approved' || statusValue === 'changes_requested' || statusValue === 'rejected' || statusValue === 'suspended'
      ? statusValue
      : undefined;
    if (statusValue && !status) throw new HttpError(400, 'INVALID_FILTER', 'The application status filter is invalid.');
    sendJson(response, 200, { applications: await adminReads.listProfessionalApplications(status) });
    return;
  }

  const adminApplicationActionMatch = url.pathname.match(
    /^\/v1\/admin\/professional-applications\/([^/]+)\/(approve|request-changes|reject)$/,
  );
  if (method === 'POST' && adminApplicationActionMatch) {
    const { user } = authenticatedAdmin(request);
    const professionalId = decodeURIComponent(adminApplicationActionMatch[1]);
    const action = adminApplicationActionMatch[2] as 'approve' | 'request-changes' | 'reject';
    const body = request.headers['content-type']?.toLowerCase().startsWith('application/json')
      ? await readJson(request)
      : {};
    const reason = textField(body, 'reason', { optional: true, maxLength: 500 }) ?? undefined;
    const application = await adminProfessionals.reviewApplication(
      user.id,
      professionalId,
      action,
      reason,
    );
    if (!application) {
      throw new HttpError(409, 'APPLICATION_NOT_REVIEWABLE', 'This application is not pending review.');
    }
    sendJson(response, 200, { application });
    // Deliver the approval/rejection SMS now instead of waiting for the next worker tick.
    void backgroundJobs.run().catch((error: unknown) => {
      logger.error('background_jobs_failed', {
        trigger: 'application_review',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/professionals') {
    authenticatedAdmin(request);
    sendJson(response, 200, { professionals: await adminReads.listProfessionals() });
    return;
  }

  const adminProfessionalMatch = url.pathname.match(/^\/v1\/admin\/professionals\/([^/]+)$/);
  if (method === 'PATCH' && adminProfessionalMatch) {
    const { user } = authenticatedAdmin(request);
    const professionalId = decodeURIComponent(adminProfessionalMatch[1]);
    const body = await readJson(request);
    if (typeof body.featured !== 'boolean' || typeof body.femaleOnlyEligible !== 'boolean') {
      throw new HttpError(400, 'INVALID_INPUT', 'featured and femaleOnlyEligible must be true or false.');
    }
    const professional = await adminProfessionals.updateProfessional(user.id, professionalId, {
      featured: body.featured,
      femaleOnlyEligible: body.femaleOnlyEligible,
    });
    if (!professional) throw new HttpError(404, 'PROFESSIONAL_NOT_FOUND', 'The professional was not found.');
    sendJson(response, 200, { professional });
    return;
  }

  const adminProfessionalStateMatch = url.pathname.match(
    /^\/v1\/admin\/professionals\/([^/]+)\/(suspend|restore)$/,
  );
  if (method === 'POST' && adminProfessionalStateMatch) {
    const { user } = authenticatedAdmin(request);
    const professionalId = decodeURIComponent(adminProfessionalStateMatch[1]);
    const action = adminProfessionalStateMatch[2] as 'suspend' | 'restore';
    const professional = await adminProfessionals.setProfessionalState(user.id, professionalId, action);
    if (!professional) throw new HttpError(404, 'PROFESSIONAL_NOT_FOUND', 'The professional was not found.');
    sendJson(response, 200, { professional });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/categories') {
    authenticatedAdmin(request);
    sendJson(response, 200, { categories: await marketplaceReads.listServiceCategories(false) });
    return;
  }

  const adminCategoryMatch = url.pathname.match(/^\/v1\/admin\/categories\/([^/]+)$/);
  if (method === 'PUT' && adminCategoryMatch) {
    const { user } = authenticatedAdmin(request);
    const body = await readJson(request);
    const id = decodeURIComponent(adminCategoryMatch[1]);
    const slug = textField(body, 'slug', { maxLength: 60 });
    const name = textField(body, 'name', { maxLength: 100 });
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !name || typeof body.active !== 'boolean' || !Number.isInteger(body.sortOrder)) {
      throw new HttpError(400, 'INVALID_CATEGORY', 'Enter a valid category name, slug, state, and sort order.');
    }
    const category = await adminCatalog.upsertCategory(user.id, {
      id,
      slug,
      name,
      active: body.active,
      sortOrder: body.sortOrder as number,
    });
    sendJson(response, 200, { category });
    return;
  }

  if (url.pathname === '/v1/admin/settings/commission') {
    const { user } = authenticatedAdmin(request);
    if (method === 'GET') {
      sendJson(response, 200, { settings: await adminReads.getPlatformSettings() });
      return;
    }
    if (method === 'PATCH') {
      const body = await readJson(request);
      if (!Number.isInteger(body.commissionRateBps) || (body.commissionRateBps as number) < 0 || (body.commissionRateBps as number) > 5000) {
        throw new HttpError(400, 'INVALID_COMMISSION_RATE', 'Commission must be between 0% and 50%.');
      }
      const settings = await adminCatalog.updateCommission(user.id, {
        commissionRateBps: body.commissionRateBps as number,
      });
      sendJson(response, 200, { settings });
      return;
    }
  }

  if (url.pathname === '/v1/admin/settings/travel-fee-cap') {
    const { user } = authenticatedAdmin(request);
    if (method === 'GET') {
      sendJson(response, 200, { settings: await adminReads.getPlatformSettings() });
      return;
    }
    if (method === 'PATCH') {
      const body = await readJson(request);
      const travelFeeCap = body.travelFeeCap;
      if (!Number.isInteger(travelFeeCap) || (travelFeeCap as number) < 0 || (travelFeeCap as number) > 100_000) {
        throw new HttpError(400, 'INVALID_TRAVEL_FEE_CAP', 'The travel fee cap must be a whole number between 0 and 100,000 ETB.');
      }
      const settings = await adminCatalog.updateTravelFeeCap(user.id, { travelFeeCap: travelFeeCap as number });
      sendJson(response, 200, { settings });
      return;
    }
  }

  if (method === 'GET' && url.pathname === '/v1/admin/bookings') {
    authenticatedAdmin(request);
    const query = url.searchParams.get('query')?.trim() || undefined;
    const statusValue = url.searchParams.get('status')?.trim() || undefined;
    const status = statusValue && ['requested', 'accepted', 'on_the_way', 'in_progress', 'completed', 'cancelled'].includes(statusValue)
      ? statusValue as ApiBookingStatus
      : undefined;
    const dateFrom = url.searchParams.get('dateFrom')?.trim() || undefined;
    const dateTo = url.searchParams.get('dateTo')?.trim() || undefined;
    const professionalId = url.searchParams.get('professionalId')?.trim() || undefined;
    if (statusValue && !status) throw new HttpError(400, 'INVALID_FILTER', 'The booking status filter is invalid.');
    if (query && query.length > 120) throw new HttpError(400, 'INVALID_FILTER', 'The booking search is too long.');
    if ([dateFrom, dateTo].some((date) => date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
      throw new HttpError(400, 'INVALID_FILTER', 'Booking dates must use YYYY-MM-DD.');
    }
    sendJson(response, 200, { bookings: await adminReads.listBookings({ query, status, dateFrom, dateTo, professionalId }) });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/payouts') {
    authenticatedAdmin(request);
    sendJson(response, 200, { payouts: await adminReads.listPayouts() });
    return;
  }

  // Who Konjo owes money to and where to send it (earnings not yet batched).
  if (method === 'GET' && url.pathname === '/v1/admin/payouts/pending') {
    authenticatedAdmin(request);
    sendJson(response, 200, { pending: await adminReads.listPendingPayouts() });
    return;
  }

  // Group everything a professional is owed into one payout batch to pay by hand.
  if (method === 'POST' && url.pathname === '/v1/admin/payouts/queue') {
    const { user } = authenticatedAdmin(request);
    const body = await readJson(request);
    const professionalId = textField(body, 'professionalId', { maxLength: 64 });
    if (!professionalId || !isUuid(professionalId)) {
      throw new HttpError(400, 'INVALID_INPUT', 'professionalId is not valid.');
    }
    const payout = await adminPayouts.queue(user.id, professionalId);
    if (!payout) throw new HttpError(409, 'NOTHING_TO_PAY', 'This professional has no earnings waiting for a payout.');
    sendJson(response, 201, { payout });
    return;
  }

  const adminPayoutPaidMatch = url.pathname.match(/^\/v1\/admin\/payouts\/([^/]+)\/mark-paid$/);
  if (method === 'POST' && adminPayoutPaidMatch) {
    const { user } = authenticatedAdmin(request);
    const body = await readJson(request);
    const professionalId = textField(body, 'professionalId', { maxLength: 64 });
    if (!professionalId || !isUuid(professionalId)) {
      throw new HttpError(400, 'INVALID_INPUT', 'professionalId is not valid.');
    }
    const paidReference = textField(body, 'paidReference', { optional: true, maxLength: 120 });
    const paidNote = textField(body, 'paidNote', { optional: true, maxLength: 500 });
    const payout = await adminPayouts.settle(user.id, professionalId, decodeURIComponent(adminPayoutPaidMatch[1]), {
      paidReference,
      paidNote,
    });
    if (!payout) throw new HttpError(404, 'PAYOUT_NOT_FOUND', 'The payout batch could not be found.');
    sendJson(response, 200, { payout });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/audit-logs') {
    authenticatedAdmin(request);
    sendJson(response, 200, { auditLogs: await adminReads.listAuditLogs() });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/zones') {
    authenticatedAdmin(request);
    sendJson(response, 200, { zones: await adminReads.listZones() });
    return;
  }

  const adminZoneMatch = url.pathname.match(/^\/v1\/admin\/zones\/([^/]+)$/);
  if (method === 'PUT' && adminZoneMatch) {
    const { user } = authenticatedAdmin(request);
    const body = await readJson(request);
    const label = textField(body, 'label', { maxLength: 80 });
    const travelFee = body.travelFee;
    const active = body.active;
    if (!label || typeof travelFee !== 'number' || !Number.isInteger(travelFee) || travelFee < 0 || travelFee > 100_000 || typeof active !== 'boolean') {
      throw new HttpError(400, 'INVALID_ZONE', 'Enter a valid zone, fee, and active state.');
    }
    const zone = await adminCatalog.upsertZone(user.id, {
      id: decodeURIComponent(adminZoneMatch[1]),
      label,
      travelFee,
      active,
    });
    sendJson(response, 200, { zone });
    return;
  }

  if (url.pathname === '/v1/admin/promotions' && (method === 'GET' || method === 'POST')) {
    const { user } = authenticatedAdmin(request);
    if (method === 'GET') {
      sendJson(response, 200, { promotions: await marketplaceReads.listPromotions() });
      return;
    }
    const body = await readJson(request);
    const code = textField(body, 'code', { maxLength: 40 });
    const description = textField(body, 'description', { maxLength: 240 });
    const discountPercent = body.discountPercent;
    const active = body.active;
    const startsAt = textField(body, 'startsAt', { maxLength: 40 });
    const endsAt = textField(body, 'endsAt', { maxLength: 40 });
    if (
      !code || !/^[A-Z0-9_-]{3,40}$/i.test(code) || !description ||
      typeof discountPercent !== 'number' || !Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 100 ||
      typeof active !== 'boolean' || !startsAt || !endsAt ||
      !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)
    ) throw new HttpError(400, 'INVALID_PROMOTION', 'Enter valid promotion details and dates.');
    try {
      const promotion = await adminCatalog.createPromotion(user.id, {
        code,
        description,
        discountPercent,
        active,
        startsAt,
        endsAt,
      });
      sendJson(response, 201, { promotion });
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw new HttpError(409, 'PROMOTION_CODE_EXISTS', 'That promotion code already exists.');
      }
      throw error;
    }
    return;
  }

  const adminPromotionMatch = url.pathname.match(/^\/v1\/admin\/promotions\/([^/]+)$/);
  if (method === 'PATCH' && adminPromotionMatch) {
    const { user } = authenticatedAdmin(request);
    const body = await readJson(request);
    if (typeof body.active !== 'boolean') throw new HttpError(400, 'INVALID_PROMOTION', 'active must be true or false.');
    const promotion = await adminCatalog.setPromotionActive(user.id, {
      promotionId: adminPromotionMatch[1],
      active: body.active,
    });
    if (!promotion) throw new HttpError(404, 'PROMOTION_NOT_FOUND', 'The promotion could not be found.');
    sendJson(response, 200, { promotion });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/disputes') {
    authenticatedAdmin(request);
    sendJson(response, 200, { disputes: await adminReads.listDisputes() });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/quality-flags') {
    authenticatedAdmin(request);
    sendJson(response, 200, { qualityFlags: await adminReads.listQualityFlags() });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/safety-incidents') {
    authenticatedAdmin(request);
    sendJson(response, 200, { safetyIncidents: await adminReads.listSafetyIncidents() });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/content-reports') {
    authenticatedAdmin(request);
    sendJson(response, 200, { contentReports: await adminReads.listContentReports() });
    return;
  }

  const adminContentReportMatch = url.pathname.match(/^\/v1\/admin\/content-reports\/([^/]+)\/resolve$/);
  if (method === 'POST' && adminContentReportMatch) {
    const { user } = authenticatedAdmin(request);
    const body = await readJson(request);
    const status = textField(body, 'status', { maxLength: 20 });
    const action = textField(body, 'action', { maxLength: 30 });
    const resolution = textField(body, 'resolution', { maxLength: 1000 });
    if ((status !== 'resolved' && status !== 'dismissed') ||
      (action !== 'none' && action !== 'hide_review' && action !== 'suspend_professional') ||
      !resolution || resolution.length < 5) {
      throw new HttpError(400, 'INVALID_RESOLUTION', 'Enter a valid content-report decision and resolution.');
    }
    const contentReport = await trustSafety.resolveContentReport(
      user.id,
      adminContentReportMatch[1],
      status,
      action,
      resolution,
    );
    if (!contentReport) throw new HttpError(409, 'CONTENT_REPORT_NOT_OPEN', 'The content report is not open or the action does not match its target.');
    sendJson(response, 200, { contentReport });
    return;
  }

  const adminSafetyIncidentMatch = url.pathname.match(/^\/v1\/admin\/safety-incidents\/([^/]+)\/resolve$/);
  if (method === 'POST' && adminSafetyIncidentMatch) {
    const { user } = authenticatedAdmin(request);
    const body = await readJson(request);
    const resolution = textField(body, 'resolution', { maxLength: 1000 });
    if (!resolution || resolution.length < 5) {
      throw new HttpError(400, 'INVALID_RESOLUTION', 'Enter a safety-incident resolution.');
    }
    const safetyIncident = await trustSafety.resolveSafetyIncident(user.id, adminSafetyIncidentMatch[1], resolution);
    if (!safetyIncident) throw new HttpError(409, 'SAFETY_INCIDENT_NOT_OPEN', 'The safety incident is not open.');
    sendJson(response, 200, { safetyIncident });
    return;
  }

  const adminQualityFlagMatch = url.pathname.match(/^\/v1\/admin\/quality-flags\/([^/]+)\/resolve$/);
  if (method === 'POST' && adminQualityFlagMatch) {
    const { user } = authenticatedAdmin(request);
    const body = await readJson(request);
    const resolution = textField(body, 'resolution', { maxLength: 1000 });
    const action = textField(body, 'action', { maxLength: 20 });
    if (!resolution || resolution.length < 5 || (action !== 'restore' && action !== 'keep_hidden')) {
      throw new HttpError(400, 'INVALID_RESOLUTION', 'Enter a quality-review resolution.');
    }
    const qualityFlag = await trustSafety.resolveQualityFlag(user.id, adminQualityFlagMatch[1], resolution, action);
    if (!qualityFlag) throw new HttpError(409, 'QUALITY_FLAG_NOT_OPEN', 'The quality flag is not open.');
    sendJson(response, 200, { qualityFlag });
    return;
  }

  const adminDisputeMatch = url.pathname.match(/^\/v1\/admin\/disputes\/([^/]+)\/resolve$/);
  if (method === 'POST' && adminDisputeMatch) {
    const { user } = authenticatedAdmin(request);
    const body = await readJson(request);
    const status = textField(body, 'status', { maxLength: 20 });
    const resolution = textField(body, 'resolution', { maxLength: 1000 });
    if ((status !== 'resolved' && status !== 'rejected') || !resolution || resolution.length < 5) {
      throw new HttpError(400, 'INVALID_RESOLUTION', 'Enter a valid dispute decision and resolution.');
    }
    const dispute = await trustSafety.resolveBookingDispute(user.id, adminDisputeMatch[1], status, resolution);
    if (!dispute) throw new HttpError(409, 'DISPUTE_NOT_OPEN', 'The dispute is not open.');
    sendJson(response, 200, { dispute });
    return;
  }

  if (url.pathname === '/v1/admin/broadcasts' && (method === 'GET' || method === 'POST')) {
    const { user } = authenticatedAdmin(request);
    if (method === 'GET') {
      sendJson(response, 200, { broadcasts: await adminReads.listBroadcasts() });
      return;
    }
    const body = await readJson(request);
    const audience = textField(body, 'audience', { maxLength: 20 });
    const message = textField(body, 'message', { maxLength: 500 });
    if ((audience !== 'all' && audience !== 'clients' && audience !== 'professionals') || !message || message.length < 5) {
      throw new HttpError(400, 'INVALID_BROADCAST', 'Choose an audience and enter a message.');
    }
    const broadcast = await adminCatalog.createBroadcast(user.id, { audience, message });
    sendJson(response, 201, { broadcast });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/exports/bookings.csv') {
    const { user } = authenticatedAdmin(request);
    const bookings = await adminReads.listBookings({}, 10_000);
    await adminExportAudit.execute(user.id, 'bookings', bookings.length);
    sendCsv(response, 'konjo-bookings.csv', [
      ['booking_id', 'client', 'professional', 'service', 'date', 'time', 'status', 'total_etb'],
      ...bookings.map((booking) => [
        booking.id,
        booking.clientName,
        booking.professionalName,
        booking.serviceName,
        booking.dateIso,
        booking.time,
        booking.status,
        booking.total,
      ]),
    ]);
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/exports/payouts.csv') {
    const { user } = authenticatedAdmin(request);
    const payouts = await adminReads.listPayouts();
    await adminExportAudit.execute(user.id, 'payouts', payouts.length);
    sendCsv(response, 'konjo-payouts.csv', [
      ['payout_id', 'professional_id', 'status', 'amount_etb', 'booking_count', 'created_at', 'paid_at', 'payout_method', 'account_name', 'account_number', 'bank_name', 'paid_reference', 'paid_note'],
      ...payouts.map((payout) => [
        payout.id,
        payout.professionalId,
        payout.status,
        payout.amount,
        payout.bookingCount,
        payout.createdAt,
        payout.paidAt,
        payout.payoutMethod?.type ?? '',
        payout.payoutMethod?.accountName ?? '',
        payout.payoutMethod?.accountNumber ?? '',
        payout.payoutMethod?.bankName ?? '',
        payout.paidReference ?? '',
        payout.paidNote ?? '',
      ]),
    ]);
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/exports/revenue.csv') {
    const { user } = authenticatedAdmin(request);
    const rows = await adminReads.listRevenueRows();
    await adminExportAudit.execute(user.id, 'revenue', rows.length);
    sendCsv(response, 'konjo-revenue.csv', [
      ['booking_id', 'created_at', 'payment_status', 'gross_etb', 'refunded_etb', 'net_collected_etb', 'commission_etb', 'professional_payable_etb'],
      ...rows.map((row) => [row.bookingId, row.createdAt, row.paymentStatus, row.grossAmount, row.refundedAmount, row.netCollected, row.commissionAmount, row.professionalPayable]),
    ]);
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/admin/exports/professionals.csv') {
    const { user } = authenticatedAdmin(request);
    const professionals = await adminReads.listProfessionals();
    await adminExportAudit.execute(user.id, 'professionals', professionals.length);
    sendCsv(response, 'konjo-professionals.csv', [
      ['professional_id', 'display_name', 'category', 'status', 'featured', 'female_only_eligible', 'hidden_for_quality', 'rating', 'review_count'],
      ...professionals.map((professional) => [professional.id, professional.displayName, professional.category, professional.approvalStatus, professional.featured, professional.femaleOnlyEligible, professional.hiddenForQuality, professional.rating, professional.reviewCount]),
    ]);
    return;
  }

  if (url.pathname === '/v1/professional/application') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'professional') throw new HttpError(403, 'FORBIDDEN', 'A professional account is required.');
    if (method === 'GET') {
      sendJson(response, 200, { application: await professionalReads.getApplication(user.id) });
      return;
    }
    if (method === 'PUT') {
      const input = professionalApplicationInput(await readJson(request));
      const result = await submitProfessionalApplication.execute(user.id, input);
      if (result.result === 'not_editable') {
        throw new HttpError(409, 'APPLICATION_NOT_EDITABLE', 'This application is already under review or approved.');
      }
      sendJson(response, 200, { application: result.application });
      return;
    }
  }

  if (url.pathname === '/v1/professional/dashboard') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'professional') throw new HttpError(403, 'FORBIDDEN', 'A professional account is required.');
    if (method === 'GET') {
      const dashboard = await professionalReads.getDashboard(user.id);
      if (!dashboard) throw new HttpError(403, 'PROFESSIONAL_NOT_APPROVED', 'Your professional application is not approved.');
      sendJson(response, 200, { dashboard });
      return;
    }
  }

  if (url.pathname === '/v1/professional/catalog') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'professional') throw new HttpError(403, 'FORBIDDEN', 'A professional account is required.');
    if (method === 'GET') {
      const settings = await professionalReads.getCatalogSettings(user.id);
      if (!settings) throw new HttpError(403, 'PROFESSIONAL_NOT_APPROVED', 'Your professional application is not approved.');
      sendJson(response, 200, { settings });
      return;
    }
    if (method === 'PATCH') {
      const application = await professionalReads.getApplication(user.id);
      if (!application || application.status !== 'approved') {
        throw new HttpError(403, 'PROFESSIONAL_NOT_APPROVED', 'Your professional application is not approved.');
      }
      const body = await readJson(request);
      const parsed = professionalApplicationInput({
        preferredLanguage: application.preferredLanguage,
        profile: {
          ...application.profile,
          specialty: application.profile.specialty,
          yearsExperience: Number(application.profile.yearsExperience),
        },
        services: body.services,
        workingDays: body.workingDays,
        travelZones: body.travelZones,
        sameDayBookings: body.sameDayBookings,
        termsAccepted: true,
      });
      const result = await professionalSelfService.updateCatalog(user.id, {
        services: parsed.services,
        workingDays: parsed.workingDays,
        travelZones: parsed.travelZones,
        sameDayBookings: parsed.sameDayBookings,
      });
      if (result.result === 'not_found') throw new HttpError(403, 'PROFESSIONAL_NOT_APPROVED', 'Your professional application is not approved.');
      if (result.result === 'invalid_zone') throw new HttpError(400, 'INVALID_ZONE', 'Choose only active Konjo service zones.');
      sendJson(response, 200, { settings: result.settings });
      return;
    }
  }

  if (method === 'PATCH' && url.pathname === '/v1/professional/availability') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'professional') throw new HttpError(403, 'FORBIDDEN', 'A professional account is required.');
    const body = await readJson(request);
    if (typeof body.available !== 'boolean') {
      throw new HttpError(400, 'INVALID_INPUT', 'Availability must be true or false.');
    }
    if (!await professionalSelfService.setAvailability(user.id, body.available)) {
      throw new HttpError(403, 'PROFESSIONAL_NOT_APPROVED', 'Your professional application is not approved.');
    }
    sendJson(response, 200, { available: body.available });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/professional/payouts') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'professional') throw new HttpError(403, 'FORBIDDEN', 'A professional account is required.');
    sendJson(response, 200, { payouts: await professionalReads.listPayouts(user.id) });
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/development/professional/payouts/batch') {
    const { user } = authenticatedUser(request);
    if (config.authMode !== 'development') throw new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.');
    if (user.role !== 'professional') throw new HttpError(403, 'FORBIDDEN', 'A professional account is required.');
    const payout = await professionalPayouts.queue(user.id);
    if (!payout) throw new HttpError(409, 'NO_PAYABLE_EARNINGS', 'There are no unpaid earnings to batch.');
    sendJson(response, 201, { payout });
    return;
  }

  const developmentPayoutMatch = url.pathname.match(/^\/v1\/development\/professional\/payouts\/([^/]+)\/pay$/);
  if (method === 'POST' && developmentPayoutMatch) {
    const { user } = authenticatedUser(request);
    if (config.authMode !== 'development') throw new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.');
    if (user.role !== 'professional') throw new HttpError(403, 'FORBIDDEN', 'A professional account is required.');
    const payout = await professionalPayouts.settle(user.id, developmentPayoutMatch[1]);
    if (!payout) throw new HttpError(404, 'PAYOUT_NOT_FOUND', 'The payout batch could not be found.');
    sendJson(response, 200, { payout });
    return;
  }

  const professionalBookingActionMatch = url.pathname.match(
    /^\/v1\/professional\/bookings\/([^/]+)\/(accept|decline|travel|arrive|check-in|complete|no-show|approve-reschedule|decline-reschedule)$/,
  );
  if (method === 'POST' && professionalBookingActionMatch) {
    const { user } = authenticatedUser(request);
    if (user.role !== 'professional') throw new HttpError(403, 'FORBIDDEN', 'A professional account is required.');
    const action = professionalBookingActionMatch[2] as 'accept' | 'decline' | 'travel' | 'arrive' | 'check-in' | 'complete' | 'no-show' | 'approve-reschedule' | 'decline-reschedule';
    // On accept, the professional names the travel fee for this trip. The store
    // enforces the administrator-managed cap; here we only check the shape.
    let travelFee: number | undefined;
    if (action === 'accept') {
      // Accepting without a body keeps the request's travel fee (zero); the
      // app always sends the fee the professional named.
      const body = await readOptionalJson(request);
      const raw = body.travelFee;
      if (raw !== undefined && raw !== null) {
        if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
          throw new HttpError(400, 'INVALID_TRAVEL_FEE', 'The travel fee must be a whole number of ETB, zero or more.');
        }
        travelFee = raw;
      }
    }
    // At checkout the professional names what the client owes for services
    // beyond the booking. It is added, with its service fee, to the client's
    // final payment; the store refuses it once the booking is fully paid.
    let extraAmount: number | undefined;
    let extraNote: string | undefined;
    if (action === 'complete') {
      const body = await readOptionalJson(request);
      const rawAmount = body.extraAmount;
      if (rawAmount !== undefined && rawAmount !== null) {
        if (typeof rawAmount !== 'number' || !Number.isInteger(rawAmount) || rawAmount < 0 || rawAmount > 100_000) {
          throw new HttpError(400, 'INVALID_EXTRA_AMOUNT', 'Extra services must be a whole number of ETB between 0 and 100,000.');
        }
        extraAmount = rawAmount;
      }
      const rawNote = body.extraNote;
      if (rawNote !== undefined && rawNote !== null) {
        if (typeof rawNote !== 'string' || rawNote.trim().length > 200) {
          throw new HttpError(400, 'INVALID_EXTRA_NOTE', 'Describe the extra services in up to 200 characters.');
        }
        if (rawNote.trim()) extraNote = rawNote.trim();
      }
    }
    const result = await transitionProfessionalBooking.execute({
      professionalId: user.id,
      bookingId: professionalBookingActionMatch[1],
      action,
      ...(travelFee !== undefined ? { travelFee } : {}),
      ...(extraAmount !== undefined ? { extraAmount } : {}),
      ...(extraNote !== undefined ? { extraNote } : {}),
    });
    if (result === 'not_found') throw new HttpError(404, 'BOOKING_NOT_FOUND', 'The booking could not be found.');
    if (result === 'invalid_transition') {
      // Only one journey at a time: the store refuses "travel" while another of
      // this professional's bookings is on the way or in progress. Say so.
      if (action === 'travel') {
        const dashboard = await professionalReads.getDashboard(user.id);
        const active = dashboard?.jobs.find((job) => job.id !== professionalBookingActionMatch[1] && (job.status === 'on_the_way' || job.status === 'in_progress'));
        if (active) {
          throw new HttpError(409, 'JOURNEY_IN_PROGRESS', `You are still on the way to ${active.clientName}'s booking. Tap "I've arrived" and finish that visit, or cancel it, before starting another journey.`);
        }
      }
      throw new HttpError(409, 'INVALID_BOOKING_TRANSITION', 'This booking action is not allowed in its current state.');
    }
    if (result === 'invalid_travel_fee') {
      const { travelFeeCap } = await adminReads.getPlatformSettings();
      throw new HttpError(400, 'INVALID_TRAVEL_FEE', `The travel fee must be a whole number between 0 and ${travelFeeCap} ETB.`);
    }
    if (result === 'too_early') {
      throw new HttpError(409, 'BOOKING_NOT_STARTED', 'It is too early to start this journey. You can set off up to 3 hours before the appointment time.');
    }
    if (result === 'payment_required') {
      throw new HttpError(409, 'PAYMENT_REQUIRED', 'Payment must be secured before this booking can continue.');
    }
    const dashboard = await professionalReads.getDashboard(user.id);
    sendJson(response, 200, { dashboard });
    // The client is waiting on this answer: deliver their notification right away.
    runBackgroundJobsNow('professional_booking_transition');
    return;
  }

  const professionalBookingLocationMatch = url.pathname.match(/^\/v1\/professional\/bookings\/([^/]+)\/location$/);
  if (method === 'POST' && professionalBookingLocationMatch) {
    const { user } = authenticatedUser(request);
    if (user.role !== 'professional') throw new HttpError(403, 'FORBIDDEN', 'A professional account is required.');
    const body = await readJson(request);
    const coordinates = coordinateFields(body);
    if (coordinates.latitude === null || coordinates.longitude === null) {
      throw new HttpError(400, 'INVALID_INPUT', 'latitude and longitude are required.');
    }
    const bookingId = professionalBookingLocationMatch[1];
    const result = await bookingTracking.record({
      professionalId: user.id,
      bookingId,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      accuracyMeters: optionalNumberField(body, 'accuracyMeters'),
      heading: optionalNumberField(body, 'heading'),
      speedMps: optionalNumberField(body, 'speedMps'),
      areaLabel: optionalTextField(body, 'areaLabel', 200),
    });
    if (result === 'not_found') throw new HttpError(404, 'BOOKING_NOT_FOUND', 'The booking could not be found.');
    if (result === 'not_active') {
      throw new HttpError(409, 'TRACKING_NOT_ACTIVE', 'Location sharing is only recorded while you are on the way or on site.');
    }
    sendJson(response, 200, { tracking: (await bookingTracking.get(user.id, bookingId)) ?? null });
    return;
  }

  const bookingTrackingMatch = url.pathname.match(/^\/v1\/bookings\/([^/]+)\/tracking$/);
  if (method === 'GET' && bookingTrackingMatch) {
    const { user } = authenticatedUser(request);
    const tracking = await bookingTracking.get(user.id, bookingTrackingMatch[1]);
    if (tracking === undefined) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'The booking could not be found.');
    sendJson(response, 200, { tracking });
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/devices') {
    const { user } = authenticatedUser(request);
    const body = await readJson(request);
    const platform = textField(body, 'platform', { maxLength: 20 });
    const token = textField(body, 'token', { maxLength: 500 });
    if (!isDevicePlatform(platform) || !token || token.length < 12) {
      throw new HttpError(400, 'INVALID_DEVICE', 'The device registration is invalid.');
    }
    const device = await clientPreferences.registerDevice(user.id, platform, token);
    sendJson(response, 201, { device });
    return;
  }

  const deviceMatch = url.pathname.match(/^\/v1\/devices\/([^/]+)$/);
  if (method === 'DELETE' && deviceMatch) {
    const { user } = authenticatedUser(request);
    if (!await clientPreferences.unregisterDevice(user.id, deviceMatch[1])) {
      throw new HttpError(404, 'DEVICE_NOT_FOUND', 'The device registration could not be found.');
    }
    response.statusCode = 204;
    response.end();
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/notifications') {
    const { user } = authenticatedUser(request);
    sendJson(response, 200, { notifications: await clientReads.listNotifications(user.id) });
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/development/jobs/run') {
    authenticatedAdmin(request);
    if (config.authMode !== 'development') throw new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.');
    const body = await readJson(request);
    const requestedNow = textField(body, 'now', { optional: true, maxLength: 40 });
    const now = requestedNow ? new Date(requestedNow) : new Date();
    if (Number.isNaN(now.getTime())) throw new HttpError(400, 'INVALID_TIME', 'The worker time is invalid.');
    const result = await backgroundJobs.run(now);
    sendJson(response, 200, result);
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/client-data') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    sendJson(response, 200, await clientReads.getAccount(user.id));
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/client/identity') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    sendJson(response, 200, { identity: await clientReads.getIdentity(user.id) });
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/client/fayda/verify') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const body = await readJson(request);
    const identifier = textField(body, 'identifier', { maxLength: 16 });
    if (!identifier || !isValidFaydaIdentifier(identifier)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Enter a valid 12-digit FIN or 16-digit FAN/FCN.');
    }
    try {
      const identity = await verifyIdentity.client(user.id, identifier);
      sendJson(response, 200, { identity });
    } catch (error) {
      if (error instanceof IdentityVerificationError) {
        const unavailable = error.message.includes('not configured') || error.message.includes('could not be reached');
        throw new HttpError(
          unavailable ? 503 : 422,
          unavailable ? 'FAYDA_UNAVAILABLE' : 'FAYDA_NOT_VERIFIED',
          unavailable ? 'Identity verification is temporarily unavailable.' : 'The identity details could not be verified. Check the number and name and try again.',
        );
      }
      throw error;
    }
    return;
  }

  if (method === 'PUT' && url.pathname === '/v1/client/account') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const body = await readJson(request);
    const fullName = textField(body, 'fullName', { maxLength: 120 });
    const preferredLanguage = textField(body, 'preferredLanguage', { maxLength: 2 });
    if (!fullName || fullName.length < 2 || !isClientPreferredLanguage(preferredLanguage)) {
      throw new HttpError(400, 'INVALID_INPUT', 'Enter a valid name and preferred language.');
    }

    let address: { label: string; zone: string; detail: string } | undefined;
    if (body.address !== undefined && body.address !== null) {
      if (typeof body.address !== 'object' || Array.isArray(body.address)) {
        throw new HttpError(400, 'INVALID_INPUT', 'The saved address is not valid.');
      }
      const addressBody = body.address as JsonRecord;
      const label = textField(addressBody, 'label', { maxLength: 80 });
      const zone = textField(addressBody, 'zone', { maxLength: 80 });
      const detail = textField(addressBody, 'detail', { maxLength: 500 });
      if (!label || !zone || !detail || detail.length < 8) {
        throw new HttpError(400, 'INVALID_INPUT', 'Complete the saved address.');
      }
      const serviceZone = await marketplaceReads.findServiceZone(zone);
      if (!serviceZone) throw new HttpError(400, 'SERVICE_ZONE_UNAVAILABLE', 'Choose an active Konjo service zone.');
      address = { label, zone: serviceZone.label, detail };
    }

    const result = await clientAccounts.completeOnboarding(user.id, {
      fullName,
      phoneNumber: user.phoneNumber,
      preferredLanguage,
      address,
    });
    if (result.result === 'service_zone_unavailable') {
      throw new HttpError(400, 'SERVICE_ZONE_UNAVAILABLE', 'Choose an active Konjo service zone.');
    }
    if (result.result === 'identity_documents_required') {
      throw new HttpError(400, 'IDENTITY_DOCUMENTS_REQUIRED', 'Upload your passport or both sides of your ID before completing registration.');
    }
    if (result.result === 'client_not_found') {
      throw new HttpError(404, 'CLIENT_NOT_FOUND', 'The client account could not be found.');
    }
    sendJson(response, 200, { account: result.account });
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/client/addresses') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const body = await readJson(request);
    const label = textField(body, 'label', { maxLength: 80 });
    const zone = textField(body, 'zone', { maxLength: 80 });
    const detail = textField(body, 'detail', { maxLength: 500 });
    const makeDefault = body.makeDefault ?? false;
    if (!label || !zone || !detail || detail.length < 8 || typeof makeDefault !== 'boolean') {
      throw new HttpError(400, 'INVALID_INPUT', 'Complete the saved address.');
    }
    const coordinates = coordinateFields(body);
    const serviceZone = await marketplaceReads.findServiceZone(zone);
    if (!serviceZone) throw new HttpError(400, 'SERVICE_ZONE_UNAVAILABLE', 'Choose an active Konjo service zone.');
    const result = await clientAddresses.create(user.id, { label, zone: serviceZone.label, detail, makeDefault, ...coordinates });
    if (result.result !== 'updated') throw new HttpError(400, 'SERVICE_ZONE_UNAVAILABLE', 'Choose an active Konjo service zone.');
    sendJson(response, 201, { address: result.address });
    return;
  }

  const addressDefaultMatch = url.pathname.match(/^\/v1\/client\/addresses\/([^/]+)\/default$/);
  if (method === 'POST' && addressDefaultMatch) {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    if (!await clientAddresses.setDefault(user.id, addressDefaultMatch[1])) {
      throw new HttpError(404, 'ADDRESS_NOT_FOUND', 'The saved address could not be found.');
    }
    response.statusCode = 204;
    response.end();
    return;
  }

  const addressMatch = url.pathname.match(/^\/v1\/client\/addresses\/([^/]+)$/);
  if (addressMatch && (method === 'PATCH' || method === 'DELETE')) {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const addressId = addressMatch[1];
    if (method === 'DELETE') {
      if (!await clientAddresses.delete(user.id, addressId)) {
        throw new HttpError(404, 'ADDRESS_NOT_FOUND', 'The saved address could not be found.');
      }
      response.statusCode = 204;
      response.end();
      return;
    }

    const body = await readJson(request);
    const label = textField(body, 'label', { maxLength: 80 });
    const zone = textField(body, 'zone', { maxLength: 80 });
    const detail = textField(body, 'detail', { maxLength: 500 });
    if (!label || !zone || !detail || detail.length < 8) {
      throw new HttpError(400, 'INVALID_INPUT', 'Complete the saved address.');
    }
    const coordinates = coordinateFields(body);
    const serviceZone = await marketplaceReads.findServiceZone(zone);
    if (!serviceZone) throw new HttpError(400, 'SERVICE_ZONE_UNAVAILABLE', 'Choose an active Konjo service zone.');
    const result = await clientAddresses.update(user.id, addressId, { label, zone: serviceZone.label, detail, ...coordinates });
    if (result.result === 'service_zone_unavailable') throw new HttpError(400, 'SERVICE_ZONE_UNAVAILABLE', 'Choose an active Konjo service zone.');
    if (result.result === 'not_found') throw new HttpError(404, 'ADDRESS_NOT_FOUND', 'The saved address could not be found.');
    sendJson(response, 200, { address: result.address });
    return;
  }

  const favoriteMatch = url.pathname.match(/^\/v1\/client\/favorites\/([^/]+)$/);
  if (favoriteMatch && (method === 'PUT' || method === 'DELETE')) {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const result = await clientPreferences.setFavorite(user.id, favoriteMatch[1], method === 'PUT');
    if (result === 'professional_not_found') {
      throw new HttpError(404, 'PROFESSIONAL_NOT_FOUND', 'The professional could not be found.');
    }
    response.statusCode = 204;
    response.end();
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/client/blocked-professionals') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    sendJson(response, 200, { professionalIds: await trustSafety.listBlockedProfessionals(user.id) });
    return;
  }

  const blockedProfessionalMatch = url.pathname.match(/^\/v1\/client\/blocked-professionals\/([^/]+)$/);
  if (blockedProfessionalMatch && (method === 'PUT' || method === 'DELETE')) {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const professionalId = decodeURIComponent(blockedProfessionalMatch[1]);
    if (!isUuid(professionalId)) throw new HttpError(400, 'INVALID_PROFESSIONAL', 'Choose a valid professional.');
    const updated = await trustSafety.setProfessionalBlocked(user.id, professionalId, method === 'PUT');
    if (!updated) throw new HttpError(404, 'PROFESSIONAL_NOT_FOUND', 'The professional could not be found.');
    response.statusCode = 204;
    response.end();
    return;
  }

  if (method === 'POST' && url.pathname === '/v1/content-reports') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const body = await readJson(request);
    const targetType = textField(body, 'targetType', { maxLength: 20 });
    const targetId = textField(body, 'targetId', { maxLength: 80 });
    const reason = textField(body, 'reason', { maxLength: 40 });
    const details = textField(body, 'details', { maxLength: 1000 }) ?? '';
    const validTarget = targetType === 'professional' || targetType === 'review';
    const validReason = reason === 'harassment' || reason === 'inappropriate_content' ||
      reason === 'fraud_or_spam' || reason === 'safety_concern' || reason === 'other';
    if (!validTarget || !targetId || !isUuid(targetId) || !validReason) {
      throw new HttpError(400, 'INVALID_CONTENT_REPORT', 'Choose what happened and try again.');
    }
    const result = await trustSafety.createContentReport(
      user.id,
      targetType as ApiContentReportTarget,
      targetId,
      reason as ApiContentReportReason,
      details,
    );
    if (result.result === 'not_found') throw new HttpError(404, 'REPORT_TARGET_NOT_FOUND', 'This content is no longer available.');
    sendJson(response, result.result === 'created' ? 201 : 200, {
      contentReport: result.report,
      duplicate: result.result === 'existing',
    });
    return;
  }

  if (method === 'PATCH' && url.pathname === '/v1/client/notification-preferences') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const preferences = await clientPreferences.updateNotifications(user.id, notificationPreferences(await readJson(request)));
    sendJson(response, 200, { notificationPreferences: preferences });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/professionals') {
    const query = url.searchParams.get('query')?.trim() || undefined;
    const category = url.searchParams.get('category')?.trim() || undefined;
    const zone = url.searchParams.get('zone')?.trim() || undefined;
    if ([query, category, zone].some((value) => value && value.length > 100)) {
      throw new HttpError(400, 'INVALID_FILTER', 'A catalog filter is too long.');
    }
    const featuredValue = url.searchParams.get('featured');
    const availableValue = url.searchParams.get('available');
    if (featuredValue && featuredValue !== 'true' && featuredValue !== 'false') {
      throw new HttpError(400, 'INVALID_FILTER', 'featured must be true or false.');
    }
    if (availableValue && availableValue !== 'true' && availableValue !== 'false') {
      throw new HttpError(400, 'INVALID_FILTER', 'available must be true or false.');
    }
    sendJson(response, 200, {
      professionals: await marketplaceReads.listProfessionals({
        query,
        category,
        zone,
        ...(featuredValue ? { featured: featuredValue === 'true' } : {}),
        ...(availableValue ? { available: availableValue === 'true' } : {}),
      }),
    });
    return;
  }

  if (method === 'GET' && url.pathname === '/v1/portfolio-feed') {
    const requested = Number(url.searchParams.get('limit') ?? 18);
    const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 40) : 18;
    sendJson(response, 200, { items: await professionalPortfolio.listFeed(limit) });
    return;
  }

  const portfolioMatch = url.pathname.match(/^\/v1\/professionals\/([^/]+)\/portfolio$/);
  if (method === 'GET' && portfolioMatch) {
    const professionalId = decodeURIComponent(portfolioMatch[1]);
    if (!isUuid(professionalId)) {
      sendJson(response, 200, { portfolio: [] });
      return;
    }
    sendJson(response, 200, {
      portfolio: await professionalPortfolio.listApproved(professionalId),
    });
    return;
  }

  // Shareable profile link: a plain HTML page any chat app can open, with a
  // button into the Konjo app. No authentication, no private data.
  const publicProfileMatch = url.pathname.match(/^\/p\/([A-Za-z0-9_-]{1,80})$/);
  if (method === 'GET' && publicProfileMatch) {
    const professionalId = publicProfileMatch[1];
    const professional = (await marketplaceReads.listProfessionals({})).find((item) => item.id === professionalId);
    const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="Book verified at-home beauty professionals in Addis Ababa with Konjo."><style>body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#FAF9F5;color:#1F2A1F;display:flex;min-height:100vh;align-items:center;justify-content:center}main{width:min(440px,92vw);background:#fff;border:1px solid #E3E6DE;border-radius:16px;padding:28px}h1{font-size:24px;margin:0 0 4px}p{color:#5B675B;line-height:1.5;margin:8px 0}.rating{color:#B07D0A;font-weight:600}.brand{font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#3F6B3A;margin-bottom:12px}a.button{display:block;text-align:center;margin-top:20px;padding:15px;border-radius:10px;background:#3F6B3A;color:#fff;font-weight:600;text-decoration:none}.hint{font-size:12px;color:#8A948A;margin-top:12px}</style></head><body><main>${body}</main></body></html>`;
    if (!professional) {
      sendHtml(response, 404, page('Konjo', '<div class="brand">Konjo</div><h1>Profile unavailable</h1><p>This professional is not taking bookings on Konjo right now.</p><a class="button" href="konjoclient://browse">Open Konjo</a>'));
      return;
    }
    const rating = professional.reviewCount ? `<p class="rating">★ ${escapeHtml(professional.rating.toFixed(1))} · ${professional.reviewCount} review${professional.reviewCount === 1 ? '' : 's'}</p>` : '<p class="rating">New on Konjo</p>';
    const openLink = `konjoclient://professional/${encodeURIComponent(professional.id)}`;
    sendHtml(response, 200, page(`${professional.displayName} on Konjo`, `<div class="brand">Konjo · at-home beauty</div><h1>${escapeHtml(professional.displayName)}</h1><p>${escapeHtml(professional.specialty)} · ${escapeHtml(professional.baseZone)}</p>${rating}<p>${escapeHtml(professional.bio)}</p><a class="button" href="${escapeHtml(openLink)}">Book in the Konjo app</a><p class="hint">Don't have Konjo yet? Install it from the Play Store, then open this link again.</p>`));
    return;
  }

  const reviewsMatch = url.pathname.match(/^\/v1\/professionals\/([^/]+)\/reviews$/);
  if (method === 'GET' && reviewsMatch) {
    const professionalId = decodeURIComponent(reviewsMatch[1]);
    const requestedLimit = url.searchParams.get('limit');
    const limit = requestedLimit === null ? 20 : Number(requestedLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new HttpError(400, 'INVALID_LIMIT', 'The reviews limit must be between 1 and 100.');
    }
    sendJson(response, 200, { reviews: await marketplaceReads.listProfessionalReviews(professionalId, limit) });
    return;
  }

  const availabilityMatch = url.pathname.match(/^\/v1\/professionals\/([^/]+)\/availability$/);
  if (method === 'GET' && availabilityMatch) {
    const dateIso = url.searchParams.get('date');
    const serviceId = url.searchParams.get('serviceId')?.trim() || undefined;
    const excludeBookingId = url.searchParams.get('excludeBookingId')?.trim() || undefined;
    if (!isBookableDate(dateIso)) {
      throw new HttpError(400, 'INVALID_DATE', 'Choose a valid current or future date.');
    }
    const availability = await professionalReads.getAvailability(
      decodeURIComponent(availabilityMatch[1]),
      dateIso,
      serviceId,
      excludeBookingId,
    );
    if (!availability) {
      throw new HttpError(404, 'PROFESSIONAL_NOT_FOUND', 'The professional could not be found.');
    }
    sendJson(response, 200, { availability });
    return;
  }

  if (url.pathname === '/v1/bookings') {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    if (method === 'GET') {
      sendJson(response, 200, { bookings: await clientReads.listBookings(user.id) });
      return;
    }
    if (method === 'POST') {
      const body = await readJson(request);
      const requestId = textField(body, 'requestId', { maxLength: 100 });
      const professionalId = textField(body, 'professionalId', { maxLength: 80 });
      const serviceId = textField(body, 'serviceId', { maxLength: 100 });
      const dateIso = textField(body, 'dateIso', { maxLength: 10 });
      const time = textField(body, 'time', { maxLength: 20 });
      const addressLabel = textField(body, 'addressLabel', { maxLength: 80 });
      const addressZone = textField(body, 'addressZone', { maxLength: 80 });
      const addressDetail = textField(body, 'addressDetail', { maxLength: 500 });
      const paymentMethod = textField(body, 'paymentMethod', { maxLength: 20 });
      if (config.paymentMode === 'cash_only' && paymentMethod !== 'cash') {
        throw new HttpError(400, 'PAYMENT_METHOD_UNAVAILABLE', 'Online payment is not available yet. Choose cash and pay the professional after the service.');
      }
      if (config.paymentMode === 'chapa' && paymentMethod === 'cash' && config.authMode === 'provider') {
        throw new HttpError(400, 'ONLINE_DEPOSIT_REQUIRED', 'Choose Telebirr, CBE Birr or card for the 50% deposit.');
      }
      const addressId = textField(body, 'addressId', { optional: true, maxLength: 100 });
      // The app no longer asks for a female-only match: clients choose by the
      // professional's registered gender instead. Older clients may still send it.
      const femaleOnly = body.femaleOnly ?? false;
      if (!requestId || !/^[a-zA-Z0-9_-]{12,100}$/.test(requestId) || !professionalId || !serviceId || !isBookableDate(dateIso) || !time || !addressLabel || !addressZone || !addressDetail || addressDetail.length < 8 || !isBookingPaymentMethod(paymentMethod) || typeof femaleOnly !== 'boolean') {
        throw new HttpError(400, 'INVALID_INPUT', 'Complete all booking details.');
      }
      if (addressId && !/^[A-Za-z0-9_-]{1,100}$/.test(addressId)) {
        throw new HttpError(400, 'INVALID_INPUT', 'The saved address reference is not valid.');
      }
      const serviceZone = await marketplaceReads.findServiceZone(addressZone);
      if (!serviceZone) throw new HttpError(400, 'SERVICE_ZONE_UNAVAILABLE', 'That address is outside Konjo’s active service zones.');
      if (await marketplaceReads.bookingRequiresClientIdentity(user.id, professionalId)) {
        throw new HttpError(409, 'CLIENT_IDENTITY_REQUIRED', 'Verify your Fayda identity before your first massage booking.');
      }
      const result = await createBooking.execute({
        requestId,
        clientId: user.id,
        professionalId,
        serviceId,
        dateIso,
        time,
        addressLabel,
        addressZone: serviceZone.label,
        addressDetail,
        ...(addressId ? { addressId } : {}),
        femaleOnly,
        paymentMethod,
      });
      if (!result) {
        // Name the exact blocker so the client can fix it, instead of one vague message.
        const reason = await createBooking.explainUnavailability({
          requestId,
          clientId: user.id,
          professionalId,
          serviceId,
          dateIso,
          time,
          addressLabel,
          addressZone: serviceZone.label,
          addressDetail,
          ...(addressId ? { addressId } : {}),
          femaleOnly,
          paymentMethod,
        });
        switch (reason) {
          case 'client_unavailable':
            throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
          case 'professional_unavailable':
            throw new HttpError(409, 'PROFESSIONAL_UNAVAILABLE', 'This professional is not taking bookings right now. Choose another professional.');
          case 'professional_busy':
            throw new HttpError(409, 'PROFESSIONAL_BUSY', 'This professional already has an accepted booking and cannot take another booking until it is checked out. Try again later or choose another professional.');
          case 'service_unavailable':
            throw new HttpError(409, 'SERVICE_UNAVAILABLE', 'This professional no longer offers that service. Choose another service.');
          case 'female_only_unavailable':
            throw new HttpError(400, 'FEMALE_ONLY_UNAVAILABLE', 'This professional is not approved for female-only bookings. Choose another professional.');
          case 'zone_unavailable':
            throw new HttpError(400, 'SERVICE_ZONE_UNAVAILABLE', 'That address is outside Konjo’s active service zones.');
          case 'identity_required':
            throw new HttpError(409, 'CLIENT_IDENTITY_REQUIRED', 'Verify your Fayda identity before your first massage booking.');
          case 'time_unavailable':
            throw new HttpError(409, 'TIME_UNAVAILABLE', 'That date or time is no longer available. Pick another time.');
          default:
            throw new HttpError(
              400,
              'BOOKING_UNAVAILABLE',
              'The selected professional, service, zone, or time is unavailable.',
            );
        }
      }
      sendJson(response, result.duplicate ? 200 : 201, result);
      // Wake the professional's phone now rather than on the next worker tick.
      if (!result.duplicate) runBackgroundJobsNow('booking_requested');
      return;
    }
  }

  const verifyBookingPaymentMatch = url.pathname.match(/^\/v1\/bookings\/([^/]+)\/payment\/verify$/);
  if (method === 'POST' && verifyBookingPaymentMatch) {
    // The app asks after the hosted checkout closes; the webhook remains authoritative.
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const bookingId = verifyBookingPaymentMatch[1];
    let result;
    try {
      result = await verifyBookingPayment.execute(user.id, bookingId);
    } catch (error) {
      if (error instanceof PaymentProviderError) {
        logger.error('payment_provider_verify_failed', { bookingId, error: error.message });
        throw new HttpError(502, 'PAYMENT_PROVIDER_UNAVAILABLE', config.production ? 'The payment provider could not confirm this payment yet. Please try again shortly.' : error.message);
      }
      throw error;
    }
    if (result.result === 'not_found') throw new HttpError(404, 'BOOKING_NOT_FOUND', 'The booking could not be found.');
    if (result.result === 'no_pending_payment') throw new HttpError(409, 'NO_PENDING_PAYMENT', 'There is no payment waiting to be verified.');
    if (result.result === 'verified' && result.status === 'captured') runBackgroundJobsNow('payment_verified');
    sendJson(response, 200, {
      paymentIntent: result.paymentIntent,
      status: result.result === 'verified' ? result.status : 'pending',
      verified: result.result === 'verified',
    });
    return;
  }

  const initiateBookingPaymentMatch = url.pathname.match(/^\/v1\/bookings\/([^/]+)\/payment$/);
  if (method === 'POST' && initiateBookingPaymentMatch) {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const bookingId = initiateBookingPaymentMatch[1];
    const clientPlatform = request.headers['x-client-platform'];
    let returnUrl: string | undefined;
    if (typeof clientPlatform === 'string' && (clientPlatform.toLowerCase() === 'ios' || clientPlatform.toLowerCase() === 'android')) {
      returnUrl = `konjoclient://booking/${encodeURIComponent(bookingId)}`;
    }
    let result;
    try {
      result = await initiateBookingPayment.execute(user.id, bookingId, { returnUrl, customer: paymentCustomer(user) });
    } catch (error) {
      if (error instanceof PaymentProviderError) {
        logger.error('payment_provider_rejected', { bookingId, error: error.message });
        throw new HttpError(502, 'PAYMENT_PROVIDER_REJECTED', config.production ? 'The payment could not be started right now. Please try again shortly.' : error.message);
      }
      throw error;
    }
    if (result.result === 'not_found') {
      throw new HttpError(404, 'BOOKING_NOT_FOUND', 'The booking could not be found.');
    }
    if (result.result === 'not_accepted') {
      throw new HttpError(409, 'BOOKING_NOT_ACCEPTED', 'The deposit is available after acceptance; the final balance is available after checkout.');
    }
    sendJson(response, result.result === 'created' ? 201 : 200, {
      paymentIntent: result.paymentIntent,
      duplicate: result.result === 'duplicate',
    });
    return;
  }

  const paymentIntentMatch = url.pathname.match(/^\/v1\/payments\/([^/]+)$/);
  if (method === 'GET' && paymentIntentMatch) {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const paymentIntent = await clientReads.getPaymentIntent(user.id, paymentIntentMatch[1]);
    if (!paymentIntent) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'The payment could not be found.');
    sendJson(response, 200, { paymentIntent });
    return;
  }

  const ledgerAuditMatch = url.pathname.match(/^\/v1\/development\/payments\/([^/]+)\/ledger-audit$/);
  if (method === 'GET' && ledgerAuditMatch) {
    const { user } = authenticatedUser(request);
    if (config.authMode !== 'development') throw new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.');
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const audit = await clientReads.auditPaymentLedger(user.id, ledgerAuditMatch[1]);
    if (!audit) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'The payment could not be found.');
    sendJson(response, 200, { audit });
    return;
  }

  const sandboxCheckoutMatch = url.pathname.match(/^\/v1\/payments\/sandbox-checkout\/(telebirr|cbe|card)\/(chapa_sandbox_[a-f0-9]{32})$/);
  if (sandboxCheckoutMatch && config.paymentSandboxCheckout && (method === 'GET' || method === 'POST')) {
    // Stand-in for the provider's hosted checkout while no Chapa key is set:
    // one button that records a captured payment through the same webhook
    // path the real provider uses.
    const provider = sandboxCheckoutMatch[1] as 'telebirr' | 'cbe' | 'card';
    const providerReference = sandboxCheckoutMatch[2];
    const providerLabel = { telebirr: 'Telebirr', cbe: 'CBE Birr', card: 'Card' }[provider];
    const shell = (title: string, content: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#FAF9F5;color:#1F2A1F;display:flex;min-height:100vh;align-items:center;justify-content:center}main{width:min(440px,92vw);background:#fff;border:1px solid #E3E6DE;border-radius:16px;padding:28px}h1{font-size:22px;margin:0 0 8px}p{color:#5B675B;line-height:1.5}button{width:100%;min-height:52px;border:0;border-radius:10px;background:#3F6B3A;color:#fff;font-size:16px;font-weight:600;cursor:pointer}.tag{display:inline-block;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#7D5B14;background:#FFF4DE;border-radius:999px;padding:4px 10px;margin-bottom:12px}</style></head><body><main>${content}</main></body></html>`;
    if (method === 'GET') {
      sendHtml(response, 200, shell('Konjo sandbox checkout', `<span class="tag">Sandbox · no money moves</span><h1>Pay with ${escapeHtml(providerLabel)}</h1><p>This page stands in for the ${escapeHtml(providerLabel)} checkout while Konjo runs without a live payment key. Confirming records the payment as captured, exactly as the provider webhook would.</p><form method="post" action="${escapeHtml(url.pathname)}"><button type="submit">Confirm payment</button></form>`));
      return;
    }
    const rawBody = JSON.stringify({ eventId: `sandbox:${providerReference}:captured`, providerReference, status: 'captured' });
    const result = await processPaymentWebhook.execute({
      rawBody,
      eventId: `sandbox:${providerReference}:captured`,
      provider,
      providerReference,
      status: 'captured',
    });
    if (result.result === 'not_found') {
      sendHtml(response, 404, shell('Payment not found', '<h1>Payment not found</h1><p>This checkout link does not match an open payment. Return to the Konjo app and tap Pay now again.</p>'));
      return;
    }
    if (result.result === 'invalid_transition') {
      sendHtml(response, 409, shell('Payment already settled', '<h1>Already settled</h1><p>This payment was already completed. You can return to the Konjo app.</p>'));
      return;
    }
    sendHtml(response, 200, shell('Payment complete', `<span class="tag">Sandbox</span><h1>Payment complete</h1><p>ETB ${escapeHtml(String(result.paymentIntent.amount))} recorded as captured via ${escapeHtml(providerLabel)}. Return to the Konjo app; the booking updates automatically.</p>`));
    return;
  }

  const paymentWebhookMatch = url.pathname.match(/^\/v1\/payments\/webhooks\/(telebirr|cbe|card)$/);
  if (method === 'POST' && paymentWebhookMatch) {
    const provider = paymentWebhookMatch[1] as 'telebirr' | 'cbe' | 'card';
    const { body, rawBody } = await readRawJson(request);
    const rawSignature = request.headers[config.chapaSecretKey ? 'x-chapa-signature' : 'x-konjo-signature'];
    const signature = Array.isArray(rawSignature) ? rawSignature[0] : rawSignature;
    if (!processPaymentWebhook.verify(rawBody, signature)) {
      throw new HttpError(401, 'INVALID_WEBHOOK_SIGNATURE', 'The payment webhook signature is invalid.');
    }
    let providerReference: string | null | undefined;
    let status: string | null | undefined;
    let eventId: string | null | undefined;
    if (config.chapaSecretKey) {
      // Chapa v2: `event` + `merchant_reference` (+ `mode`); v1 sent `tx_ref` + `status`.
      const mode = textField(body, 'mode', { optional: true, maxLength: 10 });
      if (mode && paymentKeyMode && mode !== paymentKeyMode) {
        throw new HttpError(400, 'INVALID_PAYMENT_EVENT', 'The payment event belongs to a different Chapa environment.');
      }
      providerReference = textField(body, 'merchant_reference', { optional: true, maxLength: 200 }) ??
        textField(body, 'tx_ref', { optional: true, maxLength: 200 });
      const event = textField(body, 'event', { optional: true, maxLength: 60 });
      const outcome = event ? chapaEventOutcome(event) : chapaStatusOutcome(textField(body, 'status', { optional: true, maxLength: 20 }));
      if (outcome === 'ignored') {
        // Refund, payout and intermediate events are acknowledged but not payment outcomes.
        sendJson(response, 200, { ignored: true });
        return;
      }
      status = outcome ?? '';
      eventId = providerReference ? `chapa:${providerReference}:${status}` : undefined;
    } else {
      providerReference = textField(body, 'providerReference', { maxLength: 200 });
      status = textField(body, 'status', { maxLength: 20 });
      eventId = textField(body, 'eventId', { maxLength: 120 });
    }
    if (!eventId || !providerReference || !status || !isWebhookPaymentStatus(status)) {
      throw new HttpError(400, 'INVALID_PAYMENT_EVENT', 'The payment event is invalid.');
    }
    const result = await processPaymentWebhook.execute({
      rawBody,
      eventId,
      provider,
      providerReference,
      status,
    });
    if (result.result === 'not_found') throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'The payment could not be found.');
    if (result.result === 'invalid_transition') {
      throw new HttpError(409, 'INVALID_PAYMENT_TRANSITION', 'The payment event is not valid in its current state.');
    }
    sendJson(response, 200, { paymentIntent: result.paymentIntent, duplicate: result.result === 'duplicate' });
    return;
  }

  const reviewMatch = url.pathname.match(/^\/v1\/bookings\/([^/]+)\/review$/);
  if (method === 'POST' && reviewMatch) {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const body = await readJson(request);
    const techniqueRating = body.techniqueRating;
    const professionalismRating = body.professionalismRating;
    const reviewText = textField(body, 'reviewText', { optional: true, maxLength: 2000 }) ?? '';
    const tags = body.tags;
    if (
      typeof techniqueRating !== 'number' ||
      !Number.isInteger(techniqueRating) ||
      techniqueRating < 1 ||
      techniqueRating > 5 ||
      typeof professionalismRating !== 'number' ||
      !Number.isInteger(professionalismRating) ||
      professionalismRating < 1 ||
      professionalismRating > 5 ||
      !Array.isArray(tags) ||
      tags.length > 5 ||
      !tags.every((tag) => typeof tag === 'string' && tag.trim().length > 0 && tag.trim().length <= 40)
    ) {
      throw new HttpError(400, 'INVALID_INPUT', 'Choose both ratings and up to five feedback tags.');
    }
    const result = await submitBookingReview.execute({
      clientId: user.id,
      bookingId: reviewMatch[1],
      techniqueRating,
      professionalismRating,
      tags: tags as string[],
      reviewText,
    });
    if (result.result === 'not_found') {
      throw new HttpError(404, 'BOOKING_NOT_FOUND', 'The booking could not be found.');
    }
    if (result.result === 'not_completed') {
      throw new HttpError(409, 'REVIEW_NOT_ALLOWED', 'A review can be submitted only after the booking is completed.');
    }
    if (result.result === 'already_reviewed') {
      throw new HttpError(409, 'REVIEW_ALREADY_SUBMITTED', 'A review was already submitted for this booking.');
    }
    sendJson(response, 201, { review: result.review });
    return;
  }

  const sosMatch = url.pathname.match(/^\/v1\/bookings\/([^/]+)\/sos$/);
  if (method === 'POST' && sosMatch) {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client' && user.role !== 'professional') {
      throw new HttpError(403, 'FORBIDDEN', 'A booking participant is required.');
    }
    const body = await readJson(request);
    const latitude = body.latitude ?? null;
    const longitude = body.longitude ?? null;
    const accuracyMeters = body.accuracyMeters ?? null;
    const coordinatesValid = (
      latitude === null && longitude === null && accuracyMeters === null
    ) || (
      typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
      typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
      typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) && accuracyMeters >= 0
    );
    if (!coordinatesValid) throw new HttpError(400, 'INVALID_LOCATION', 'The emergency location is invalid.');
    const result = await trustSafety.openSafetyIncident({
      userId: user.id,
      role: user.role,
      bookingId: sosMatch[1],
      latitude,
      longitude,
      accuracyMeters,
    });
    if (result.result === 'not_found') throw new HttpError(404, 'BOOKING_NOT_FOUND', 'The booking could not be found.');
    if (result.result === 'not_active') throw new HttpError(409, 'SOS_NOT_AVAILABLE', 'SOS is available only during an active visit.');
    sendJson(response, result.result === 'created' ? 201 : 200, {
      safetyIncident: result.incident,
      duplicate: result.result === 'existing',
    });
    return;
  }

  const disputeMatch = url.pathname.match(/^\/v1\/bookings\/([^/]+)\/dispute$/);
  if (method === 'POST' && disputeMatch) {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const body = await readJson(request);
    const reason = textField(body, 'reason', { maxLength: 1000 });
    if (!reason || reason.length < 10) throw new HttpError(400, 'INVALID_DISPUTE', 'Describe the issue in at least ten characters.');
    const dispute = await trustSafety.openBookingDispute(user.id, disputeMatch[1], reason);
    if (!dispute) throw new HttpError(409, 'DISPUTE_NOT_AVAILABLE', 'This booking cannot accept another dispute.');
    sendJson(response, 201, { dispute });
    return;
  }

  const rescheduleMatch = url.pathname.match(/^\/v1\/bookings\/([^/]+)\/schedule$/);
  if (method === 'PATCH' && rescheduleMatch) {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const body = await readJson(request);
    const dateIso = textField(body, 'dateIso', { maxLength: 10 });
    const time = textField(body, 'time', { maxLength: 20 });
    if (!isBookableDate(dateIso) || !time) {
      throw new HttpError(400, 'INVALID_INPUT', 'Choose a valid future date and time.');
    }
    const result = await rescheduleBooking.execute({
      clientId: user.id,
      bookingId: rescheduleMatch[1],
      dateIso,
      time,
    });
    if (result.result === 'not_found') {
      throw new HttpError(404, 'BOOKING_NOT_FOUND', 'The booking could not be found.');
    }
    if (result.result === 'not_allowed') {
      throw new HttpError(409, 'RESCHEDULE_NOT_ALLOWED', 'This booking can no longer be rescheduled.');
    }
    if (result.result === 'slot_unavailable') {
      throw new HttpError(409, 'SLOT_UNAVAILABLE', 'That time is no longer available. Choose another slot.');
    }
    sendJson(response, 200, { booking: result.booking });
    return;
  }

  const archiveBookingMatch = url.pathname.match(/^\/v1\/bookings\/([^/]+)\/archive$/);
  if (method === 'POST' && archiveBookingMatch) {
    // Client removes a finished booking from their history; records are kept.
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const result = await archiveBooking.execute({ clientId: user.id, bookingId: archiveBookingMatch[1] });
    if (result === 'not_found') throw new HttpError(404, 'BOOKING_NOT_FOUND', 'The booking could not be found.');
    if (result === 'not_allowed') throw new HttpError(409, 'ARCHIVE_NOT_ALLOWED', 'Only completed or cancelled bookings can be removed from your history.');
    response.statusCode = 204;
    response.end();
    return;
  }

  const bookingMatch = url.pathname.match(/^\/v1\/bookings\/([^/]+)$/);
  if (method === 'DELETE' && bookingMatch) {
    const { user } = authenticatedUser(request);
    if (user.role !== 'client') throw new HttpError(403, 'FORBIDDEN', 'A client account is required.');
    const bookingId = bookingMatch[1];
    const result = await cancelBooking.execute({ clientId: user.id, bookingId });
    if (result === 'not_found') throw new HttpError(404, 'BOOKING_NOT_FOUND', 'The booking could not be found.');
    if (result === 'not_allowed') {
      throw new HttpError(409, 'CANCELLATION_NOT_ALLOWED', 'This booking can no longer be cancelled.');
    }
    response.statusCode = 204;
    response.end();
    runBackgroundJobsNow('client_booking_cancelled');
    return;
  }

  throw new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.');
}

/**
 * Platform-neutral Node HTTP handler.
 *
 * The local Node entry point passes real IncomingMessage/ServerResponse
 * objects. Supabase Edge Functions pass small compatible adapters so the same
 * reviewed routing and validation code can run without a second API contract.
 */
export async function handleHttpRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const correlationId = requestId(request);
  const startedAt = Date.now();
  response.setHeader('X-Request-Id', correlationId);
  setSecurityHeaders(response);
  response.once('finish', () => {
    logger.info('http_request_completed', {
      requestId: correlationId,
      method: request.method ?? 'GET',
      path: (request.url ?? '/').split('?')[0],
      status: response.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  try {
    applyCors(request, response);
    enforceRateLimit(request);
    await route(request, response);
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(response, error.status, errorBody(error.code, error.message));
      return;
    }
    logger.error('http_request_failed', {
      requestId: correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    sendJson(response, 500, errorBody('INTERNAL_ERROR', 'The request could not be completed.'));
  }
}

const isNodeEntrypoint = Boolean(process.argv[1]) &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const server = isNodeEntrypoint ? createServer(handleHttpRequest) : null;

// Runs the worker immediately after something a person is waiting on (a new
// request, an acceptance, a cancellation) so push notifications go out within
// seconds instead of on the next timer tick. Overlapping calls coalesce into a
// single follow-up run so the worker never executes concurrently with itself.
let backgroundRunInFlight: Promise<void> | null = null;
let backgroundRunQueued = false;
function runBackgroundJobsNow(trigger: string): void {
  if (!config.inProcessJobs) return;
  if (backgroundRunInFlight) {
    backgroundRunQueued = true;
    return;
  }
  backgroundRunInFlight = backgroundJobs.run()
    .then(() => undefined)
    .catch((error: unknown) => {
      logger.error('background_jobs_failed', {
        trigger,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    })
    .finally(() => {
      backgroundRunInFlight = null;
      if (backgroundRunQueued) {
        backgroundRunQueued = false;
        runBackgroundJobsNow(trigger);
      }
    });
}

// Provider deployments with an external scheduler can disable the in-process
// worker by setting KONJO_IN_PROCESS_JOBS=false.
const backgroundTimer = config.inProcessJobs
  ? setInterval(() => {
      void backgroundJobs.run().catch((error: unknown) => {
        logger.error('background_jobs_failed', {
          trigger: 'in_process_timer',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, 60_000)
  : null;
backgroundTimer?.unref();

server?.listen(config.port, config.host, () => {
  logger.info('api_listening', { host: config.host, port: config.port });
});

let shuttingDown = false;

function shutdown() {
  if (shuttingDown || !server) return;
  shuttingDown = true;
  if (backgroundTimer) clearInterval(backgroundTimer);
  server.close((error) => {
    if (error) {
      logger.error('api_shutdown_failed', { error: error.message });
      process.exitCode = 1;
    }
    database.close();
    logger.info('api_stopped');
  });
}

if (server) {
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
