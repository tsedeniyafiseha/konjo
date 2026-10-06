import assert from 'node:assert/strict';
import type { ProfessionalApplicationInput } from '../src/application/contracts.ts';
import type { Clock, IdGenerator, ProfessionalApplicationCommandStore } from '../src/application/ports.ts';
import { SubmitProfessionalApplicationHandler } from '../src/application/submit-professional-application.ts';

const now = new Date('2026-09-19T01:00:00.000Z');
const application: ProfessionalApplicationInput = {
  preferredLanguage: 'en',
  profile: { legalName: 'Professional One', displayName: 'Professional One', email: 'pro@konjo.test', specialty: 'Hair', bio: 'Experienced professional with reliable client care.', yearsExperience: 5, educationLevel: 'certificate', gender: 'female', payoutMethod: { type: 'telebirr', accountName: 'Professional One', accountNumber: '+251911000000' }, languageSkills: [{ language: 'English', proficiency: 'fluent' }], baseZone: 'Bole', portfolioCount: 1 },
  services: [], workingDays: [], travelZones: [], sameDayBookings: false, termsAccepted: true,
};
let received: unknown;
const store: ProfessionalApplicationCommandStore = { submitApplication(input) { received = input; return { result: 'not_editable' }; } };
const ids: IdGenerator = { next: () => '12345678-abcd-efgh' };
const clock: Clock = { now: () => now };
const handler = new SubmitProfessionalApplicationHandler(store, ids, clock);
assert.deepEqual(await handler.execute('professional-1', application), { result: 'not_editable' });
assert.deepEqual(received, { userId: 'professional-1', applicationId: 'KJ-PRO-12345678', application, submittedAt: now.getTime(), occurredAt: now.toISOString() });
console.log('Professional application submission contract passed.');
