import type { DatabaseSync } from 'node:sqlite';

import type { ApiProfessionalSummary } from '../../../../shared/api-contracts.ts';
import { defaultTravelFeeCap, platformSettingKeys, defaultRewardDiscountRateBps, defaultRewardEveryBookings } from './platform-settings.ts';

type SeededProfessional = Omit<ApiProfessionalSummary, 'available' | 'availableToday' | 'nextAvailableSlot' | 'workingDays'>;

const seededProfessionals: ReadonlyArray<SeededProfessional> = [
  {
    id: 'hanan',
    displayName: 'Hanan T.',
    specialty: 'Braids & natural hair',
    category: 'braids',
    baseZone: 'Bole',
    bio: '10+ years mastering traditional and modern Ethiopian braids, tailored protective styling brought directly to your home.',
    yearsExperience: 8,
    educationLevel: 'diploma',
    languages: ['Amharic', 'English'],
    languageSkills: [{ language: 'Amharic', proficiency: 'native' }, { language: 'English', proficiency: 'fluent' }],
    featured: true,
    femaleOnlyEligible: true,
    gender: 'female',
    rating: 4.9,
    reviewCount: 128,
    travelZones: ['Bole', 'Kazanchis', 'Megenagna'],
    services: [
      { id: 'hanan-box-braids', name: 'Box braids', price: 1800, durationMinutes: 180 },
      { id: 'hanan-cornrows', name: 'Cornrows', price: 900, durationMinutes: 90 },
      { id: 'hanan-silk-press', name: 'Silk press', price: 1200, durationMinutes: 120 },
      { id: 'hanan-natural-treatment', name: 'Natural hair treatment', price: 1400, durationMinutes: 120 },
    ],
  },
  {
    id: 'meaza',
    displayName: 'Meaza K.',
    specialty: 'Massage & wellness',
    category: 'massage',
    baseZone: 'Old Airport',
    bio: 'Certified therapeutic massage specialist bringing spa-grade relaxation and deep tissue work to your home.',
    yearsExperience: 6,
    educationLevel: 'certificate',
    languages: ['Amharic', 'English'],
    languageSkills: [{ language: 'Amharic', proficiency: 'native' }, { language: 'English', proficiency: 'conversational' }],
    featured: true,
    femaleOnlyEligible: true,
    gender: 'female',
    rating: 4.95,
    reviewCount: 86,
    travelZones: ['Old Airport', 'Bole', 'Kazanchis'],
    services: [
      { id: 'meaza-relaxation', name: 'Full body relaxation', price: 1600, durationMinutes: 90 },
      { id: 'meaza-deep-tissue', name: 'Deep tissue', price: 1900, durationMinutes: 120 },
    ],
  },
  {
    id: 'selam',
    displayName: 'Selam D.',
    specialty: 'Cornrows',
    category: 'braids',
    baseZone: 'CMC',
    bio: 'Specialist in clean-part cornrows and shuruba styling, gentle on sensitive scalps.',
    yearsExperience: 5,
    educationLevel: 'certificate',
    languages: ['Amharic'],
    languageSkills: [{ language: 'Amharic', proficiency: 'native' }],
    featured: false,
    femaleOnlyEligible: true,
    gender: 'female',
    rating: 4.9,
    reviewCount: 61,
    travelZones: ['CMC', 'Megenagna', 'Bole'],
    services: [{ id: 'selam-cornrows', name: 'Cornrows', price: 650, durationMinutes: 75 }],
  },
  {
    id: 'tigist',
    displayName: 'Tigist M.',
    specialty: 'Manicure',
    category: 'nails',
    baseZone: 'Ayat',
    bio: 'Gel and classic manicure specialist with a gentle touch and a sterilised toolkit.',
    yearsExperience: 4,
    educationLevel: 'diploma',
    languages: ['Amharic', 'English'],
    languageSkills: [{ language: 'Amharic', proficiency: 'native' }, { language: 'English', proficiency: 'basic' }],
    featured: false,
    femaleOnlyEligible: true,
    gender: 'female',
    rating: 4.85,
    reviewCount: 44,
    travelZones: ['Ayat', 'CMC'],
    services: [
      { id: 'tigist-classic-manicure', name: 'Classic manicure', price: 500, durationMinutes: 45 },
      { id: 'tigist-gel-manicure', name: 'Gel manicure', price: 750, durationMinutes: 60 },
    ],
  },
];

