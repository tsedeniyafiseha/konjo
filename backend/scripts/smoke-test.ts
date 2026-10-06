import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import type {
  ApiBooking,
  ApiAdminAuditLog,
  ApiAdminBroadcast,
  ApiAdminZone,
  ApiAdminProfessionalApplication,
  ApiAdminProfessional,
  ApiAdminSummary,
  ApiBookingReview,
  ApiClientAccount,
  ApiClientAddress,
  ApiClientData,
  ApiClientIdentityStatus,
  ApiDeviceRegistration,
  ApiDomainEventDeadLetter,
  ApiNotificationRecord,
  ApiPromotion,
  ApiBookingDispute,
  ApiNotificationPreferences,
  ApiOtpChallenge,
  ApiPasswordResetRequest,
  ApiProfessionalApplication,
  ApiProfessionalDashboard,
  ApiProfessionalCatalogSettings,
  ApiProfessionalSummary,
  ApiProfessionalQualityFlag,
  ApiServiceZone,
  ApiServiceCategory,
  ApiAdminPlatformSettings,
  ApiSafetyIncident,
  ApiPaymentIntent,
  ApiPayoutBatch,
  AuthApiResponse,
  ApiBookingTracking,
} from '../../shared/api-contracts.ts';

const baseUrl = process.env.KONJO_TEST_API_URL || 'http://127.0.0.1:4000';
const email = `backend-smoke-${Date.now()}@konjo.local`;
const password = 'Konjo-test-password-2026';

async function request<T>(path: string, options: RequestInit = {}): Promise<{ status: number; body: T; headers: Headers }> {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = response.status === 204 ? undefined : await response.json();
  return { status: response.status, body: body as T, headers: response.headers };
}

