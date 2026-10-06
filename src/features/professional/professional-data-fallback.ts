import type { ProfessionalDataSnapshot } from '@/application/professional-data/professional-data-controller';
import { apiBaseUrl } from '@/services/api-client';

/** Sample workspace shown only in the design preview, when no API is configured. */
const sampleProfessionalData: ProfessionalDataSnapshot = {
  jobs: [
    { id: 'j1', name: 'Meron G.', initials: 'MG', service: 'Box braids', description: '3 hr wellness ritual', price: 2450, payment: 'Cash / Telebirr', time: 'Today at 2:30 PM', address: 'Bole Atlas', addressDetail: 'Behind Edna Mall, blue gate #14', travelFee: 150, status: 'offer' },
    { id: 'j2', name: 'Selam D.', initials: 'SD', service: 'Cornrows', description: 'Shuruba accents · 90 min', price: 900, payment: 'Telebirr', time: 'Today at 5:30 PM', address: 'CMC Michael', addressDetail: 'Near the main roundabout', travelFee: 0, status: 'accepted' },
    { id: 'j3', name: 'Kalkidan B.', initials: 'KB', service: 'Silk press', description: 'Thermal protectant · 2 hr', price: 1200, payment: 'CBE Birr', time: 'Today at 7:45 PM', address: 'Kazanchis', addressDetail: 'Gate 2, apartment block C', travelFee: 0, status: 'accepted' },
  ],
  recentJobs: [],
  dashboardLoaded: true,
  available: true,
  completedCount: 9,
  weekEarnings: 12_400,
  rating: 0,
  reviewCount: 0,
  travelFeeCap: 500,
  sessionStartedAt: null,
  services: [
    { id: 'sv1', category: 'Braids & Hair', name: 'Box braids', durationMinutes: 180, price: 1800, note: 'Includes standard synthetic braiding hair', popular: true },
    { id: 'sv2', category: 'Braids & Hair', name: 'Cornrows / Shuruba', durationMinutes: 90, price: 900, note: 'Pre-washed hair recommended', popular: false },
    { id: 'sv3', category: 'Hair Care', name: 'Natural hair hydration mask', durationMinutes: 120, price: 1400, note: 'Organic oils, scalp massage included', popular: false },
  ],
  workingDays: [
    { day: 'Monday', hours: '9:00 AM – 6:00 PM', enabled: true },
    { day: 'Tuesday', hours: '9:00 AM – 6:00 PM', enabled: true },
    { day: 'Wednesday', hours: '9:00 AM – 6:00 PM', enabled: true },
    { day: 'Thursday', hours: '9:00 AM – 6:00 PM', enabled: true },
    { day: 'Friday', hours: '9:00 AM – 7:00 PM', enabled: true },
    { day: 'Saturday', hours: '8:30 AM – 6:30 PM', enabled: true },
    { day: 'Sunday', hours: 'Day off / Resting', enabled: false },
  ],
  travelZones: [
    { id: 'bole', label: 'Bole', active: true },
    { id: 'cmc', label: 'CMC', active: true },
    { id: 'kazanchis', label: 'Kazanchis', active: true },
    { id: 'old-airport', label: 'Old Airport', active: false },
    { id: 'ayat', label: 'Ayat', active: false },
    { id: 'megenagna', label: 'Megenagna', active: false },
    { id: 'summit', label: 'Summit', active: false },
    { id: 'sarbet', label: 'Sarbet', active: false },
  ],
  sameDayBookings: true,
  toast: null,
};

/** Real builds start empty: a new or pending professional sees empty states, never sample clients. */
const emptyProfessionalData: ProfessionalDataSnapshot = {
  ...sampleProfessionalData,
  jobs: [],
  recentJobs: [],
  completedCount: 0,
  weekEarnings: 0,
  rating: 0,
  reviewCount: 0,
  services: [],
  workingDays: sampleProfessionalData.workingDays.map((day) => ({ ...day, enabled: false })),
  travelZones: sampleProfessionalData.travelZones.map((zone) => ({ ...zone, active: false })),
};

export const professionalDataFallback: ProfessionalDataSnapshot = apiBaseUrl ? emptyProfessionalData : sampleProfessionalData;
