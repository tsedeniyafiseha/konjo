import assert from 'node:assert/strict';
import { professionalEntryRoute, professionalRouteRedirect } from '../../src/application/professional-registration/professional-entry-route.ts';
import type { ProfessionalDocument } from '../../src/application/professional-documents/professional-document-contracts.ts';

import type { AuthSession } from '../../src/application/auth/session-controller.ts';
import {
  ProfessionalRegistrationController,
  type ProfessionalRegistrationGateway,
  type ProfessionalRegistrationRuntime,
  type ProfessionalRegistrationStorage,
  type StoredProfessionalRegistration,
} from '../../src/application/professional-registration/professional-registration-controller.ts';
import {
  initialProfessionalRegistrationDraft,
  isServicesComplete,
  type ProfessionalApplication,
  type ProfessionalRegistrationDraft,
} from '../../src/application/professional-registration/professional-registration-contracts.ts';
import {
  localizedSpecialtyName,
  localizedSpokenLanguageName,
} from '../../src/features/professional/registration/professional-onboarding-labels.ts';

const apiSession: AuthSession = {
  userId: 'professional-1',
  expiresAt: 2_000_000_000_000,
  source: 'api',
  role: 'professional',
  authMethod: 'email_password',
  accessToken: 'professional-token',
};

const secondSession: AuthSession = {
  ...apiSession,
  userId: 'professional-2',
  source: 'development',
  accessToken: undefined,
};

const cachedDraft: ProfessionalRegistrationDraft = {
  ...initialProfessionalRegistrationDraft,
  preferredLanguage: 'am',
  profile: {
    ...initialProfessionalRegistrationDraft.profile,
    displayName: 'Cached Professional',
  },
};

const remoteDraft: ProfessionalRegistrationDraft = {
  ...cachedDraft,
  preferredLanguage: 'en',
  profile: { ...cachedDraft.profile, displayName: 'Remote Professional' },
};

const remoteApplication: ProfessionalApplication = {
  ...remoteDraft,
  id: 'KJ-PRO-1',
  status: 'pending',
  submittedAt: 1_000,
};