async function requestText(path: string, options: RequestInit = {}): Promise<{ status: number; body: string }> {
  const response = await fetch(`${baseUrl}${path}`, options);
  return { status: response.status, body: await response.text() };
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function advanceBookingToStart(bookingId: string): void {
  const testDatabasePath = process.env.KONJO_TEST_DATABASE_PATH;
  expect(testDatabasePath, 'The smoke test database path was not provided.');
  const fixtureDatabase = new DatabaseSync(testDatabasePath);
  fixtureDatabase.prepare('UPDATE bookings SET date_iso = ?, time = ? WHERE id = ?')
    .run('2000-01-01', '9:00 AM', bookingId);
  fixtureDatabase.close();
}

async function capturePayment(paymentIntent: ApiPaymentIntent, suffix: string) {
  const body = JSON.stringify({
    eventId: `payment-event-${suffix}-${Date.now()}`,
    providerReference: paymentIntent.providerReference,
    status: 'captured',
  });
  const signature = createHmac(
    'sha256',
    process.env.KONJO_PAYMENT_WEBHOOK_SECRET || 'konjo-local-payment-webhook-secret',
  ).update(body).digest('hex');
  return request<{ paymentIntent: ApiPaymentIntent }>(`/v1/payments/webhooks/${paymentIntent.provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-konjo-signature': signature },
    body,
  });
}

function futureDateKey(daysFromNow: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

function futureWorkingDateKey(daysFromNow: number): string {
  const date = new Date(`${futureDateKey(daysFromNow)}T12:00:00.000Z`);
  while (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const health = await request<{ status: string }>('/health');
expect(health.status === 200 && health.body.status === 'ok', 'Health endpoint failed.');
const readiness = await request<{ status: string }>('/ready');
expect(readiness.status === 200 && readiness.body.status === 'ready', 'Readiness endpoint failed.');
const tracedHealth = await request<{ status: string }>('/health', {
  headers: { 'X-Request-Id': 'konjo-smoke-trace' },
});
expect(
  tracedHealth.status === 200 && tracedHealth.headers.get('x-request-id') === 'konjo-smoke-trace',
  'Request correlation ID propagation failed.',
);
const publicZones = await request<{ zones: ApiServiceZone[] }>('/v1/zones');
expect(
  publicZones.status === 200 && publicZones.body.zones.some((zone) => zone.label === 'Bole' && zone.travelFee === 0),
  'Public active service zone listing failed.',
);
const publicCategories = await request<{ categories: ApiServiceCategory[] }>('/v1/categories');
expect(
  publicCategories.status === 200 && publicCategories.body.categories.some((category) => category.slug === 'braids'),
  'Public active service category listing failed.',
);
const missingWorkerToken = await request('/v1/internal/jobs/run', { method: 'POST' });
expect(missingWorkerToken.status === 401, 'Internal jobs endpoint accepted a missing worker token.');
const invalidWorkerToken = await request('/v1/internal/jobs/run', {
  method: 'POST',
  headers: { 'X-Konjo-Worker-Token': 'invalid-worker-token' },
});
expect(invalidWorkerToken.status === 401, 'Internal jobs endpoint accepted an invalid worker token.');
const authorizedWorkerRun = await request<{ skipped: boolean }>('/v1/internal/jobs/run', {
  method: 'POST',
  headers: { 'X-Konjo-Worker-Token': 'konjo-smoke-worker-token-at-least-32-characters' },
});
expect(
  authorizedWorkerRun.status === 200 && !authorizedWorkerRun.body.skipped,
  'Internal jobs endpoint rejected the configured worker token.',
);

const otpPhoneNumber = `+2519${String(Date.now()).slice(-8)}`;
const otpRequest = await request<{ challenge: ApiOtpChallenge }>('/v1/auth/otp/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phoneNumber: otpPhoneNumber, role: 'client' }),
});
expect(
  otpRequest.status === 201 && /^\d{4}$/.test(otpRequest.body.challenge.developmentCode ?? ''),
  'Development OTP request failed.',
);
const incorrectOtpCode = otpRequest.body.challenge.developmentCode === '0000' ? '0001' : '0000';

const incorrectOtp = await request('/v1/auth/otp/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ challengeId: otpRequest.body.challenge.id, code: incorrectOtpCode, role: 'client' }),
});
expect(incorrectOtp.status === 401, 'Incorrect OTP was accepted.');

const otpAuthentication = await request<AuthApiResponse>('/v1/auth/otp/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    challengeId: otpRequest.body.challenge.id,
    code: otpRequest.body.challenge.developmentCode,
    role: 'client',
  }),
});
expect(
  otpAuthentication.status === 200 &&
    otpAuthentication.body.user.phoneNumber === otpPhoneNumber &&
    otpAuthentication.body.user.email === null,
  'OTP verification failed.',
);

const reusedOtp = await request('/v1/auth/otp/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    challengeId: otpRequest.body.challenge.id,
    code: otpRequest.body.challenge.developmentCode,
    role: 'client',
  }),
});
expect(reusedOtp.status === 401, 'Consumed OTP challenge was reused.');

const otpAccountDeletion = await request<void>('/v1/me', {
  method: 'DELETE',
  headers: { Authorization: `Bearer ${otpAuthentication.body.session.token}` },
});
expect(otpAccountDeletion.status === 204, 'OTP test account deletion failed.');

const professionalPhoneNumber = `+2517${String(Date.now() + 1).slice(-8)}`;
const professionalOtpRequest = await request<{ challenge: ApiOtpChallenge }>('/v1/auth/otp/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phoneNumber: professionalPhoneNumber, role: 'professional' }),
});
const professionalAuthentication = await request<AuthApiResponse>('/v1/auth/otp/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    challengeId: professionalOtpRequest.body.challenge.id,
    code: professionalOtpRequest.body.challenge.developmentCode,
    role: 'professional',
  }),
});
expect(professionalAuthentication.status === 200, 'Professional OTP verification failed.');
const professionalHeaders = {
  Authorization: `Bearer ${professionalAuthentication.body.session.token}`,
  'Content-Type': 'application/json',
};
const professionalDevice = await request<{ device: ApiDeviceRegistration }>('/v1/devices', {
  method: 'POST',
  headers: professionalHeaders,
  body: JSON.stringify({ platform: 'android', token: `ExpoPushToken[professional-${Date.now()}]` }),
});
expect(professionalDevice.status === 201, 'Professional device registration failed.');
const professionalApplicationInput = {
  preferredLanguage: 'en',
  profile: {
    legalName: 'Hana Backend Professional',
    displayName: 'Hana B.',
    email: 'hana.backend@example.com',
    specialty: 'braids',
    bio: 'Experienced mobile braider focused on gentle, clean, and reliable home service.',
    yearsExperience: '6',
    educationLevel: 'diploma',
    gender: 'female',
    payoutMethod: { type: 'telebirr', accountName: 'Hana Backend Professional', accountNumber: '0911 000 000' },
    languageSkills: [{ language: 'Amharic', proficiency: 'native' }, { language: 'English', proficiency: 'fluent' }],
    baseZone: 'Bole',
    portfolioCount: 0,
  },
  identity: {
    credentialAdded: false,
  },
  services: [{
    id: 'hana-box-braids',
    category: 'Braids & natural hair',
    name: 'Box braids',
    durationMinutes: 180,
    price: 1800,
    note: 'Standard braiding hair included',
    popular: true,
  }],
  workingDays: [
    { day: 'Sunday', hours: '9:00 AM – 6:00 PM', enabled: true },
    { day: 'Monday', hours: '9:00 AM – 6:00 PM', enabled: true },
    { day: 'Tuesday', hours: '9:00 AM – 6:00 PM', enabled: true },
    { day: 'Wednesday', hours: '9:00 AM – 6:00 PM', enabled: true },
    { day: 'Thursday', hours: '9:00 AM – 6:00 PM', enabled: true },
    { day: 'Friday', hours: '9:00 AM – 6:00 PM', enabled: true },
    { day: 'Saturday', hours: '9:00 AM – 6:00 PM', enabled: true },
  ],
  travelZones: [
    { id: 'bole', label: 'Bole', active: true },
    { id: 'cmc', label: 'CMC', active: true },
    { id: 'ayat', label: 'Ayat', active: false },
  ],
  sameDayBookings: true,
  termsAccepted: true,
};
const professionalSubmission = await request<{ application: ApiProfessionalApplication }>(
  '/v1/professional/application',
  {
    method: 'PUT',
    headers: professionalHeaders,
    body: JSON.stringify(professionalApplicationInput),
  },
);
expect(
  professionalSubmission.status === 200 &&
    professionalSubmission.body.application.status === 'pending' &&
    professionalSubmission.body.application.identity.credentialAdded === false &&
    professionalSubmission.body.application.profile.educationLevel === 'diploma' &&
    professionalSubmission.body.application.profile.gender === 'female' &&
    professionalSubmission.body.application.profile.payoutMethod?.type === 'telebirr' &&
    professionalSubmission.body.application.profile.payoutMethod?.accountNumber === '+251911000000' &&
    professionalSubmission.body.application.profile.languageSkills.some((skill) => skill.language === 'English' && skill.proficiency === 'fluent') &&
    professionalSubmission.body.application.services[0]?.name === 'Box braids',
  'Professional application persistence failed.',
);
const duplicateSubmission = await request('/v1/professional/application', {
  method: 'PUT',
  headers: professionalHeaders,
  body: JSON.stringify(professionalApplicationInput),
});
expect(duplicateSubmission.status === 409, 'A pending application was unexpectedly editable.');
const pendingDashboard = await request('/v1/professional/dashboard', { headers: professionalHeaders });
expect(pendingDashboard.status === 403, 'A pending professional accessed the professional dashboard.');
const selfApproval = await request('/v1/development/professional/application/approve', {
  method: 'POST', headers: professionalHeaders,
});
expect(selfApproval.status === 404, 'Professionals must not approve their own applications, even in development.');
const restoredProfessionalApplication = await request<{ application: ApiProfessionalApplication }>(
  '/v1/professional/application',
  { headers: professionalHeaders },
);
// Returning professionals get the same identity and submitted application.
const returningChallenge = await request<{ challenge: ApiOtpChallenge }>('/v1/auth/otp/request', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phoneNumber: professionalPhoneNumber, role: 'professional' }),
});
const returningAuth = await request<AuthApiResponse>('/v1/auth/otp/verify', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ challengeId: returningChallenge.body.challenge.id, code: returningChallenge.body.challenge.developmentCode, role: 'professional', shouldCreateUser: false }),
});
expect(returningAuth.status === 200 && returningAuth.body.user.id === professionalAuthentication.body.user.id, 'Professional sign-in created a different account.');
const returningApplication = await request<{ application: ApiProfessionalApplication }>('/v1/professional/application', {
  headers: { Authorization: `Bearer ${returningAuth.body.session.token}` },
});
expect(returningApplication.body.application.id === professionalSubmission.body.application.id, 'Returning professional lost the saved application.');

const unknownPhone = `+2517${String(Date.now() + 5000).slice(-8)}`;
const unknownChallenge = await request<{ challenge: ApiOtpChallenge }>('/v1/auth/otp/request', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phoneNumber: unknownPhone, role: 'professional' }),
});
const unknownAuth = await request<{ error: { code: string } }>('/v1/auth/otp/verify', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ challengeId: unknownChallenge.body.challenge.id, code: unknownChallenge.body.challenge.developmentCode, role: 'professional', shouldCreateUser: false }),
});
expect(unknownAuth.status === 404 && unknownAuth.body.error.code === 'ACCOUNT_NOT_FOUND', 'Sign-in unexpectedly registered an unknown professional.');
expect(
  restoredProfessionalApplication.status === 200 &&
    restoredProfessionalApplication.body.application.travelZones.some((zone) => zone.id === 'bole' && zone.active),
  'Professional application restoration failed.',
);
const professionalAdminProbe = await request('/v1/admin/summary', { headers: professionalHeaders });
expect(professionalAdminProbe.status === 403, 'A professional session accessed an administrator endpoint.');
const adminAuthentication = await request<AuthApiResponse>('/v1/auth/login/admin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: process.env.KONJO_ADMIN_EMAIL || 'admin@konjo.local',
    password: process.env.KONJO_ADMIN_PASSWORD || 'Konjo-admin-test-2026',
  }),
});
expect(
  adminAuthentication.status === 200 && adminAuthentication.body.user.role === 'admin',
  'Administrator authentication failed.',
);
const adminHeaders = {
  Authorization: `Bearer ${adminAuthentication.body.session.token}`,
  'Content-Type': 'application/json',
};
const deadLetters = await request<{ events: ApiDomainEventDeadLetter[] }>(
  '/v1/admin/domain-events/dead-letters?limit=10',
  { headers: adminHeaders },
);
expect(deadLetters.status === 200 && deadLetters.body.events.length === 0, 'Administrator dead-letter listing failed.');
const invalidDeadLetterLimit = await request('/v1/admin/domain-events/dead-letters?limit=0', { headers: adminHeaders });
expect(invalidDeadLetterLimit.status === 400, 'An invalid dead-letter query limit was accepted.');
const missingDeadLetterReplay = await request('/v1/admin/domain-events/dead-letters/missing-event/replay', {
  method: 'POST',
  headers: adminHeaders,
});
expect(missingDeadLetterReplay.status === 404, 'A missing dead-letter event was accepted for replay.');
const adminSummaryBeforeApproval = await request<{ summary: ApiAdminSummary }>('/v1/admin/summary', {
  headers: adminHeaders,
});
expect(
  adminSummaryBeforeApproval.status === 200 && adminSummaryBeforeApproval.body.summary.pendingApplications === 1,
  'Administrator summary did not include the pending application.',
);
const adminApplications = await request<{ applications: ApiAdminProfessionalApplication[] }>(
  '/v1/admin/professional-applications?status=pending',
  { headers: adminHeaders },
);
expect(
  adminApplications.status === 200 &&
    adminApplications.body.applications.some((item) => item.userId === professionalAuthentication.body.user.id),
  'Administrator professional review queue failed.',
);
const professionalApproval = await request<{ application: ApiProfessionalApplication }>(
  `/v1/admin/professional-applications/${professionalAuthentication.body.user.id}/approve`,
  { method: 'POST', headers: adminHeaders, body: '{}' },
);
expect(
  professionalApproval.status === 200 && professionalApproval.body.application.status === 'approved',
  `Administrator professional approval failed: ${professionalApproval.status} ${JSON.stringify(professionalApproval.body)}`,
);
const approvalAudit = await request<{ auditLogs: ApiAdminAuditLog[] }>('/v1/admin/audit-logs', {
  headers: adminHeaders,
});
expect(
  approvalAudit.status === 200 &&
    approvalAudit.body.auditLogs.some((log) => log.action === 'professional_application.approved'),
  'Administrator approval audit log failed.',
);
const adminProfessionals = await request<{ professionals: ApiAdminProfessional[] }>('/v1/admin/professionals', {
  headers: adminHeaders,
});
const managedProfessional = adminProfessionals.body.professionals.find(
  (item) => item.id === professionalAuthentication.body.user.id,
);
expect(
  adminProfessionals.status === 200 && managedProfessional && !managedProfessional.femaleOnlyEligible,
  'Administrator professional listing failed.',
);
const professionalMerchandising = await request<{ professional: ApiAdminProfessional }>(
  `/v1/admin/professionals/${professionalAuthentication.body.user.id}`,
  {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ featured: true, femaleOnlyEligible: false }),
  },
);
expect(
  professionalMerchandising.status === 200 && professionalMerchandising.body.professional.featured,
  'Administrator professional merchandising update failed.',
);
const professionalSuspension = await request<{ professional: ApiAdminProfessional }>(
  `/v1/admin/professionals/${professionalAuthentication.body.user.id}/suspend`,
  { method: 'POST', headers: adminHeaders },
);
expect(
  professionalSuspension.status === 200 && professionalSuspension.body.professional.approvalStatus === 'suspended',
  'Administrator professional suspension failed.',
);
const suspendedCatalog = await request<{ professionals: ApiProfessionalSummary[] }>('/v1/professionals');
expect(
  !suspendedCatalog.body.professionals.some((item) => item.id === professionalAuthentication.body.user.id),
  'A suspended professional remained visible in the public catalog.',
);
const suspendedAvailability = await request('/v1/professional/availability', {
  method: 'PATCH',
  headers: professionalHeaders,
  body: JSON.stringify({ available: true }),
});
expect(suspendedAvailability.status === 403, 'A suspended professional changed booking availability.');
const professionalRestoration = await request<{ professional: ApiAdminProfessional }>(
  `/v1/admin/professionals/${professionalAuthentication.body.user.id}/restore`,
  { method: 'POST', headers: adminHeaders },
);
expect(
  professionalRestoration.status === 200 && professionalRestoration.body.professional.approvalStatus === 'active',
  'Administrator professional restoration failed.',
);
const rejectedPhoneNumber = `+2517${String(Date.now() + 2).slice(-8)}`;
const rejectedOtpRequest = await request<{ challenge: ApiOtpChallenge }>('/v1/auth/otp/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phoneNumber: rejectedPhoneNumber, role: 'professional' }),
});
const rejectedAuthentication = await request<AuthApiResponse>('/v1/auth/otp/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    challengeId: rejectedOtpRequest.body.challenge.id,
    code: rejectedOtpRequest.body.challenge.developmentCode,
    role: 'professional',
  }),
});
const rejectedHeaders = {
  Authorization: `Bearer ${rejectedAuthentication.body.session.token}`,
  'Content-Type': 'application/json',
};
await request('/v1/professional/fayda/verify', {
  method: 'POST',
  headers: rejectedHeaders,
  body: JSON.stringify({ identifier: '123456785678' }),
});
const rejectedSubmission = await request<{ application: ApiProfessionalApplication }>(
  '/v1/professional/application',
  {
    method: 'PUT',
    headers: rejectedHeaders,
    body: JSON.stringify({
      ...professionalApplicationInput,
      profile: {
        ...professionalApplicationInput.profile,
        legalName: 'Rejected Smoke Professional',
        displayName: 'Rejected test profile',
        email: 'rejected.backend@example.com',
      },
    }),
  },
);
expect(rejectedSubmission.status === 200, 'Reject-path professional application submission failed.');
const rejectedReview = await request<{ application: ApiProfessionalApplication }>(
  `/v1/admin/professional-applications/${rejectedAuthentication.body.user.id}/reject`,
  { method: 'POST', headers: adminHeaders, body: JSON.stringify({ reason: 'Portfolio quality does not meet the review standard.' }) },
);
expect(
  rejectedReview.status === 200 && rejectedReview.body.application.status === 'rejected',
  'Administrator professional rejection failed.',
);
const rejectedApplications = await request<{ applications: ApiAdminProfessionalApplication[] }>(
  '/v1/admin/professional-applications?status=rejected',
  { headers: adminHeaders },
);
expect(
  rejectedApplications.body.applications.some((item) => item.userId === rejectedAuthentication.body.user.id),
  'Rejected application status filter failed.',
);
const availabilityUpdate = await request<{ available: boolean }>('/v1/professional/availability', {
  method: 'PATCH',
  headers: professionalHeaders,
  body: JSON.stringify({ available: true }),
});
expect(availabilityUpdate.status === 200 && availabilityUpdate.body.available, 'Professional availability update failed.');
const professionalCatalogSettings = await request<{ settings: ApiProfessionalCatalogSettings }>('/v1/professional/catalog', {
  headers: professionalHeaders,
});
expect(
  professionalCatalogSettings.status === 200 && professionalCatalogSettings.body.settings.services.length === 1,
  'Approved professional catalogue restoration failed.',
);
const updatedProfessionalCatalog = await request<{ settings: ApiProfessionalCatalogSettings }>('/v1/professional/catalog', {
  method: 'PATCH',
  headers: professionalHeaders,
  body: JSON.stringify({
    ...professionalCatalogSettings.body.settings,
    services: [
      ...professionalCatalogSettings.body.settings.services,
      {
        id: 'hana-wash-finish',
        category: 'Hair styling',
        name: 'Wash & finish',
        durationMinutes: 60,
        price: 700,
        note: 'Client provides preferred finishing products',
        popular: false,
      },
    ],
    sameDayBookings: false,
  }),
});
expect(
  updatedProfessionalCatalog.status === 200 &&
    updatedProfessionalCatalog.body.settings.services.some((item) => item.id === 'hana-wash-finish') &&
    !updatedProfessionalCatalog.body.settings.sameDayBookings,
  'Post-approval professional catalogue update failed.',
);
const invalidCatalogZone = await request('/v1/professional/catalog', {
  method: 'PATCH',
  headers: professionalHeaders,
  body: JSON.stringify({
    ...updatedProfessionalCatalog.body.settings,
    travelZones: [
      ...updatedProfessionalCatalog.body.settings.travelZones,
      { id: 'outside-konjo', label: 'Outside Konjo', active: true },
    ],
  }),
});
expect(invalidCatalogZone.status === 400, 'Professional catalogue accepted an unmanaged active travel zone.');
const restoredCatalogSettings = await request<{ settings: ApiProfessionalCatalogSettings }>('/v1/professional/catalog', {
  headers: professionalHeaders,
});
expect(
  restoredCatalogSettings.body.settings.services.some((item) => item.id === 'hana-wash-finish') &&
    !restoredCatalogSettings.body.settings.travelZones.some((zone) => zone.id === 'outside-konjo'),
  'Professional catalogue edits were not persisted atomically.',
);

const registration = await request<AuthApiResponse>('/v1/auth/register/client', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password, fullName: 'Backend Smoke Test' }),
});
expect(registration.status === 201, 'Client registration failed.');
let token = registration.body.session.token;
const authenticatedHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const failingClientDevice = await request<{ device: ApiDeviceRegistration }>('/v1/devices', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({ platform: 'ios', token: `fail:ExpoPushToken[client-${Date.now()}]` }),
});
expect(
  failingClientDevice.status === 201 && failingClientDevice.body.device.tokenPreview.length > 6,
  'Client device registration failed.',
);

const profile = await request<{ user: { email: string } }>('/v1/me', { headers: authenticatedHeaders });
expect(profile.status === 200 && profile.body.user.email === email, 'Authenticated profile failed.');

const emailProfileUpdate = await request<{ user: { phoneNumber: string | null } }>('/v1/me', {
  method: 'PATCH',
  headers: authenticatedHeaders,
  body: JSON.stringify({ fullName: 'Backend Test Client', phoneNumber: '+251911000000' }),
});
expect(emailProfileUpdate.status === 200, 'An email client could not edit their profile without an Ethiopian phone number.');
expect(!emailProfileUpdate.body.user.phoneNumber, 'An unverified phone submitted in profile data became an authentication phone.');
const emailOnlyRegistration = await request<AuthApiResponse>('/v1/auth/register/client', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: `email-only-${Date.now()}@konjo.test`, password, fullName: 'International Client' }),
});
expect(emailOnlyRegistration.status === 201, 'Email-only client registration failed.');
const emailOnlyOnboarding = await request('/v1/client/account', {
  method: 'PUT', headers: { Authorization: `Bearer ${emailOnlyRegistration.body.session.token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fullName: 'International Client', preferredLanguage: 'en' }),
});
expect(emailOnlyOnboarding.status === 200, 'An email client could not complete onboarding without a phone.');

