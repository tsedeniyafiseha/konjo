import assert from 'node:assert/strict';

import type { ApiProfessionalApplication } from '../../shared/api-contracts.ts';
import { SupabaseProfessionalOnboardingRepository } from '../src/adapters/supabase-professional-onboarding-repository.ts';
import type { SubmitProfessionalApplicationStoreInput } from '../src/application/contracts.ts';

const application: ApiProfessionalApplication = {
  id: 'KJ-PRO-12345678',
  status: 'pending',
  submittedAt: Date.parse('2026-09-18T12:00:00.000Z'),
  preferredLanguage: 'en',
  profile: {
    legalName: 'Professional One',
    displayName: 'Professional One',
    email: 'pro@konjo.test',
    specialty: 'hair',
    bio: 'Experienced mobile beauty professional serving Addis Ababa clients.',
    yearsExperience: '5',
    educationLevel: 'certificate',
    gender: 'female',
    payoutMethod: { type: 'telebirr', accountName: 'Professional One', accountNumber: '+251911000000' },
    languages: ['English'],
    languageSkills: [{ language: 'English', proficiency: 'fluent' }],
    baseZone: 'Bole',
    portfolioCount: 0,
  },
  identity: {
    credentialAdded: false,
  },
  services: [{
    id: 'service-1', category: 'Hair styling', name: 'Silk press', durationMinutes: 90,
    price: 1200, note: '', popular: true,
  }],
  workingDays: [
    { day: 'Monday', hours: '9:00 AM – 6:00 PM', enabled: true },
    { day: 'Tuesday', hours: 'Day off / Resting', enabled: false },
  ],
  travelZones: [{ id: 'bole', label: 'Bole', active: true }],
  sameDayBookings: true,
  termsAccepted: true,
};

const calls: Array<{ url: string; init: RequestInit; body: Record<string, unknown> }> = [];
const results: unknown[] = [
  { result: 'submitted', application },
  application,
  [{ userId: 'professional-1', phoneNumber: null, application }],
  { ...application, status: 'approved' },
];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  calls.push({
    url: String(input),
    init,
    body: JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>,
  });
  return new Response(JSON.stringify(results.shift() ?? null), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

try {
  const repository = new SupabaseProfessionalOnboardingRepository(
    'https://project.supabase.co/',
    'sb_secret_server_only',
  );
  const input: SubmitProfessionalApplicationStoreInput = {
    userId: 'professional-1',
    applicationId: application.id,
    submittedAt: application.submittedAt,
    occurredAt: '2026-09-18T12:00:00.000Z',
    application: {
      preferredLanguage: 'en',
      profile: {
        legalName: application.profile.legalName,
        displayName: application.profile.displayName,
        email: application.profile.email,
        specialty: application.profile.specialty,
        bio: application.profile.bio,
        yearsExperience: 5,
        educationLevel: 'certificate',
        gender: 'female',
        payoutMethod: { type: 'telebirr', accountName: 'Professional One', accountNumber: '+251911000000' },
        languageSkills: [{ language: 'English', proficiency: 'fluent' }],
        baseZone: 'Bole',
        portfolioCount: 0,
      },
      services: application.services,
      workingDays: application.workingDays,
      travelZones: application.travelZones,
      sameDayBookings: true,
      termsAccepted: true,
    },
  };
  assert.deepEqual(await repository.submitApplication(input), {
    result: 'submitted',
    application,
  });
  assert.deepEqual(await repository.getApplication('professional-1'), application);
  assert.equal((await repository.listProfessionalApplications('pending')).length, 1);
  assert.equal((await repository.reviewApplication({
    auditId: 'audit-1',
    adminId: 'admin-1',
    professionalId: 'professional-1',
    action: 'approve',
    occurredAt: '2026-09-18T12:10:00.000Z',
  }))?.status, 'approved');

  assert.deepEqual(calls.map((call) => call.url.split('/rpc/')[1]), [
    'submit_professional_application',
    'get_professional_application',
    'list_professional_applications',
    'review_professional_application',
  ]);
  for (const call of calls) {
    assert.equal((call.init.headers as Record<string, string>).apikey, 'sb_secret_server_only');
    assert.equal((call.init.headers as Record<string, string>).Authorization, undefined);
  }
  const payload = calls[0].body.p_payload as {
    services: Array<{ category: string }>;
    workingDays: Array<{ weekday: number; startsAt: string; endsAt: string }>;
  };
  assert.equal(payload.services[0].category, 'hair');
  assert.deepEqual(payload.workingDays[0], {
    day: 'Monday',
    hours: '9:00 AM – 6:00 PM',
    enabled: true,
    weekday: 1,
    startsAt: '09:00:00',
    endsAt: '18:00:00',
  });
  assert.equal(payload.workingDays[1].weekday, 2);
  assert.equal(payload.workingDays[1].startsAt, '');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Supabase professional onboarding adapter contract passed.');
