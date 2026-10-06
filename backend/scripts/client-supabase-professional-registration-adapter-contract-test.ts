import assert from 'node:assert/strict';

import type { SupabaseClient } from '@supabase/supabase-js';

import { SupabaseProfessionalRegistrationGateway } from '../../src/adapters/supabase/supabase-professional-registration-gateway.ts';
import {
  initialProfessionalRegistrationDraft,
  type ProfessionalApplication,
  type ProfessionalRegistrationDraft,
} from '../../src/application/professional-registration/professional-registration-contracts.ts';
import type { Database } from '../../src/services/supabase-database.types.ts';

const draft: ProfessionalRegistrationDraft = {
  ...initialProfessionalRegistrationDraft,
  preferredLanguage: 'en',
  profile: {
    ...initialProfessionalRegistrationDraft.profile,
    legalName: 'Hanan Ali',
    displayName: 'Hanan',
    specialty: 'hair',
    bio: 'Experienced mobile hair professional serving clients across Addis Ababa.',
    yearsExperience: '5',
    educationLevel: 'diploma',
    payoutMethod: { type: 'cbe_birr', accountName: 'Hanan Ali', accountNumber: '0911000000', bankName: '' },
    languageSkills: [{ language: 'Amharic', proficiency: 'native' }, { language: 'English', proficiency: 'fluent' }],
    baseZone: 'Bole',
  },
  services: [{
    ...initialProfessionalRegistrationDraft.services[0],
    category: 'hair',
    name: 'Hair styling',
    price: 800,
  }],
  termsAccepted: true,
};

const saved: ProfessionalApplication = {
  ...draft,
  id: 'KJ-PRO-TEST-12345678',
  status: 'pending',
  submittedAt: 1_000,
};

const calls: Array<{ name: string; args: unknown }> = [];
const client = {
  async rpc(name: string, args?: unknown) {
    calls.push({ name, args });
    if (name === 'get_my_professional_application') return { data: saved, error: null };
    return { data: { result: 'submitted', application: saved }, error: null };
  },
} as unknown as SupabaseClient<Database>;

const gateway = new SupabaseProfessionalRegistrationGateway(client);
assert.deepEqual(await gateway.loadApplication(), saved);
assert.deepEqual(await gateway.submitApplication(draft), saved);
assert.equal(calls[0].name, 'get_my_professional_application');
assert.deepEqual(calls[0].args, undefined);
assert.equal(calls[1].name, 'submit_my_professional_application');

const submitArgs = calls[1].args as {
  p_application_reference: string;
  p_payload: {
    profile: ProfessionalRegistrationDraft['profile'];
    workingDays: Array<{ day: string; weekday: number; startsAt: string; endsAt: string }>;
  };
};
assert.match(submitArgs.p_application_reference, /^KJ-PRO-[A-Z0-9-]{8,40}$/);
assert.equal(submitArgs.p_payload.profile.educationLevel, 'diploma');
assert.equal(submitArgs.p_payload.profile.payoutMethod.type, 'cbe_birr');
assert.deepEqual(submitArgs.p_payload.profile.languageSkills, draft.profile.languageSkills);
const monday = submitArgs.p_payload.workingDays.find((day) => day.day === 'Monday');
// Professionals are bookable around the clock: the default day is the full day.
assert.deepEqual(monday, {
  day: 'Monday',
  hours: '12:00 AM – 11:59 PM',
  enabled: true,
  weekday: 1,
  startsAt: '00:00:00',
  endsAt: '23:59:00',
});

console.log('Client Supabase professional-registration adapter contract tests passed.');