const clientPhoneNumber = '+251911000000';
const clientPhoneChallenge = await request<{ challenge: ApiOtpChallenge }>('/v1/auth/otp/request', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({ phoneNumber: clientPhoneNumber, role: 'client' }),
});
expect(clientPhoneChallenge.status === 201, 'Client phone verification request failed.');
const verifiedClientPhone = await request<AuthApiResponse>('/v1/auth/otp/verify', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    challengeId: clientPhoneChallenge.body.challenge.id,
    code: clientPhoneChallenge.body.challenge.developmentCode,
    role: 'client',
  }),
});
expect(
  verifiedClientPhone.status === 200 &&
    verifiedClientPhone.body.user.id === registration.body.user.id &&
    verifiedClientPhone.body.user.phoneNumber === clientPhoneNumber,
  'Phone verification was not attached to the email client account.',
);
token = verifiedClientPhone.body.session.token;
authenticatedHeaders.Authorization = `Bearer ${token}`;

const updated = await request<{ user: { phoneNumber: string | null } }>('/v1/me', {
  method: 'PATCH',
  headers: authenticatedHeaders,
  body: JSON.stringify({ fullName: 'Backend Test Client', phoneNumber: '+251922000000' }),
});
expect(updated.status === 200 && updated.body.user.phoneNumber === clientPhoneNumber, 'Profile update replaced the verified phone number.');

const emptyClientData = await request<ApiClientData>('/v1/client-data', { headers: authenticatedHeaders });
expect(
  emptyClientData.status === 200 && emptyClientData.body.account === null,
  'New client unexpectedly had completed onboarding data.',
);

const onboarding = await request<{ account: ApiClientAccount }>('/v1/client/account', {
  method: 'PUT',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    fullName: 'Backend Test Client',
    phoneNumber: '+251911000000',
    preferredLanguage: 'am',
    address: {
      label: 'Home',
      zone: 'Ayat',
      detail: 'Blue gate beside the backend smoke test landmark',
    },
  }),
});
const firstAddress = onboarding.body.account.addresses[0];
expect(
  onboarding.status === 200 &&
    onboarding.body.account.profile.preferredLanguage === 'am' &&
    firstAddress?.fee === 250 &&
    firstAddress.isDefault,
  'Client onboarding or server-side address pricing failed.',
);

const languageUpdate = await request<{ user: { id: string } }>('/v1/me', {
  method: 'PATCH',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    fullName: 'Backend Test Client',
    phoneNumber: '+251911000000',
    preferredLanguage: 'en',
  }),
});
const languageUpdatedClientData = await request<ApiClientData>('/v1/client-data', {
  headers: authenticatedHeaders,
});
expect(
  languageUpdate.status === 200 &&
    languageUpdatedClientData.body.account?.profile.preferredLanguage === 'en',
  'Client profile language update was not persisted.',
);

const addressCreation = await request<{ address: ApiClientAddress }>('/v1/client/addresses', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    label: 'Office',
    zone: 'Bole',
    detail: 'Reception desk on the second floor of the test building',
  }),
});
expect(
  addressCreation.status === 201 && addressCreation.body.address.fee === 0 && !addressCreation.body.address.isDefault,
  'Saved address creation failed.',
);

const addressUpdate = await request<{ address: ApiClientAddress }>(
  `/v1/client/addresses/${addressCreation.body.address.id}`,
  {
    method: 'PATCH',
    headers: authenticatedHeaders,
    body: JSON.stringify({
      label: 'Office',
      zone: 'CMC',
      detail: 'Updated reception desk address for the backend smoke test',
    }),
  },
);
expect(addressUpdate.status === 200 && addressUpdate.body.address.fee === 150, 'Saved address update failed.');

const addressDefault = await request<void>(
  `/v1/client/addresses/${addressCreation.body.address.id}/default`,
  { method: 'POST', headers: authenticatedHeaders },
);
expect(addressDefault.status === 204, 'Default address update failed.');

const catalog = await request<{ professionals: ApiProfessionalSummary[] }>('/v1/professionals');
const professional = catalog.body.professionals.find(
  (item) => item.id === professionalAuthentication.body.user.id,
);
const service = professional?.services[0];
expect(catalog.status === 200 && professional && service, 'Professional catalog failed.');
const publicProfile = await requestText(`/p/${professional.id}`);
expect(publicProfile.status === 200 && publicProfile.body.includes(professional.displayName) && publicProfile.body.includes(`konjoclient://professional/${professional.id}`), 'Shareable public profile page failed.');
const missingPublicProfile = await requestText('/p/no-such-professional');
expect(missingPublicProfile.status === 404, 'Unknown public profile should be 404.');
expect(
  catalog.body.professionals.some((item) => item.id === professionalAuthentication.body.user.id),
  'Approved professional was not published to the catalog.',
);
expect(
  professional.available &&
    Boolean(professional.nextAvailableSlot) &&
    professional.bio === professionalApplicationInput.profile.bio &&
    professional.educationLevel === 'diploma' &&
    professional.languageSkills.some((skill) => skill.language === 'English' && skill.proficiency === 'fluent') &&
    professional.travelZones.includes('Bole') &&
    professional.workingDays.length === 7 &&
    professional.services.some((item) => item.id === 'hana-wash-finish'),
  'Published professional metadata is incomplete.',
);
const filteredCatalog = await request<{ professionals: ApiProfessionalSummary[] }>(
  '/v1/professionals?category=braids&zone=Bole&available=true&query=Hana',
);
expect(
  filteredCatalog.status === 200 &&
    filteredCatalog.body.professionals.some((item) => item.id === professional.id),
  'Professional catalog filters failed.',
);
const portfolio = await request<{ portfolio: unknown[] }>(
  `/v1/professionals/${professional.id}/portfolio`,
);
expect(
  portfolio.status === 200 && Array.isArray(portfolio.body.portfolio),
  'Approved portfolio endpoint failed.',
);

const favorite = await request<void>(`/v1/client/favorites/${professional.id}`, {
  method: 'PUT',
  headers: authenticatedHeaders,
});
expect(favorite.status === 204, 'Adding a favourite failed.');

const preferences: ApiNotificationPreferences = {
  bookingUpdates: true,
  promotions: true,
  smsReminders: false,
};
const preferenceUpdate = await request<{ notificationPreferences: ApiNotificationPreferences }>(
  '/v1/client/notification-preferences',
  {
    method: 'PATCH',
    headers: authenticatedHeaders,
    body: JSON.stringify(preferences),
  },
);
expect(
  preferenceUpdate.status === 200 && preferenceUpdate.body.notificationPreferences.promotions,
  'Notification preference update failed.',
);

