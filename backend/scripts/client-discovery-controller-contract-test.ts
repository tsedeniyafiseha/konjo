import assert from 'node:assert/strict';

import type {
  ApiProfessionalSummary,
  ApiServiceCategory,
} from '../../shared/api-contracts.ts';
import {
  DiscoveryController,
  type DiscoveryControllerLogger,
  type DiscoveryFallbackCatalog,
  type DiscoveryGateway,
} from '../../src/application/discovery/discovery-controller.ts';
import {
  professionalLanguageMatchScore,
  type Professional,
} from '../../src/application/discovery/discovery-contracts.ts';

const fallbackProfessional: Professional = {
  id: 'hanan',
  name: 'Fallback Hanan',
  firstName: 'Hanan',
  service: 'Fallback braids',
  category: 'braids',
  rating: 4.8,
  reviews: 10,
  priceFrom: 800,
  zone: 'Bole',
  nextSlot: 'Tomorrow',
  gender: 'female',
  distanceKm: 1.8,
  initials: 'FH',
  image: 42,
  bio: 'Fallback biography',
  stats: [],
  services: [{
    id: 'box-braids',
    name: 'Fallback box braids',
    tag: 'Popular',
    price: 800,
    duration: '2 hr',
    note: 'Sterile kit',
    description: 'Fallback service description',
  }],
  portfolio: ['Braids'],
  reviewsList: [],
};

const fallback: DiscoveryFallbackCatalog = {
  professionals: [fallbackProfessional],
  categories: [{ id: 'braids', label: 'Braids', initial: 'B' }],
  timeSlots: ['9:00 AM', '10:30 AM'],
};

const apiProfessional: ApiProfessionalSummary = {
  id: 'hanan',
  displayName: 'Hanan T.',
  specialty: 'Braids & natural hair',
  category: 'braids',
  baseZone: 'Bole',
  bio: 'Remote biography',
  yearsExperience: 8,
  educationLevel: 'diploma',
  languages: ['Amharic', 'English'],
  languageSkills: [{ language: 'Amharic', proficiency: 'native' }, { language: 'English', proficiency: 'fluent' }],
  gender: 'female',
  rating: 4.9,
  reviewCount: 128,
  available: true,
  availableToday: true,
  nextAvailableSlot: '2:30 PM',
  featured: true,
  femaleOnlyEligible: true,
  travelZones: ['Bole', 'Kazanchis'],
  workingDays: [{ day: 'Monday', enabled: true }],
  services: [{ id: 'box-braids', name: 'Box braids', price: 1_800, durationMinutes: 180 }],
};