{
  for (const status of ['pending', 'rejected', 'changes_requested', 'suspended'] as const) {
    const application = { ...remoteApplication, status };
    for (const path of ['/pro/home', '/pro/job', '/pro/earnings', '/pro/profile', '/pro/calendar']) {
      assert.equal(professionalRouteRedirect(application, path), '/pro/pending', `${status} cannot access ${path}`);
    }
    assert.equal(professionalRouteRedirect(application, '/pro/pending'), null);
    assert.equal(professionalRouteRedirect(application, '/pro/onboarding/profile'),
      status === 'rejected' || status === 'changes_requested' ? null : '/pro/pending');
  }
  const approved = { ...remoteApplication, status: 'approved' as const };
  assert.equal(professionalRouteRedirect(approved, '/pro/home'), null);
  assert.equal(professionalRouteRedirect(approved, '/pro/pending'), '/pro/home');
  assert.equal(professionalRouteRedirect(approved, '/pro/onboarding/profile'), '/pro/home');
  assert.equal(professionalRouteRedirect(null, '/pro/home'), '/pro');
  assert.equal(professionalRouteRedirect(null, '/pro/onboarding/profile'), null);
  assert.equal(professionalRouteRedirect({ ...remoteApplication, status: 'unknown' as ProfessionalApplication['status'] }, '/pro/home'), '/pro/pending', 'Unexpected statuses must fail closed.');
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function storage(
  overrides: Partial<ProfessionalRegistrationStorage> = {},
): ProfessionalRegistrationStorage {
  return {
    async read() { return null; },
    async write() {},
    async delete() {},
    ...overrides,
  };
}

function gateway(
  overrides: Partial<ProfessionalRegistrationGateway> = {},
): ProfessionalRegistrationGateway {
  return {
    async loadApplication() { return null; },
    async submitApplication(draft) {
      return { ...draft, id: 'KJ-PRO-NEW', status: 'pending', submittedAt: 2_000 };
    },
    ...overrides,
  };
}

let serviceId = 0;
const runtime: ProfessionalRegistrationRuntime = {
  createServiceId() {
    serviceId += 1;
    return `generated-service-${serviceId}`;
  },
};

function controller(
  registrationStorage: ProfessionalRegistrationStorage,
  registrationGateway: ProfessionalRegistrationGateway,
) {
  return new ProfessionalRegistrationController(
    registrationStorage,
    registrationGateway,
    runtime,
    initialProfessionalRegistrationDraft,
  );
}

{
  let status: ProfessionalApplication['status'] = 'pending';
  let fail = false;
  const registration = controller(storage(), gateway({
    async loadApplication() {
      if (fail) throw new Error('Network unavailable');
      return { ...remoteApplication, status };
    },
  }));
  await registration.setSession(apiSession);
  assert.equal(registration.getSnapshot().application?.status, 'pending');
  fail = true;
  await assert.rejects(registration.refreshApplication(), /Network unavailable/);
  assert.equal(registration.getSnapshot().application?.status, 'pending', 'A failed status check must not unlock the app.');
  fail = false;
  status = 'rejected';
  await registration.refreshApplication();
  assert.equal(registration.getSnapshot().application?.status, 'rejected');
  status = 'approved';
  await registration.refreshApplication();
  assert.equal(registration.getSnapshot().application?.status, 'approved');
  await assert.rejects(registration.submit(), /cannot be resubmitted/);
}

{
  const delayed = deferred<ProfessionalApplication>();
  let loads = 0;
  const registration = controller(storage(), gateway({
    async loadApplication() { return ++loads === 1 ? remoteApplication : delayed.promise; },
  }));
  await registration.setSession(apiSession);
  const refresh = registration.refreshApplication();
  await Promise.resolve();
  await registration.setSession(secondSession);
  delayed.resolve({ ...remoteApplication, status: 'approved' });
  await assert.rejects(refresh, /session changed/);
  assert.equal(registration.getSnapshot().application, null, 'A previous account’s review must not unlock another account.');
}

{
  const remote = deferred<ProfessionalApplication | null>();
  const writes: Array<{ userId: string; value: StoredProfessionalRegistration }> = [];
  const registration = controller(storage({
    async read() { return { draft: cachedDraft, application: null }; },
    async write(userId, value) { writes.push({ userId, value }); },
  }), gateway({
    async loadApplication() { return remote.promise; },
  }));
  const loading = registration.setSession(apiSession);
  await Promise.resolve();
  assert.equal(registration.getSnapshot().draft.profile.displayName, 'Cached Professional');
  assert.equal(registration.getSnapshot().loadStatus, 'loading');
  remote.resolve(remoteApplication);
  await loading;
  await Promise.resolve();
  assert.equal(registration.getSnapshot().draft.profile.displayName, 'Remote Professional');
  assert.equal(registration.getSnapshot().application?.id, 'KJ-PRO-1');
  assert.equal(registration.getSnapshot().loadStatus, 'ready');
  assert.equal(writes.at(-1)?.userId, 'professional-1');
  assert.equal(writes.at(-1)?.value.draft.identity.credentialAdded, false);
  assert.equal(writes.at(-1)?.value.application?.identity.credentialAdded, false);
}

{
  const firstRead = deferred<StoredProfessionalRegistration | null>();
  let reads = 0;
  const registration = controller(storage({
    async read(userId) {
      reads += 1;
      if (reads === 1) return firstRead.promise;
      return {
        draft: {
          ...initialProfessionalRegistrationDraft,
          profile: { ...initialProfessionalRegistrationDraft.profile, displayName: userId },
        },
        application: null,
      };
    },
  }), gateway());
  const firstLoad = registration.setSession({ ...secondSession, userId: 'professional-1' });
  const secondLoad = registration.setSession(secondSession);
  await secondLoad;
  firstRead.resolve({ draft: cachedDraft, application: null });
  await firstLoad;
  assert.equal(registration.getSnapshot().draft.profile.displayName, 'professional-2');
}

{
  const writes: StoredProfessionalRegistration[] = [];
  const registration = controller(storage({
    async write(_userId, value) { writes.push(value); },
  }), gateway());
  await registration.setSession(secondSession);
  writes.length = 0;
  registration.setPreferredLanguage('om');
  registration.updateProfile({ displayName: 'Hanan' });
  registration.updateProfile({ specialty: 'hair' });
  registration.updateService('service-1', { price: 900 });
  registration.addService();
  registration.toggleWorkingDay('Monday');
  registration.cycleWorkingHours('Tuesday');
  registration.toggleTravelZone('bole');
  registration.toggleSameDayBookings();
  registration.setTermsAccepted(true);
  await Promise.resolve();
  await Promise.resolve();
  const snapshot = registration.getSnapshot();
  assert.equal(snapshot.draft.preferredLanguage, 'om');
  assert.equal(snapshot.draft.profile.displayName, 'Hanan');
  assert.equal(snapshot.draft.services[0].category, 'hair');
  assert.equal(snapshot.draft.services[0].name, 'Hair styling');
  assert.equal(snapshot.draft.services[0].price, 900);
  assert.equal(isServicesComplete(snapshot.draft.services.slice(0, 1)), true);
  assert.equal(snapshot.draft.services.at(-1)?.id.startsWith('generated-service-'), true);
  assert.equal(snapshot.draft.services.at(-1)?.category, 'hair');
  assert.equal(snapshot.draft.workingDays[0].enabled, false);
  assert.equal(snapshot.draft.workingDays[1].hours, '6:00 AM – 2:00 PM');
  assert.equal(snapshot.draft.travelZones[0].active, false);
  assert.equal(snapshot.draft.sameDayBookings, false);
  assert.equal(snapshot.draft.termsAccepted, true);
  assert.equal(writes.every((value) => value.draft.identity.credentialAdded === false), true);
}

{
  const firstSubmission = deferred<ProfessionalApplication>();
  let submissions = 0;
  const registration = controller(storage(), gateway({
    async submitApplication(draft) {
      submissions += 1;
      if (submissions === 1) return firstSubmission.promise;
      return { ...draft, id: 'KJ-PRO-2', status: 'pending', submittedAt: 3_000 };
    },
  }));
  await registration.setSession(secondSession);
  const first = registration.submit();
  const second = registration.submit();
  await Promise.resolve();
  assert.equal(submissions, 1);
  firstSubmission.resolve(remoteApplication);
  await Promise.all([first, second]);
  assert.equal(submissions, 1, 'Repeated taps must not submit a pending application again.');
  assert.equal(registration.getSnapshot().application?.id, remoteApplication.id);
  assert.equal(registration.getSnapshot().application?.status, 'pending');
}

{
  assert.equal(localizedSpecialtyName('hair', 'am'), 'ፀጉር ማስዋብ');
  assert.equal(localizedSpecialtyName('hair', 'om'), 'Miidhagsa rifeensaa');
  assert.equal(localizedSpecialtyName(null, 'en'), '');
  assert.equal(localizedSpokenLanguageName('Amharic', 'am'), 'አማርኛ');
  assert.equal(localizedSpokenLanguageName('English', 'om'), 'Afaan Ingilizii');
}

{
  let fail = true;
  const writes: StoredProfessionalRegistration[] = [];
  const registration = controller(storage({ async write(_id, value) { writes.push(value); } }), gateway({
    async loadApplication() {
      if (fail) throw new Error('Network unavailable');
      return { ...remoteApplication, status: 'approved' };
    },
  }));
  await registration.setSession(apiSession);
  assert.equal(registration.getSnapshot().loadStatus, 'error', 'An unavailable account must not look like new registration.');
  assert.equal(writes.length, 0);
  fail = false;
  await registration.retryLoad();
  assert.equal(registration.getSnapshot().loadStatus, 'ready');
  assert.equal(registration.getSnapshot().application?.status, 'approved');
}

{
  const draft: ProfessionalRegistrationDraft = {
    ...initialProfessionalRegistrationDraft,
    preferredLanguage: 'en',
    profile: {
      ...initialProfessionalRegistrationDraft.profile,
      legalName: 'Registered Professional', displayName: 'Professional', specialty: 'nails',
      gender: 'female', baseZone: 'Bole', yearsExperience: '3', educationLevel: 'certificate',
      payoutMethod: { type: 'telebirr', accountName: 'Registered Professional', accountNumber: '0911000000', bankName: '' },
      bio: 'Experienced nail professional offering reliable home visits.',
    },
    services: [{ ...initialProfessionalRegistrationDraft.services[0], category: 'nails', name: 'Nail care', price: 900 }],
  };
  const docs: ProfessionalDocument[] = ['national_id_front', 'national_id_back', 'government_id', 'certificate', 'portfolio', 'portfolio', 'portfolio'].map((kind, i) => ({
    id: String(i), professionalId: 'professional-1', kind: kind as ProfessionalDocument['kind'],
    credentialType: kind === 'certificate' ? 'education' : null,
    storagePath: 'private/test', status: 'pending', rejectionReason: null, createdAt: '2026-09-21',
  }));
  assert.equal(professionalEntryRoute({ ...remoteApplication, status: 'approved' }, initialProfessionalRegistrationDraft, []), '/pro/home');
  for (const status of ['pending', 'rejected', 'changes_requested', 'suspended'] as const) {
    assert.equal(professionalEntryRoute({ ...remoteApplication, status }, draft, docs), '/pro/pending');
  }
  assert.equal(professionalEntryRoute(null, initialProfessionalRegistrationDraft, []), '/pro/onboarding/language');
  assert.equal(professionalEntryRoute(null, { ...initialProfessionalRegistrationDraft, preferredLanguage: 'en' }, []), '/pro/onboarding/profile');
  assert.equal(professionalEntryRoute(null, { ...draft, profile: { ...draft.profile, bio: '' } }, docs), '/pro/onboarding/experience');
  assert.equal(professionalEntryRoute(null, draft, []), '/pro/onboarding/identity');
  assert.equal(professionalEntryRoute(null, draft, docs.slice(0, 4)), '/pro/onboarding/portfolio');
  assert.equal(professionalEntryRoute(null, { ...draft, services: [] }, docs), '/pro/onboarding/services');
  assert.equal(professionalEntryRoute(null, { ...draft, travelZones: [] }, docs), '/pro/onboarding/availability');
  assert.equal(professionalEntryRoute(null, draft, docs), '/pro/onboarding/review');
}

console.log('Client professional-registration controller contract tests passed.');