const persistedClientData = await request<ApiClientData>('/v1/client-data', { headers: authenticatedHeaders });
expect(
  persistedClientData.status === 200 &&
    persistedClientData.body.account?.defaultAddressId === addressCreation.body.address.id &&
    persistedClientData.body.favouriteIds.includes(professional.id) &&
    persistedClientData.body.notificationPreferences.smsReminders === false,
  'Client data was not persisted.',
);
const massageBookingInput = {
  requestId: `massage-${Date.now()}`,
  professionalId: 'meaza',
  serviceId: 'meaza-relaxation',
  dateIso: futureWorkingDateKey(12),
  time: '9:00 AM',
  addressLabel: 'Home',
  addressZone: 'Bole',
  addressDetail: 'Identity-gated massage booking smoke test address',
  femaleOnly: true,
  paymentMethod: 'cash',
};
const unverifiedMassageBooking = await request('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify(massageBookingInput),
});
expect(unverifiedMassageBooking.status === 409, 'A first massage booking bypassed client identity verification.');
const clientIdentity = await request<{ identity: ApiClientIdentityStatus }>('/v1/client/fayda/verify', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({ identifier: '987654321234' }),
});
expect(
  clientIdentity.status === 200 && clientIdentity.body.identity.verified && clientIdentity.body.identity.faydaLastFour === '1234',
  'Client Fayda identity verification failed.',
);
const verifiedMassageBooking = await request<{ booking: ApiBooking }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify(massageBookingInput),
});
expect(verifiedMassageBooking.status === 201, 'A verified client could not create a first massage booking.');
const cancelMassageBooking = await request<void>(`/v1/bookings/${verifiedMassageBooking.body.booking.id}`, {
  method: 'DELETE',
  headers: authenticatedHeaders,
});
expect(cancelMassageBooking.status === 204, 'Massage identity-gate test booking cleanup failed.');
const zones = await request<{ zones: ApiAdminZone[] }>('/v1/admin/zones', { headers: adminHeaders });
expect(zones.status === 200 && zones.body.zones.some((zone) => zone.id === 'ayat'), 'Administrator zone listing failed.');
const pausedZone = await request<{ zone: ApiAdminZone }>('/v1/admin/zones/ayat', {
  method: 'PUT',
  headers: adminHeaders,
  body: JSON.stringify({ label: 'Ayat', travelFee: 275, active: false }),
});
expect(pausedZone.status === 200 && !pausedZone.body.zone.active, 'Administrator zone pause failed.');
const unavailableZoneAddress = await request('/v1/client/addresses', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    label: 'Paused zone',
    zone: 'Ayat',
    detail: 'This address must be rejected while the service zone is inactive',
  }),
});
expect(unavailableZoneAddress.status === 400, 'An address in an inactive service zone was accepted.');
const updatedZone = await request<{ zone: ApiAdminZone }>('/v1/admin/zones/ayat', {
  method: 'PUT',
  headers: adminHeaders,
  body: JSON.stringify({ label: 'Ayat', travelFee: 275, active: true }),
});
expect(updatedZone.status === 200 && updatedZone.body.zone.travelFee === 275, 'Administrator zone fee update failed.');
const adminCategories = await request<{ categories: ApiServiceCategory[] }>('/v1/admin/categories', { headers: adminHeaders });
const nailsCategory = adminCategories.body.categories.find((category) => category.slug === 'nails');
expect(adminCategories.status === 200 && nailsCategory, 'Administrator category listing failed.');
const hiddenCategory = await request<{ category: ApiServiceCategory }>(`/v1/admin/categories/${nailsCategory.id}`, {
  method: 'PUT',
  headers: adminHeaders,
  body: JSON.stringify({ ...nailsCategory, active: false }),
});
expect(hiddenCategory.status === 200 && !hiddenCategory.body.category.active, 'Administrator category pause failed.');
const categoriesAfterPause = await request<{ categories: ApiServiceCategory[] }>('/v1/categories');
expect(!categoriesAfterPause.body.categories.some((category) => category.slug === 'nails'), 'An inactive category remained publicly visible.');
const restoredCategory = await request<{ category: ApiServiceCategory }>(`/v1/admin/categories/${nailsCategory.id}`, {
  method: 'PUT',
  headers: adminHeaders,
  body: JSON.stringify({ ...nailsCategory, active: true }),
});
expect(restoredCategory.status === 200 && restoredCategory.body.category.active, 'Administrator category restoration failed.');
const repricedAddress = await request<{ address: ApiClientAddress }>('/v1/client/addresses', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    label: 'Ayat test',
    zone: 'Ayat',
    detail: 'Address used to verify administrator-configured travel fees',
  }),
});
expect(repricedAddress.status === 201 && repricedAddress.body.address.fee === 275, 'Updated zone fee was not applied.');
await request<void>(`/v1/client/addresses/${repricedAddress.body.address.id}`, {
  method: 'DELETE',
  headers: authenticatedHeaders,
});
const promotion = await request<{ promotion: ApiPromotion }>('/v1/admin/promotions', {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({
    code: `WELCOME${String(Date.now()).slice(-5)}`,
    description: 'Administrator smoke test promotion',
    discountPercent: 10,
    active: true,
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }),
});
expect(promotion.status === 201 && promotion.body.promotion.discountPercent === 10, 'Promotion creation failed.');
const disabledPromotion = await request<{ promotion: ApiPromotion }>(
  `/v1/admin/promotions/${promotion.body.promotion.id}`,
  { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ active: false }) },
);
expect(disabledPromotion.status === 200 && !disabledPromotion.body.promotion.active, 'Promotion deactivation failed.');
const broadcast = await request<{ broadcast: ApiAdminBroadcast }>('/v1/admin/broadcasts', {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({ audience: 'all', message: 'Konjo administrator smoke test broadcast.' }),
});
expect(broadcast.status === 201 && broadcast.body.broadcast.recipientCount >= 2, 'Administrator broadcast failed.');
const commissionSettings = await request<{ settings: ApiAdminPlatformSettings }>('/v1/admin/settings/commission', { headers: adminHeaders });
expect(commissionSettings.status === 200 && commissionSettings.body.settings.commissionRateBps === 1800, 'Administrator commission settings failed.');
const updatedCommission = await request<{ settings: ApiAdminPlatformSettings }>('/v1/admin/settings/commission', {
  method: 'PATCH',
  headers: adminHeaders,
  body: JSON.stringify({ commissionRateBps: 2000 }),
});
expect(updatedCommission.status === 200 && updatedCommission.body.settings.commissionRatePercent === 20, 'Administrator commission update failed.');
const commissionSnapshotBooking = await request<{ booking: ApiBooking }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    requestId: `commission-snapshot-${Date.now()}`,
    professionalId: professional.id,
    serviceId: service.id,
    dateIso: futureDateKey(28),
    time: '2:30 PM',
    addressLabel: 'Home',
    addressZone: 'Bole',
    addressDetail: 'Commission snapshot policy test address',
    femaleOnly: false,
    paymentMethod: 'cash',
  }),
});
expect(commissionSnapshotBooking.status === 201 && commissionSnapshotBooking.body.booking.commissionRateBps === 2000, 'A new booking did not snapshot the configured commission rate.');
await request<void>(`/v1/bookings/${commissionSnapshotBooking.body.booking.id}`, { method: 'DELETE', headers: authenticatedHeaders });
const restoredCommission = await request<{ settings: ApiAdminPlatformSettings }>('/v1/admin/settings/commission', {
  method: 'PATCH',
  headers: adminHeaders,
  body: JSON.stringify({ commissionRateBps: 1800 }),
});
expect(restoredCommission.body.settings.commissionRateBps === 1800, 'Commission rate restoration failed.');

const addressDeletion = await request<void>(`/v1/client/addresses/${addressCreation.body.address.id}`, {
  method: 'DELETE',
  headers: authenticatedHeaders,
});
expect(addressDeletion.status === 204, 'Saved address deletion failed.');
const dataAfterAddressDeletion = await request<ApiClientData>('/v1/client-data', { headers: authenticatedHeaders });
expect(
  dataAfterAddressDeletion.body.account?.defaultAddressId === firstAddress.id,
  'Deleting the default address did not promote the remaining address.',
);

// Zone policy: a paused zone cannot be booked; any active zone can, even one the
// professional has not pre-selected, because they decide per request and name
// the travel fee on acceptance.
const uncoveredZoneInput = {
  professionalId: professional.id,
  serviceId: service.id,
  dateIso: futureDateKey(7),
  time: '9:00 AM',
  addressLabel: 'Home',
  addressZone: 'Ayat',
  addressDetail: 'Outside the professional pre-selected zones for this smoke test',
  femaleOnly: false,
  paymentMethod: 'cash',
};
const pausedZoneForBooking = await request<{ zone: ApiAdminZone }>('/v1/admin/zones/ayat', {
  method: 'PUT', headers: adminHeaders, body: JSON.stringify({ label: 'Ayat', travelFee: 275, active: false }),
});
expect(pausedZoneForBooking.status === 200 && !pausedZoneForBooking.body.zone.active, 'Administrator zone pause before booking failed.');
const pausedZoneBooking = await request('/v1/bookings', {
  method: 'POST', headers: authenticatedHeaders, body: JSON.stringify({ requestId: `paused-zone-${Date.now()}`, ...uncoveredZoneInput }),
});
expect(pausedZoneBooking.status === 400, 'A booking in a paused service zone was accepted.');
const resumedZoneForBooking = await request<{ zone: ApiAdminZone }>('/v1/admin/zones/ayat', {
  method: 'PUT', headers: adminHeaders, body: JSON.stringify({ label: 'Ayat', travelFee: 275, active: true }),
});
expect(resumedZoneForBooking.status === 200 && resumedZoneForBooking.body.zone.active, 'Administrator zone resume failed.');
const uncoveredZoneBooking = await request<{ booking: ApiBooking }>('/v1/bookings', {
  method: 'POST', headers: authenticatedHeaders, body: JSON.stringify({ requestId: `uncovered-${Date.now()}`, ...uncoveredZoneInput }),
});
expect(
  uncoveredZoneBooking.status === 201 && uncoveredZoneBooking.body.booking.travelFee === 0,
  'A request in an active zone outside the professional pre-selected zones was not left for the professional to decide.',
);
const uncoveredZoneCleanup = await request<void>(`/v1/bookings/${uncoveredZoneBooking.body.booking.id}`, { method: 'DELETE', headers: authenticatedHeaders });
expect(uncoveredZoneCleanup.status === 204, 'Uncovered zone booking cleanup failed.');

const primaryBookingInput = {
  requestId: `primary-${Date.now()}`,
  professionalId: professional.id,
  serviceId: service.id,
  dateIso: futureDateKey(7),
  time: '10:30 AM',
  addressLabel: 'Home',
  addressZone: 'Bole',
  addressDetail: 'Backend smoke test address near the main gate',
  femaleOnly: true,
  paymentMethod: 'telebirr',
};
const ineligibleFemaleOnlyBooking = await request<{ error: { code: string } }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify(primaryBookingInput),
});
expect(
  ineligibleFemaleOnlyBooking.status === 400 && ineligibleFemaleOnlyBooking.body.error.code === 'FEMALE_ONLY_UNAVAILABLE',
  'A female-only booking was assigned to a professional without administrator-verified eligibility, or the refusal was not explained.',
);
const unavailableTimeBooking = await request<{ error: { code: string } }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({ ...primaryBookingInput, requestId: `bad-time-${Date.now()}`, femaleOnly: false, time: '3:07 AM' }),
});
expect(
  unavailableTimeBooking.status === 409 && unavailableTimeBooking.body.error.code === 'TIME_UNAVAILABLE',
  'A booking at an unavailable time was not explained as such.',
);
const femaleOnlyEligibility = await request<{ professional: ApiAdminProfessional }>(
  `/v1/admin/professionals/${professional.id}`,
  {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ featured: true, femaleOnlyEligible: true }),
  },
);
expect(
  femaleOnlyEligibility.status === 200 && femaleOnlyEligibility.body.professional.femaleOnlyEligible,
  'Administrator female-only eligibility verification failed.',
);
const eligibleCatalog = await request<{ professionals: ApiProfessionalSummary[] }>('/v1/professionals');
expect(
  eligibleCatalog.body.professionals.find((item) => item.id === professional.id)?.femaleOnlyEligible,
  'Female-only eligibility was not published to booking discovery.',
);
expect(
  eligibleCatalog.body.professionals.find((item) => item.id === professional.id)?.gender === 'female',
  'The registered gender was not published to booking discovery.',
);
const created = await request<{ booking: ApiBooking; paymentIntent: null }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify(primaryBookingInput),
});
expect(
  created.status === 201 &&
    created.body.booking.total === service.price + Math.round(service.price * 0.18) &&
    created.body.booking.femaleOnly &&
    created.body.booking.paymentMethod === 'telebirr',
  'Booking creation failed.',
);
expect(
  created.body.paymentIntent === null,
  'A booking request created a payment before professional acceptance.',
);
const retriedBooking = await request<{ booking: ApiBooking; paymentIntent: null; duplicate: boolean }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify(primaryBookingInput),
});
expect(
  retriedBooking.status === 200 && retriedBooking.body.duplicate &&
    retriedBooking.body.booking.id === created.body.booking.id &&
    retriedBooking.body.paymentIntent === null,
  'Booking request idempotency failed.',
);
const prematurePayment = await request(`/v1/bookings/${created.body.booking.id}/payment`, {
  method: 'POST', headers: authenticatedHeaders,
});
expect(prematurePayment.status === 409, 'Payment was allowed before professional acceptance.');
let createdPayment: ApiPaymentIntent;