const apiCategory: ApiServiceCategory = {
  id: 'braids',
  slug: 'braids',
  name: 'Braids & natural hair',
  active: true,
  sortOrder: 20,
  updatedAt: '2026-09-18T12:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

function gateway(overrides: Partial<DiscoveryGateway> = {}): DiscoveryGateway {
  return {
    configured: true,
    async listProfessionals() { return [apiProfessional]; },
    async listCategories() { return [apiCategory]; },
    async listReviews() { return []; },
    async getAvailability(input) {
      return {
        professionalId: input.professionalId,
        dateIso: input.dateIso,
        available: true,
        slots: ['1:00 PM'],
      };
    },
    async listPortfolio() { return []; },
    ...overrides,
  };
}

{
  let calls = 0;
  const controller = new DiscoveryController(gateway({
    configured: false,
    async listProfessionals() { calls += 1; return []; },
    async listCategories() { calls += 1; return []; },
  }), fallback);
  assert.deepEqual(controller.getSnapshot(), {
    professionals: fallback.professionals,
    categories: fallback.categories,
    loading: false,
  });
  await controller.refresh();
  assert.equal(calls, 0);
  assert.deepEqual(await controller.getAvailableSlots({
    professionalId: 'hanan', dateIso: '2026-09-20',
  }), fallback.timeSlots);
}

{
  const professionals = deferred<readonly ApiProfessionalSummary[]>();
  const categories = deferred<readonly ApiServiceCategory[]>();
  let professionalCalls = 0;
  const controller = new DiscoveryController(gateway({
    async listProfessionals() { professionalCalls += 1; return professionals.promise; },
    async listCategories() { return categories.promise; },
  }), fallback);
  const firstRefresh = controller.refresh();
  const secondRefresh = controller.refresh();
  assert.equal(firstRefresh, secondRefresh);
  assert.equal(professionalCalls, 1);
  assert.equal(controller.getSnapshot().loading, true);
  professionals.resolve([apiProfessional]);
  categories.resolve([apiCategory]);
  await firstRefresh;

  const professional = controller.getProfessional('hanan');
  assert.equal(professional?.name, 'Hanan T.');
  assert.equal(professional?.firstName, 'Hanan');
  assert.equal(professional?.priceFrom, 1_800);
  assert.equal(professional?.gender, 'female');
  // With an API configured, sample imagery and copy never decorate a live profile.
  assert.equal(professional?.image, undefined);
  assert.equal(professional?.services[0].duration, '3 hr');
  assert.equal(professional?.services[0].note, 'At-home service');
  assert.equal(professional?.services[0].tag, undefined);
  assert.deepEqual(controller.getSnapshot().categories, [{
    id: 'braids', label: 'Braids & natural hair', initial: 'B',
  }]);
  assert.equal(controller.getSnapshot().loading, false);
}

{
  const errors: string[] = [];
  const logger: DiscoveryControllerLogger = {
    error(message) { errors.push(message); },
  };
  let fail = true;
  const controller = new DiscoveryController(gateway({
    async listProfessionals() {
      if (fail) throw new Error('network unavailable');
      return [apiProfessional];
    },
  }), fallback, logger);
  await controller.refresh();
  assert.equal(controller.getSnapshot().loading, false);
  assert.deepEqual(controller.getSnapshot().professionals, fallback.professionals);
  assert.equal(errors.length, 1);

  fail = false;
  await controller.refresh();
  assert.equal(controller.getSnapshot().professionals[0].name, 'Hanan T.');
}

{
  // The catalog retries on its own after a failed load, so a person who opens
  // the app while the API is down still gets professionals once it is back.
  let attempts = 0;
  const controller = new DiscoveryController(gateway({
    async listProfessionals() {
      attempts += 1;
      if (attempts < 3) throw new Error('network unavailable');
      return [apiProfessional];
    },
  }), fallback, undefined, { retryDelayMs: 10 });
  await controller.refresh();
  assert.equal(attempts, 1);
  assert.equal(controller.getProfessional('hanan')?.name, 'Fallback Hanan');
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(attempts, 3, 'the controller must keep retrying until the catalog loads');
  assert.equal(controller.getProfessional('hanan')?.name, 'Hanan T.');
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(attempts, 3, 'retries stop once the catalog has loaded');
}

{
  let receivedInput: unknown;
  const controller = new DiscoveryController(gateway({
    async getAvailability(input) {
      receivedInput = input;
      return {
        professionalId: input.professionalId,
        dateIso: input.dateIso,
        available: true,
        slots: ['3:00 PM', '4:30 PM'],
      };
    },
  }), fallback);
  const input = {
    professionalId: 'hanan',
    dateIso: '2026-09-20',
    serviceId: 'box-braids',
    excludeBookingId: 'booking-1',
  };
  assert.deepEqual(await controller.getAvailableSlots(input), ['3:00 PM', '4:30 PM']);
  assert.deepEqual(receivedInput, input);
}

{
  const controller = new DiscoveryController(gateway({
    async listPortfolio(professionalId) {
      assert.equal(professionalId, 'hanan');
      return [{
        id: 'portfolio-1',
        url: 'https://project.supabase.co/signed/portfolio-1',
        expiresAt: '2026-09-18T12:05:00.000Z',
      }];
    },
  }), fallback);
  assert.deepEqual(await controller.loadPortfolio('hanan'), [
    'https://project.supabase.co/signed/portfolio-1',
  ]);
  assert.deepEqual(controller.getProfessional('hanan')?.portfolio, [
    'https://project.supabase.co/signed/portfolio-1',
  ]);
}

assert.equal(professionalLanguageMatchScore({ languageSkills: apiProfessional.languageSkills, languages: apiProfessional.languages }, 'en'), 3);
assert.equal(professionalLanguageMatchScore({ languageSkills: apiProfessional.languageSkills, languages: apiProfessional.languages }, 'am'), 4);
assert.equal(professionalLanguageMatchScore({ languages: ['English'] }, 'en'), 1);

console.log('Client discovery controller contracts passed.');