function seedOperationsData(database: DatabaseSync, seededAt: string): void {
  const insertZone = database.prepare(`
    INSERT OR IGNORE INTO service_zones (id, label, travel_fee, active, updated_at)
    VALUES (?, ?, ?, 1, ?)
  `);
  const now = seededAt;
  for (const [id, label, fee] of [
    ['bole', 'Bole', 0],
    ['cmc', 'CMC', 150],
    ['kazanchis', 'Kazanchis', 150],
    ['megenagna', 'Megenagna', 150],
    ['old-airport', 'Old Airport', 250],
    ['ayat', 'Ayat', 250],
    ['summit', 'Summit', 250],
    ['sarbet', 'Sarbet', 250],
  ] as const) insertZone.run(id, label, fee, now);
  const insertCategory = database.prepare(`
    INSERT OR IGNORE INTO service_categories (id, slug, name, active, sort_order, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
  `);
  for (const [id, slug, name, sortOrder] of [
    ['hair', 'hair', 'Hair styling', 10],
    ['braids', 'braids', 'Braids & natural hair', 20],
    ['nails', 'nails', 'Nail care', 30],
    ['makeup', 'makeup', 'Makeup artistry', 40],
    ['barber', 'barber', 'Barbering', 50],
    ['massage', 'massage', 'Massage & wellness', 60],
  ] as const) insertCategory.run(id, slug, name, sortOrder, now);
  database.prepare(`
    INSERT OR IGNORE INTO platform_settings (key, value_integer, updated_at)
    VALUES ('commission_rate_bps', 1800, ?)
  `).run(now);
  database.prepare(`
    INSERT OR IGNORE INTO platform_settings (key, value_integer, updated_at)
    VALUES (?, ?, ?)
  `).run(platformSettingKeys.travelFeeCap, defaultTravelFeeCap, now);
  database.prepare(`
    INSERT OR IGNORE INTO platform_settings (key, value_integer, updated_at)
    VALUES (?, ?, ?)
  `).run(platformSettingKeys.rewardDiscountRateBps, defaultRewardDiscountRateBps, now);
  database.prepare(`
    INSERT OR IGNORE INTO platform_settings (key, value_integer, updated_at)
    VALUES (?, ?, ?)
  `).run(platformSettingKeys.rewardEveryBookings, defaultRewardEveryBookings, now);
}

function seedProfessionals(database: DatabaseSync, seededAt: string): void {
  const insert = database.prepare(`
    INSERT INTO professionals (
      id, display_name, specialty, base_zone, services_json, category, bio,
      years_experience, education_level, gender, languages_json, language_skills_json, featured, female_only_eligible,
      rating_baseline, review_count_baseline
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      specialty = excluded.specialty,
      base_zone = excluded.base_zone,
      services_json = excluded.services_json,
      category = excluded.category,
      bio = excluded.bio,
      years_experience = excluded.years_experience,
      education_level = excluded.education_level,
      gender = excluded.gender,
      languages_json = excluded.languages_json,
      language_skills_json = excluded.language_skills_json,
      featured = excluded.featured,
      female_only_eligible = excluded.female_only_eligible,
      rating_baseline = excluded.rating_baseline,
      review_count_baseline = excluded.review_count_baseline
  `);
  const insertZone = database.prepare('INSERT OR IGNORE INTO professional_catalog_zones (professional_id, zone) VALUES (?, ?)');
  const insertWorkingDay = database.prepare('INSERT OR IGNORE INTO professional_catalog_working_days (professional_id, day, hours, enabled) VALUES (?, ?, ?, ?)');
  const insertAvailability = database.prepare('INSERT OR IGNORE INTO professional_availability (professional_id, available, updated_at) VALUES (?, 1, ?)');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  for (const professional of seededProfessionals) {
    insert.run(
      professional.id,
      professional.displayName,
      professional.specialty,
      professional.baseZone,
      JSON.stringify(professional.services),
      professional.category,
      professional.bio,
      professional.yearsExperience,
      professional.educationLevel,
      professional.gender,
      JSON.stringify(professional.languages),
      JSON.stringify(professional.languageSkills),
      professional.featured ? 1 : 0,
      professional.rating,
      professional.reviewCount,
    );
    for (const zone of professional.travelZones) insertZone.run(professional.id, zone);
    for (const day of days) insertWorkingDay.run(professional.id, day, '9:00 AM – 6:00 PM', day === 'Sunday' ? 0 : 1);
    insertAvailability.run(professional.id, seededAt);
  }
}

export function seedSqliteReferenceData(
  database: DatabaseSync,
  seededAt = new Date().toISOString(),
): void {
  seedOperationsData(database, seededAt);
  seedProfessionals(database, seededAt);
}