const declinedRequest = await request<{ booking: ApiBooking; paymentIntent: null }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    ...primaryBookingInput,
    requestId: `declined-${Date.now()}`,
    dateIso: futureDateKey(15),
    time: '9:00 AM',
    femaleOnly: false,
  }),
});
expect(
  declinedRequest.status === 201 && declinedRequest.body.paymentIntent === null,
  'Decline test request unexpectedly created a payment.',
);
expect((await request(
  `/v1/professional/bookings/${declinedRequest.body.booking.id}/decline`,
  { method: 'POST', headers: professionalHeaders },
)).status === 200, 'Professional could not decline an unpaid request.');
const declinedHistory = await request<{ bookings: ApiBooking[] }>('/v1/bookings', { headers: authenticatedHeaders });
const declinedBooking = declinedHistory.body.bookings.find((booking) => booking.id === declinedRequest.body.booking.id);
expect(
  declinedBooking?.status === 'cancelled' && declinedBooking.cancellationPolicy === null && !declinedBooking.paymentIntent,
  'Professional decline created refund state for an unpaid request.',
);

const firstNotificationRun = await request<{ delivered: number; failed: number }>(
  '/v1/development/jobs/run',
  {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ now: new Date().toISOString() }),
  },
);
expect(
  firstNotificationRun.status === 200 && firstNotificationRun.body.failed >= 1 && firstNotificationRun.body.delivered >= 1,
  'Notification delivery failure/audit path failed.',
);
const removeFailingDevice = await request<void>(`/v1/devices/${failingClientDevice.body.device.id}`, {
  method: 'DELETE',
  headers: authenticatedHeaders,
});
expect(removeFailingDevice.status === 204, 'Device unregistration failed.');
const workingClientDevice = await request<{ device: ApiDeviceRegistration }>('/v1/devices', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({ platform: 'ios', token: `ExpoPushToken[client-working-${Date.now()}]` }),
});
expect(workingClientDevice.status === 201, 'Replacement device registration failed.');
const retryNotificationRun = await request<{ delivered: number; failed: number }>(
  '/v1/development/jobs/run',
  {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ now: new Date(Date.now() + 60_000).toISOString() }),
  },
);
expect(retryNotificationRun.status === 200 && retryNotificationRun.body.delivered >= 1, 'Notification retry failed.');
const notificationHistory = await request<{ notifications: ApiNotificationRecord[] }>('/v1/notifications', {
  headers: authenticatedHeaders,
});
expect(
  notificationHistory.status === 200 &&
    notificationHistory.body.notifications.some((notification) => notification.status === 'delivered' && notification.attempts === 2),
  'Notification delivery audit history failed.',
);

const availabilityAfterBooking = await request<{ availability: { slots: string[] } }>(
  `/v1/professionals/${professional.id}/availability?date=${futureDateKey(7)}&serviceId=${service.id}`,
);
expect(
  availabilityAfterBooking.status === 200 &&
    !availabilityAfterBooking.body.availability.slots.includes('10:30 AM') &&
    availabilityAfterBooking.body.availability.slots.includes('2:30 PM'),
  'Occupied booking times were not removed from availability.',
);
const doubleBooking = await request<{ error: { code: string } }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    requestId: `collision-${Date.now()}`,
    professionalId: professional.id,
    serviceId: service.id,
    dateIso: futureDateKey(7),
    time: '10:30 AM',
    addressLabel: 'Home',
    addressZone: 'Bole',
    addressDetail: 'Conflicting backend smoke test address near the main gate',
    femaleOnly: false,
    paymentMethod: 'cash',
  }),
});
expect(
  doubleBooking.status === 409 && doubleBooking.body.error.code === 'TIME_UNAVAILABLE',
  'A conflicting booking slot was accepted, or the conflict was not explained as an unavailable time.',
);

const bookings = await request<{ bookings: ApiBooking[] }>('/v1/bookings', { headers: authenticatedHeaders });
expect(bookings.status === 200 && bookings.body.bookings.some((booking) => booking.id === created.body.booking.id), 'Booking retrieval failed.');

const rescheduledDate = futureDateKey(8);
const rescheduled = await request<{ booking: ApiBooking }>(`/v1/bookings/${created.body.booking.id}/schedule`, {
  method: 'PATCH',
  headers: authenticatedHeaders,
  body: JSON.stringify({ dateIso: rescheduledDate, time: '12:00 PM' }),
});
expect(
  rescheduled.status === 200 &&
    rescheduled.body.booking.dateIso === rescheduledDate &&
    rescheduled.body.booking.time === '12:00 PM',
  'Booking rescheduling failed.',
);

const prematureReview = await request(`/v1/bookings/${created.body.booking.id}/review`, {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    techniqueRating: 5,
    professionalismRating: 5,
    tags: ['On time'],
    reviewText: 'This must not be accepted before completion.',
  }),
});
expect(prematureReview.status === 409, 'A review was accepted before the booking was completed.');

const initialProfessionalDashboard = await request<{ dashboard: ApiProfessionalDashboard }>(
  '/v1/professional/dashboard',
  { headers: professionalHeaders },
);
expect(
  initialProfessionalDashboard.status === 200 &&
    initialProfessionalDashboard.body.dashboard.jobs.some((job) => job.id === created.body.booking.id),
  'Professional job inbox did not receive the booking.',
);
// Administrator-managed travel fee cap, enforced when the professional names a fee on acceptance.
const travelFeeCapSettings = await request<{ settings: ApiAdminPlatformSettings }>('/v1/admin/settings/travel-fee-cap', { headers: adminHeaders });
expect(travelFeeCapSettings.status === 200 && travelFeeCapSettings.body.settings.travelFeeCap === 500, 'Administrator travel fee cap settings failed.');
const negativeTravelFeeCap = await request('/v1/admin/settings/travel-fee-cap', {
  method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ travelFeeCap: -1 }),
});
expect(negativeTravelFeeCap.status === 400, 'A negative travel fee cap was accepted.');
const loweredTravelFeeCap = await request<{ settings: ApiAdminPlatformSettings }>('/v1/admin/settings/travel-fee-cap', {
  method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ travelFeeCap: 300 }),
});
expect(
  loweredTravelFeeCap.status === 200 &&
    loweredTravelFeeCap.body.settings.travelFeeCap === 300 &&
    loweredTravelFeeCap.body.settings.commissionRateBps === 1800,
  'Administrator travel fee cap update failed.',
);
const cappedBooking = await request<{ booking: ApiBooking }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    requestId: `travel-fee-cap-${Date.now()}`,
    professionalId: professional.id,
    serviceId: service.id,
    dateIso: futureDateKey(35),
    time: '2:30 PM',
    addressLabel: 'Home',
    addressZone: 'Bole',
    addressDetail: 'Travel fee cap policy test address',
    femaleOnly: false,
    paymentMethod: 'cash',
  }),
});
expect(cappedBooking.status === 201 && cappedBooking.body.booking.travelFee === 0, 'A booking request pre-charged a travel fee.');
const overCapAccept = await request(`/v1/professional/bookings/${cappedBooking.body.booking.id}/accept`, {
  method: 'POST', headers: professionalHeaders, body: JSON.stringify({ travelFee: 301 }),
});
expect(overCapAccept.status === 400, 'A travel fee above the administrator cap was accepted.');
const fractionalAccept = await request(`/v1/professional/bookings/${cappedBooking.body.booking.id}/accept`, {
  method: 'POST', headers: professionalHeaders, body: JSON.stringify({ travelFee: 120.5 }),
});
expect(fractionalAccept.status === 400, 'A fractional travel fee was accepted.');
const cappedAccept = await request<{ dashboard: ApiProfessionalDashboard }>(`/v1/professional/bookings/${cappedBooking.body.booking.id}/accept`, {
  method: 'POST', headers: professionalHeaders, body: JSON.stringify({ travelFee: 250 }),
});
expect(
  cappedAccept.status === 200 &&
    cappedAccept.body.dashboard.travelFeeCap === 300 &&
    cappedAccept.body.dashboard.jobs.some((job) => (
      job.id === cappedBooking.body.booking.id && job.status === 'accepted' &&
      job.travelFee === 250 && job.total === cappedBooking.body.booking.total + 250
    )),
  'The professional travel fee was not applied on acceptance.',
);
const clientBookingsAfterFee = await request<{ bookings: ApiBooking[] }>('/v1/bookings', { headers: authenticatedHeaders });
const cappedBookingForClient = clientBookingsAfterFee.body.bookings.find((booking) => booking.id === cappedBooking.body.booking.id);
expect(
  cappedBookingForClient?.status === 'accepted' &&
    cappedBookingForClient.travelFee === 250 &&
    cappedBookingForClient.total === cappedBooking.body.booking.total + 250,
  'The client did not receive the updated total after acceptance.',
);
const cappedBookingCancellation = await request<void>(`/v1/bookings/${cappedBooking.body.booking.id}`, { method: 'DELETE', headers: authenticatedHeaders });
expect(cappedBookingCancellation.status === 204, 'Free cancellation after a travel fee was set failed.');
const restoredTravelFeeCap = await request<{ settings: ApiAdminPlatformSettings }>('/v1/admin/settings/travel-fee-cap', {
  method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ travelFeeCap: 500 }),
});
expect(restoredTravelFeeCap.body.settings.travelFeeCap === 500, 'Travel fee cap restoration failed.');

const acceptedPrimary = await request<{ dashboard: ApiProfessionalDashboard }>(
  `/v1/professional/bookings/${created.body.booking.id}/accept`,
  { method: 'POST', headers: professionalHeaders },
);
expect(
  acceptedPrimary.status === 200 && acceptedPrimary.body.dashboard.jobs.some((job) => (
    job.id === created.body.booking.id && job.status === 'accepted'
  )),
  `Professional booking acceptance failed (${acceptedPrimary.status}: ${JSON.stringify(acceptedPrimary.body)}).`,
);
const initiatedPrimaryPayment = await request<{ paymentIntent: ApiPaymentIntent; duplicate: boolean }>(
  `/v1/bookings/${created.body.booking.id}/payment`,
  { method: 'POST', headers: authenticatedHeaders },
);
expect(
  initiatedPrimaryPayment.status === 201 && !initiatedPrimaryPayment.body.duplicate &&
    initiatedPrimaryPayment.body.paymentIntent.status === 'pending',
  'Payment was not initiated after professional acceptance.',
);
createdPayment = initiatedPrimaryPayment.body.paymentIntent;
const retriedPrimaryPayment = await request<{ paymentIntent: ApiPaymentIntent; duplicate: boolean }>(
  `/v1/bookings/${created.body.booking.id}/payment`,
  { method: 'POST', headers: authenticatedHeaders },
);
expect(
  retriedPrimaryPayment.status === 200 && retriedPrimaryPayment.body.duplicate &&
    retriedPrimaryPayment.body.paymentIntent.id === createdPayment.id,
  'Accepted-booking payment idempotency failed.',
);
const paymentLookup = await request<{ paymentIntent: ApiPaymentIntent }>(
  `/v1/payments/${createdPayment.id}`,
  { headers: authenticatedHeaders },
);
expect(paymentLookup.status === 200 && paymentLookup.body.paymentIntent.status === 'pending', 'Payment lookup failed.');
const paymentEventBody = JSON.stringify({
  eventId: `payment-event-${Date.now()}`,
  providerReference: createdPayment.providerReference,
  status: 'captured',
});
const rejectedWebhook = await request('/v1/payments/webhooks/telebirr', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-konjo-signature': '0'.repeat(64) },
  body: paymentEventBody,
});
expect(rejectedWebhook.status === 401, 'An invalid payment webhook signature was accepted.');
const paymentSignature = createHmac(
  'sha256',
  process.env.KONJO_PAYMENT_WEBHOOK_SECRET || 'konjo-local-payment-webhook-secret',
).update(paymentEventBody).digest('hex');
const capturedPayment = await request<{ paymentIntent: ApiPaymentIntent; duplicate: boolean }>(
  '/v1/payments/webhooks/telebirr',
  { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-konjo-signature': paymentSignature }, body: paymentEventBody },
);
expect(
  capturedPayment.status === 200 && capturedPayment.body.paymentIntent.status === 'captured' && !capturedPayment.body.duplicate,
  'A valid payment capture webhook failed.',
);
const duplicatePaymentEvent = await request<{ duplicate: boolean }>('/v1/payments/webhooks/telebirr', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-konjo-signature': paymentSignature },
  body: paymentEventBody,
});
expect(duplicatePaymentEvent.status === 200 && duplicatePaymentEvent.body.duplicate, 'Payment event idempotency failed.');

// Live tracking is only recorded once the professional is on the way.
const earlyLocation = await request(`/v1/professional/bookings/${created.body.booking.id}/location`, {
  method: 'POST', headers: { ...professionalHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({ latitude: 9.0227, longitude: 38.766 }),
});
expect(earlyLocation.status === 409, 'Location was accepted before the professional set off.');
const noTrackingYet = await request<{ tracking: ApiBookingTracking | null }>(`/v1/bookings/${created.body.booking.id}/tracking`, { headers: authenticatedHeaders });
expect(noTrackingYet.status === 200 && noTrackingYet.body.tracking === null, 'Client saw tracking before any report.');

const reservedAvailability = await request<{ availability: { available: boolean; slots: string[] } }>(
  `/v1/professionals/${professional.id}/availability?date=${futureWorkingDateKey(30)}&serviceId=${service.id}`,
);
expect(
  reservedAvailability.status === 200 && !reservedAvailability.body.availability.available && reservedAvailability.body.availability.slots.length === 0,
  'An accepted booking did not remove the professional availability slots.',
);
const busyProfessionalBooking = await request<{ error: { code: string } }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    ...primaryBookingInput,
    requestId: `busy-professional-${Date.now()}`,
    dateIso: futureWorkingDateKey(30),
    time: '9:00 AM',
    femaleOnly: false,
  }),
});
expect(
  busyProfessionalBooking.status === 409 && busyProfessionalBooking.body.error.code === 'PROFESSIONAL_BUSY',
  'A client could request another booking while the professional had an accepted booking.',
);
const earlyTravel = await request<{ error: { code: string } }>(
  `/v1/professional/bookings/${created.body.booking.id}/travel`,
  { method: 'POST', headers: professionalHeaders },
);
expect(
  earlyTravel.status === 409 && earlyTravel.body.error.code === 'BOOKING_NOT_STARTED',
  'A professional could start travel before the scheduled appointment time.',
);

// Advance this isolated SQLite fixture to its appointment start so the smoke
// test can cover the remaining arrival/check-in/checkout flow without waiting.
advanceBookingToStart(created.body.booking.id);

for (const [action, expectedStatus] of [
  ['travel', 'on_the_way'],
  ['arrive', 'on_the_way'],
  ['check-in', 'in_progress'],
] as const) {
  const transition = await request<{ dashboard: ApiProfessionalDashboard }>(
    `/v1/professional/bookings/${created.body.booking.id}/${action}`,
    { method: 'POST', headers: professionalHeaders },
  );
  expect(
    transition.status === 200 &&
      transition.body.dashboard.jobs.some((job) => job.id === created.body.booking.id && job.status === expectedStatus),
    `Professional booking action ${action} failed.`,
  );
}

// On the way / on site: the professional's phone reports positions with an area label,
// the client reads the latest one back, and strangers get nothing.
const reported = await request<{ tracking: ApiBookingTracking | null }>(`/v1/professional/bookings/${created.body.booking.id}/location`, {
  method: 'POST', headers: { ...professionalHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({ latitude: 9.0227, longitude: 38.766, accuracyMeters: 12, heading: 90, speedMps: 4, areaLabel: '  Kazanchis,  Addis Ababa ' }),
});
expect(reported.status === 200 && reported.body.tracking?.areaLabel === 'Kazanchis, Addis Ababa' && reported.body.tracking.latitude === 9.0227, 'Location report failed.');
const clientTracking = await request<{ tracking: ApiBookingTracking | null }>(`/v1/bookings/${created.body.booking.id}/tracking`, { headers: authenticatedHeaders });
expect(clientTracking.status === 200 && clientTracking.body.tracking?.longitude === 38.766 && clientTracking.body.tracking.areaLabel === 'Kazanchis, Addis Ababa', 'Client could not read live tracking.');
const laterReport = await request<{ tracking: ApiBookingTracking | null }>(`/v1/professional/bookings/${created.body.booking.id}/location`, {
  method: 'POST', headers: { ...professionalHeaders, 'Content-Type': 'application/json' },
  body: JSON.stringify({ latitude: 9.0235, longitude: 38.7672 }),
});
expect(laterReport.status === 200 && laterReport.body.tracking?.latitude === 9.0235 && laterReport.body.tracking.areaLabel === 'Kazanchis, Addis Ababa', 'A report without a label must keep the previous area.');
const clientSos = await request<{ safetyIncident: ApiSafetyIncident; duplicate: boolean }>(
  `/v1/bookings/${created.body.booking.id}/sos`,
  {
    method: 'POST',
    headers: authenticatedHeaders,
    body: JSON.stringify({ latitude: 9.0108, longitude: 38.7613, accuracyMeters: 12 }),
  },
);
expect(
  clientSos.status === 201 && !clientSos.body.duplicate && clientSos.body.safetyIncident.latitude === 9.0108,
  'Client SOS escalation with location failed.',
);
const duplicateClientSos = await request<{ safetyIncident: ApiSafetyIncident; duplicate: boolean }>(
  `/v1/bookings/${created.body.booking.id}/sos`,
  { method: 'POST', headers: authenticatedHeaders, body: JSON.stringify({}) },
);
expect(
  duplicateClientSos.status === 200 && duplicateClientSos.body.duplicate && duplicateClientSos.body.safetyIncident.id === clientSos.body.safetyIncident.id,
  'Client SOS idempotency failed.',
);
const professionalSos = await request<{ safetyIncident: ApiSafetyIncident }>(
  `/v1/bookings/${created.body.booking.id}/sos`,
  { method: 'POST', headers: professionalHeaders, body: JSON.stringify({}) },
);
expect(professionalSos.status === 201, 'Professional SOS escalation failed.');
const safetyQueue = await request<{ safetyIncidents: ApiSafetyIncident[] }>('/v1/admin/safety-incidents', {
  headers: adminHeaders,
});
expect(
  safetyQueue.status === 200 && safetyQueue.body.safetyIncidents.filter((incident) => incident.bookingId === created.body.booking.id).length === 2,
  'Administrator safety incident queue failed.',
);
for (const incident of [clientSos.body.safetyIncident, professionalSos.body.safetyIncident]) {
  const resolved = await request<{ safetyIncident: ApiSafetyIncident }>(
    `/v1/admin/safety-incidents/${incident.id}/resolve`,
    {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ resolution: 'Smoke test confirmed both participants are safe.' }),
    },
  );
  expect(resolved.status === 200 && resolved.body.safetyIncident.status === 'resolved', 'SOS resolution failed.');
}

const lateCancellation = await request<void>(`/v1/bookings/${created.body.booking.id}`, {
  method: 'DELETE',
  headers: authenticatedHeaders,
});
expect(lateCancellation.status === 409, 'An in-progress booking was cancelled by the client.');

const completion = await request<{ dashboard: ApiProfessionalDashboard }>(
  `/v1/professional/bookings/${created.body.booking.id}/complete`,
  { method: 'POST', headers: professionalHeaders },
);
const trackingAfterCompletion = await request<{ tracking: ApiBookingTracking | null }>(`/v1/bookings/${created.body.booking.id}/tracking`, { headers: authenticatedHeaders });
expect(trackingAfterCompletion.status === 200 && trackingAfterCompletion.body.tracking === null, 'Tracking was not cleared after checkout.');
const expectedNetEarnings = created.body.booking.total - Math.round(created.body.booking.servicePrice * 0.18);
expect(completion.status === 200 && completion.body.dashboard.weekEarnings === 0, 'Checkout released earnings before final payment.');
const finalPayment = await request<{ paymentIntent: ApiPaymentIntent }>(`/v1/bookings/${created.body.booking.id}/payment`, {
  method: 'POST', headers: authenticatedHeaders,
});
expect(finalPayment.status === 201 && finalPayment.body.paymentIntent.stage === 'balance', 'Final installment was not available after checkout.');
expect(createdPayment.amount + finalPayment.body.paymentIntent.amount === created.body.booking.total, 'Installments do not add up to the quote.');
expect((await capturePayment(finalPayment.body.paymentIntent, 'final-payment')).status === 200, 'Final payment capture failed.');
const paidDashboard = await request<{ dashboard: ApiProfessionalDashboard }>('/v1/professional/dashboard', { headers: professionalHeaders });
expect(
  completion.status === 200 &&
    completion.body.dashboard.completedCount === 1 &&
    paidDashboard.body.dashboard.weekEarnings === expectedNetEarnings &&
    !completion.body.dashboard.jobs.some((job) => job.id === created.body.booking.id),
  'Professional check-out or earnings calculation failed.',
);
const completedLedgerAudit = await request<{
  audit: { balanced: boolean; groups: Array<{ entryGroup: string; total: number }> };
}>(`/v1/development/payments/${createdPayment.id}/ledger-audit`, {
  headers: authenticatedHeaders,
});
expect(
  completedLedgerAudit.status === 200 &&
    completedLedgerAudit.body.audit.balanced &&
    completedLedgerAudit.body.audit.groups.length === 2,
  'Captured and released payment ledger groups are not balanced.',
);
// Administrators see who is owed money and where to send it before batching.
const pendingPayouts = await request<{ pending: Array<{ professionalId: string; amount: number; bookingCount: number; payoutMethod: { type: string; accountNumber: string } | null }> }>(
  '/v1/admin/payouts/pending',
  { headers: adminHeaders },
);
expect(
  pendingPayouts.status === 200 && pendingPayouts.body.pending.some((item) => (
    item.professionalId === professional.id && item.amount === expectedNetEarnings && item.bookingCount === 1 &&
    item.payoutMethod?.type === 'telebirr' && item.payoutMethod.accountNumber === '+251911000000'
  )),
  'Pending payouts did not list the owed professional with their payout method.',
);
const payoutBatch = await request<{ payout: ApiPayoutBatch }>(
  '/v1/development/professional/payouts/batch',
  { method: 'POST', headers: professionalHeaders },
);
expect(
  payoutBatch.status === 201 &&
    payoutBatch.body.payout.amount === expectedNetEarnings &&
    payoutBatch.body.payout.bookingCount === 1 &&
    payoutBatch.body.payout.payoutMethod?.type === 'telebirr',
  'Professional payout batching failed or did not snapshot the payout method.',
);
const pendingAfterBatch = await request<{ pending: Array<{ professionalId: string }> }>('/v1/admin/payouts/pending', { headers: adminHeaders });
expect(!pendingAfterBatch.body.pending.some((item) => item.professionalId === professional.id), 'Batched earnings still counted as pending.');
const adminQueueNothing = await request('/v1/admin/payouts/queue', {
  method: 'POST', headers: adminHeaders, body: JSON.stringify({ professionalId: professional.id }),
});
expect(adminQueueNothing.status === 409, 'Queueing a payout with nothing owed was accepted.');
const duplicatePayoutBatch = await request('/v1/development/professional/payouts/batch', {
  method: 'POST',
  headers: professionalHeaders,
});
expect(duplicatePayoutBatch.status === 409, 'Earnings were included in more than one payout batch.');
const payouts = await request<{ payouts: ApiPayoutBatch[] }>('/v1/professional/payouts', {
  headers: professionalHeaders,
});
expect(
  payouts.status === 200 && payouts.body.payouts.some((payout) => payout.id === payoutBatch.body.payout.id),
  'Professional payout history failed.',
);
// The administrator pays outside the app and records the transfer reference.
const adminPaidPayout = await request<{ payout: ApiPayoutBatch }>(
  `/v1/admin/payouts/${payoutBatch.body.payout.id}/mark-paid`,
  { method: 'POST', headers: adminHeaders, body: JSON.stringify({ professionalId: professional.id, paidReference: 'TB-SMOKE-1', paidNote: 'Paid via Telebirr' }) },
);
expect(
  adminPaidPayout.status === 200 && adminPaidPayout.body.payout.status === 'paid' &&
    adminPaidPayout.body.payout.paidReference === 'TB-SMOKE-1' && adminPaidPayout.body.payout.paidNote === 'Paid via Telebirr',
  'Administrator payout settlement did not record the transfer reference.',
);
const professionalPayoutHistory = await request<{ payouts: ApiPayoutBatch[] }>('/v1/professional/payouts', { headers: professionalHeaders });
expect(
  professionalPayoutHistory.body.payouts.find((payout) => payout.id === payoutBatch.body.payout.id)?.paidReference === 'TB-SMOKE-1',
  'The professional cannot see the payout transfer reference.',
);
const paidPayout = await request<{ payout: ApiPayoutBatch }>(
  `/v1/development/professional/payouts/${payoutBatch.body.payout.id}/pay`,
  { method: 'POST', headers: professionalHeaders },
);
expect(
  paidPayout.status === 200 && paidPayout.body.payout.status === 'paid' && Boolean(paidPayout.body.payout.paidAt),
  'Sandbox payout settlement failed.',
);
const adminBookings = await request<{ bookings: ApiBooking[] }>('/v1/admin/bookings', { headers: adminHeaders });
expect(
  adminBookings.status === 200 && adminBookings.body.bookings.some((booking) => booking.id === created.body.booking.id),
  'Administrator booking oversight failed.',
);
const filteredAdminBookings = await request<{ bookings: ApiBooking[] }>(
  '/v1/admin/bookings?query=Backend%20Test%20Client&status=completed',
  { headers: adminHeaders },
);
expect(
  filteredAdminBookings.status === 200 && filteredAdminBookings.body.bookings.some((booking) => booking.id === created.body.booking.id),
  'Administrator booking search and status filtering failed.',
);
const invalidBookingFilter = await request('/v1/admin/bookings?status=unknown', { headers: adminHeaders });
expect(invalidBookingFilter.status === 400, 'Administrator booking search accepted an invalid status.');
const adminPayouts = await request<{ payouts: ApiPayoutBatch[] }>('/v1/admin/payouts', { headers: adminHeaders });
expect(
  adminPayouts.status === 200 && adminPayouts.body.payouts.some((payout) => payout.id === payoutBatch.body.payout.id),
  'Administrator payout oversight failed.',
);
const bookingExport = await requestText('/v1/admin/exports/bookings.csv', { headers: adminHeaders });
expect(
  bookingExport.status === 200 && bookingExport.body.startsWith('booking_id,client,professional'),
  'Administrator booking CSV export failed.',
);
const revenueExport = await requestText('/v1/admin/exports/revenue.csv', { headers: adminHeaders });
expect(revenueExport.status === 200 && revenueExport.body.startsWith('booking_id,created_at,payment_status,gross_etb'), 'Administrator revenue CSV export failed.');
const professionalExport = await requestText('/v1/admin/exports/professionals.csv', { headers: adminHeaders });
expect(professionalExport.status === 200 && professionalExport.body.startsWith('professional_id,display_name,category,status'), 'Administrator professional CSV export failed.');

const review = await request<{ review: ApiBookingReview }>(`/v1/bookings/${created.body.booking.id}/review`, {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    techniqueRating: 2,
    professionalismRating: 2,
    tags: ['Needs follow-up'],
    reviewText: 'A low completed-booking review that should trigger operations follow-up.',
  }),
});
expect(
  review.status === 201 && review.body.review.techniqueRating === 2,
  'Completed booking review submission failed.',
);
const duplicateReview = await request(`/v1/bookings/${created.body.booking.id}/review`, {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    techniqueRating: 5,
    professionalismRating: 5,
    tags: [],
    reviewText: '',
  }),
});
expect(duplicateReview.status === 409, 'A duplicate booking review was accepted.');
const qualityFlags = await request<{ qualityFlags: ApiProfessionalQualityFlag[] }>('/v1/admin/quality-flags', {
  headers: adminHeaders,
});
const qualityFlag = qualityFlags.body.qualityFlags.find((flag) => flag.bookingId === created.body.booking.id);
expect(
  qualityFlags.status === 200 && qualityFlag?.status === 'open' && qualityFlag.averageRating === 2,
  'A low completed-booking rating did not create an administrator quality flag.',
);
const hiddenCatalog = await request<{ professionals: ApiProfessionalSummary[] }>('/v1/professionals');
expect(
  !hiddenCatalog.body.professionals.some((item) => item.id === professional.id),
  'A professional with a sub-3.0 rating remained visible in discovery.',
);
const resolvedQualityFlag = await request<{ qualityFlag: ApiProfessionalQualityFlag }>(
  `/v1/admin/quality-flags/${qualityFlag!.id}/resolve`,
  {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      resolution: 'Operations completed the professional quality review and restored the profile.',
      action: 'restore',
    }),
  },
);
expect(
  resolvedQualityFlag.status === 200 && resolvedQualityFlag.body.qualityFlag.status === 'resolved',
  'Administrator quality flag resolution failed.',
);
const restoredCatalog = await request<{ professionals: ApiProfessionalSummary[] }>('/v1/professionals');
expect(
  restoredCatalog.body.professionals.some((item) => item.id === professional.id),
  'Administrator quality review did not restore the professional profile.',
);

const dispute = await request<{ dispute: ApiBookingDispute }>(
  `/v1/bookings/${created.body.booking.id}/dispute`,
  {
    method: 'POST',
    headers: authenticatedHeaders,
    body: JSON.stringify({ reason: 'The completed booking needs an administrator review for this smoke test.' }),
  },
);
expect(dispute.status === 201 && dispute.body.dispute.status === 'open', 'Client dispute creation failed.');
const adminDisputes = await request<{ disputes: ApiBookingDispute[] }>('/v1/admin/disputes', {
  headers: adminHeaders,
});
expect(
  adminDisputes.status === 200 && adminDisputes.body.disputes.some((item) => item.id === dispute.body.dispute.id),
  'Administrator dispute queue failed.',
);
const resolvedDispute = await request<{ dispute: ApiBookingDispute }>(
  `/v1/admin/disputes/${dispute.body.dispute.id}/resolve`,
  {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ status: 'resolved', resolution: 'Reviewed and documented by the smoke-test administrator.' }),
  },
);
expect(resolvedDispute.status === 200 && resolvedDispute.body.dispute.status === 'resolved', 'Dispute resolution failed.');

const completedBookings = await request<{ bookings: ApiBooking[] }>('/v1/bookings', { headers: authenticatedHeaders });
// The client may then tidy the finished booking away; the record itself survives for the professional and support.
const archived = await request(`/v1/bookings/${created.body.booking.id}/archive`, { method: 'POST', headers: authenticatedHeaders });
expect(archived.status === 204, 'Client could not remove a completed booking from history.');
const historyAfterArchive = await request<{ bookings: ApiBooking[] }>('/v1/bookings', { headers: authenticatedHeaders });
expect(historyAfterArchive.status === 200 && !historyAfterArchive.body.bookings.some((booking) => booking.id === created.body.booking.id), 'Archived booking still listed.');
const archiveAgain = await request(`/v1/bookings/${created.body.booking.id}/archive`, { method: 'POST', headers: authenticatedHeaders });
expect(archiveAgain.status === 204, 'Archiving twice should be harmless.');
expect(
  completedBookings.body.bookings.some((booking) => (
    booking.id === created.body.booking.id && booking.status === 'completed' && booking.review?.id === review.body.review.id
  )),
  'Completed status or review was not restored for the client.',
);

const cancellableBooking = await request<{ booking: ApiBooking; paymentIntent: null }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    requestId: `cancellable-${Date.now()}`,
    professionalId: professional.id,
    serviceId: service.id,
    dateIso: futureDateKey(9),
    time: '10:30 AM',
    addressLabel: 'Home',
    addressZone: 'Bole',
    addressDetail: 'Second backend smoke test address near the main gate',
    femaleOnly: false,
    paymentMethod: 'cbe',
  }),
});
expect(
  cancellableBooking.status === 201 && cancellableBooking.body.paymentIntent === null,
  `Cancellable booking creation failed with status ${cancellableBooking.status}: ${JSON.stringify(cancellableBooking.body)}`,
);
expect((await request(
  `/v1/professional/bookings/${cancellableBooking.body.booking.id}/accept`,
  { method: 'POST', headers: professionalHeaders },
)).status === 200, 'Refund test booking acceptance failed.');
const cancellablePaymentResponse = await request<{ paymentIntent: ApiPaymentIntent }>(
  `/v1/bookings/${cancellableBooking.body.booking.id}/payment`,
  { method: 'POST', headers: authenticatedHeaders },
);
expect(cancellablePaymentResponse.status === 201, 'Cancellable booking payment initiation failed.');
const cancellation = await request<void>(`/v1/bookings/${cancellableBooking.body.booking.id}`, {
  method: 'DELETE',
  headers: authenticatedHeaders,
});
expect(cancellation.status === 204, 'Booking cancellation failed.');

const journeyCancellation = await request<{ booking: ApiBooking; paymentIntent: null }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    requestId: `journey-cancel-${Date.now()}`,
    professionalId: professional.id,
    serviceId: service.id,
    dateIso: futureDateKey(20),
    time: '9:00 AM',
    addressLabel: 'Home',
    addressZone: 'CMC',
    addressDetail: 'Journey cancellation policy test address',
    femaleOnly: false,
    paymentMethod: 'telebirr',
  }),
});
expect(
  journeyCancellation.status === 201 && journeyCancellation.body.booking.travelFee === 0,
  'Travel-fee cancellation test booking failed.',
);
// The professional names the travel fee on acceptance; it is what the client forfeits after the journey starts.
const journeyTravelFee = 150;
expect((await request(
  `/v1/professional/bookings/${journeyCancellation.body.booking.id}/accept`,
  { method: 'POST', headers: professionalHeaders, body: JSON.stringify({ travelFee: journeyTravelFee }) },
)).status === 200, 'Travel-fee cancellation accept transition failed.');
const journeyPaymentResponse = await request<{ paymentIntent: ApiPaymentIntent }>(
  `/v1/bookings/${journeyCancellation.body.booking.id}/payment`,
  { method: 'POST', headers: authenticatedHeaders },
);
const journeyPayment = journeyPaymentResponse.body.paymentIntent;
expect(
  journeyPaymentResponse.status === 201 && (await capturePayment(journeyPayment, 'journey-cancel')).status === 200,
  'Travel-fee cancellation payment capture failed.',
);
advanceBookingToStart(journeyCancellation.body.booking.id);
expect((await request(
  `/v1/professional/bookings/${journeyCancellation.body.booking.id}/travel`,
  { method: 'POST', headers: professionalHeaders },
)).status === 200, 'Travel-fee cancellation travel transition failed.');
const cancelledAfterJourney = await request<void>(`/v1/bookings/${journeyCancellation.body.booking.id}`, {
  method: 'DELETE',
  headers: authenticatedHeaders,
});
expect(cancelledAfterJourney.status === 204, 'Client could not cancel after the professional started traveling.');
const journeyCancellationHistory = await request<{ bookings: ApiBooking[] }>('/v1/bookings', {
  headers: authenticatedHeaders,
});
expect(
  journeyCancellationHistory.body.bookings.find((booking) => booking.id === journeyCancellation.body.booking.id)?.cancellationPolicy === 'travel_fee_forfeit',
  'Travel-fee forfeiture policy was not persisted on the cancelled booking.',
);
const journeyCancellationPayment = await request<{ paymentIntent: ApiPaymentIntent }>(
  `/v1/payments/${journeyPayment.id}`,
  { headers: authenticatedHeaders },
);
expect(
  journeyCancellationPayment.body.paymentIntent.status === 'refunded' &&
    journeyCancellationPayment.body.paymentIntent.refundedAmount === Math.max(0, journeyPayment.amount - journeyTravelFee),
  'Cancellation after journey start did not refund the deposit less the travel fee.',
);
const journeyCancellationLedger = await request<{
  audit: { balanced: boolean; groups: Array<{ entryGroup: string; total: number }> };
}>(`/v1/development/payments/${journeyPayment.id}/ledger-audit`, {
  headers: authenticatedHeaders,
});
expect(
  journeyCancellationLedger.body.audit.balanced && journeyCancellationLedger.body.audit.groups.length === 2,
  'Travel-fee forfeiture ledger groups are not balanced.',
);

const noShowBooking = await request<{ booking: ApiBooking; paymentIntent: null }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    requestId: `client-no-show-${Date.now()}`,
    professionalId: professional.id,
    serviceId: service.id,
    dateIso: futureDateKey(21),
    time: '10:30 AM',
    addressLabel: 'Home',
    addressZone: 'CMC',
    addressDetail: 'Client no-show policy test address',
    femaleOnly: false,
    paymentMethod: 'telebirr',
  }),
});
expect(noShowBooking.status === 201, 'Client no-show test booking failed.');
// The travel fee named on acceptance is retained for the professional on a client no-show.
const noShowTravelFee = 100;
expect((await request(
  `/v1/professional/bookings/${noShowBooking.body.booking.id}/accept`,
  { method: 'POST', headers: professionalHeaders, body: JSON.stringify({ travelFee: noShowTravelFee }) },
)).status === 200, 'Client no-show accept transition failed.');
const noShowPaymentResponse = await request<{ paymentIntent: ApiPaymentIntent }>(
  `/v1/bookings/${noShowBooking.body.booking.id}/payment`,
  { method: 'POST', headers: authenticatedHeaders },
);
const noShowPaymentIntent = noShowPaymentResponse.body.paymentIntent;
expect(
  noShowPaymentResponse.status === 201 && (await capturePayment(noShowPaymentIntent, 'client-no-show')).status === 200,
  'Client no-show payment capture failed.',
);
advanceBookingToStart(noShowBooking.body.booking.id);
for (const action of ['travel', 'no-show'] as const) {
  const transition = await request(
    `/v1/professional/bookings/${noShowBooking.body.booking.id}/${action}`,
    { method: 'POST', headers: professionalHeaders },
  );
  expect(transition.status === 200, `Client no-show ${action} transition failed.`);
}
const noShowHistory = await request<{ bookings: ApiBooking[] }>('/v1/bookings', { headers: authenticatedHeaders });
expect(
  noShowHistory.body.bookings.find((booking) => booking.id === noShowBooking.body.booking.id)?.cancellationPolicy === 'client_no_show',
  'Client no-show policy was not persisted.',
);
const noShowPayment = await request<{ paymentIntent: ApiPaymentIntent }>(
  `/v1/payments/${noShowPaymentIntent.id}`,
  { headers: authenticatedHeaders },
);
const noShowCommission = Math.round(service.price * 0.18);
expect(
  noShowPayment.body.paymentIntent.status === 'refunded' &&
    noShowPayment.body.paymentIntent.refundedAmount === Math.max(0, noShowPaymentIntent.amount - noShowTravelFee - noShowCommission),
  'Client no-show refund did not retain the travel fee and platform commission.',
);
const noShowLedger = await request<{
  audit: { balanced: boolean; groups: Array<{ entryGroup: string; total: number }> };
}>(`/v1/development/payments/${noShowPaymentIntent.id}/ledger-audit`, {
  headers: authenticatedHeaders,
});
expect(noShowLedger.body.audit.balanced, 'Client no-show ledger groups are not balanced.');

const cancelledBookings = await request<{ bookings: ApiBooking[] }>('/v1/bookings', { headers: authenticatedHeaders });
expect(
  cancelledBookings.status === 200 &&
    cancelledBookings.body.bookings.some((booking) => booking.id === cancellableBooking.body.booking.id && booking.status === 'cancelled'),
  'Cancelled booking status was not persisted.',
);

const reassignmentBooking = await request<{ booking: ApiBooking; paymentIntent: null }>('/v1/bookings', {
  method: 'POST',
  headers: authenticatedHeaders,
  body: JSON.stringify({
    requestId: `reassignment-${Date.now()}`,
    professionalId: professional.id,
    serviceId: service.id,
    dateIso: futureWorkingDateKey(10),
    time: '9:00 AM',
    addressLabel: 'Home',
    addressZone: 'Bole',
    addressDetail: 'Reassignment smoke test address near the main gate',
    femaleOnly: false,
    paymentMethod: 'cash',
  }),
});
expect(reassignmentBooking.status === 201, 'Reassignment test booking creation failed.');
const reassignmentWorker = await request<{
  reassigned: Array<{ bookingId: string; professionalId: string }>;
}>('/v1/development/jobs/run', {
  method: 'POST',
  headers: adminHeaders,
  body: JSON.stringify({ now: new Date(Date.now() + 16 * 60 * 1000).toISOString() }),
});
expect(
  reassignmentWorker.status === 200 &&
    reassignmentWorker.body.reassigned.some((item) => (
      item.bookingId === reassignmentBooking.body.booking.id && item.professionalId === 'hanan'
    )),
  'The overdue booking was not reassigned after 15 minutes.',
);
const bookingsAfterReassignment = await request<{ bookings: ApiBooking[] }>('/v1/bookings', {
  headers: authenticatedHeaders,
});
expect(
  bookingsAfterReassignment.body.bookings.some((booking) => (
    booking.id === reassignmentBooking.body.booking.id && booking.professionalId === 'hanan'
  )),
  'The reassigned professional was not persisted.',
);
const cancelReassignedBooking = await request<void>(`/v1/bookings/${reassignmentBooking.body.booking.id}`, {
  method: 'DELETE',
  headers: authenticatedHeaders,
});
expect(cancelReassignedBooking.status === 204, 'Reassigned booking cancellation failed.');

const resetRequest = await request<ApiPasswordResetRequest>('/v1/auth/password-reset/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email }),
});
expect(resetRequest.status === 202 && resetRequest.body.developmentToken, 'Password reset request failed.');

const newPassword = 'Konjo-new-test-password-2026';
const resetConfirmation = await request<void>('/v1/auth/password-reset/confirm', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: resetRequest.body.developmentToken, password: newPassword }),
});
expect(resetConfirmation.status === 204, 'Password reset confirmation failed.');

const revokedProfile = await request('/v1/me', { headers: authenticatedHeaders });
expect(revokedProfile.status === 401, 'Password reset did not revoke existing sessions.');

const oldPasswordLogin = await request('/v1/auth/login/client', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
expect(oldPasswordLogin.status === 401, 'Old password remained valid after reset.');

const resetLogin = await request<AuthApiResponse>('/v1/auth/login/client', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: newPassword }),
});
expect(resetLogin.status === 200, 'New password login failed.');

const resetAuthenticatedHeaders = {
  Authorization: `Bearer ${resetLogin.body.session.token}`,
  'Content-Type': 'application/json',
};
const deletion = await request<void>('/v1/me', { method: 'DELETE', headers: resetAuthenticatedHeaders });
expect(deletion.status === 204, 'Account deletion failed.');

const deletedProfile = await request('/v1/me', { headers: resetAuthenticatedHeaders });
expect(deletedProfile.status === 401, 'Deleted session remained active.');

const professionalDeletion = await request<void>('/v1/me', {
  method: 'DELETE',
  headers: professionalHeaders,
});
expect(professionalDeletion.status === 204, 'Professional test account deletion failed.');

console.log('Konjo API smoke test passed.');
