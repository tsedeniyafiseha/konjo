import type { ApiProfessionalAppLanguage } from '../../../shared/api-contracts';

/**
 * Messages the professional data controller shows on its own (toasts and job
 * labels), in the language the professional registered with. Screens get their
 * copy from the professional copy module; this stays in the application layer
 * so the controller never depends on UI code.
 */
const english = {
  availabilityFailed: 'Availability could not be updated.',
  keepOneService: 'Keep at least one service in your catalogue',
  priceRange: 'Enter a whole price between ETB 50 and ETB 100,000',
  priceUpdated: 'Price updated. Clients see the new price from their next booking.',
  serviceAdded: 'Service added to your catalogue',
  onMyWayAt: 'On my way becomes available at {time}',
  bookingFailed: 'The booking could not be updated.',
  sessionComplete: 'Session complete — final payment requested from {name}',
  declined: 'Request declined and reassigned',
  noShowRecorded: 'Client no-show recorded',
  catalogSaved: 'Catalogue changes saved',
  catalogFailed: 'Catalogue changes could not be saved.',
  jobDescription: 'Scheduled home service',
  paymentCard: 'Card',
  paymentCash: 'Cash',
  dateToday: 'Today',
  dateTomorrow: 'Tomorrow',
  timeJoiner: 'at',
} as const;

export type ProfessionalToastKey = keyof typeof english;
export type ProfessionalToastCopy = { [Key in ProfessionalToastKey]: string };

const amharic: ProfessionalToastCopy = {
  availabilityFailed: 'ዝግጁነትዎ ሊዘመን አልቻለም።',
  keepOneService: 'በካታሎግዎ ውስጥ ቢያንስ አንድ አገልግሎት ያቆዩ',
  priceRange: 'ከ50 እስከ 100,000 ብር ሙሉ ዋጋ ያስገቡ',
  priceUpdated: 'ዋጋው ተዘምኗል። ደንበኞች ከቀጣዩ ቦታ ማስያዣቸው ጀምሮ አዲሱን ዋጋ ያዩታል።',
  serviceAdded: 'አገልግሎት ወደ ካታሎግዎ ተጨምሯል',
  onMyWayAt: '«በመንገድ ላይ ነኝ» {time} ይገኛል',
  bookingFailed: 'ቦታ ማስያዣው ሊዘመን አልቻለም።',
  sessionComplete: 'ሥራው ተጠናቋል — ከ{name} የመጨረሻ ክፍያ ተጠይቋል',
  declined: 'ጥያቄው ውድቅ ተደርጎ ለሌላ ተላልፏል',
  noShowRecorded: 'የደንበኛ አለመገኘት ተመዝግቧል',
  catalogSaved: 'የካታሎግ ለውጦች ተቀምጠዋል',
  catalogFailed: 'የካታሎግ ለውጦች ሊቀመጡ አልቻሉም።',
  jobDescription: 'የተያዘ የቤት አገልግሎት',
  paymentCard: 'ካርድ',
  paymentCash: 'ጥሬ ገንዘብ',
  dateToday: 'ዛሬ',
  dateTomorrow: 'ነገ',
  timeJoiner: '፣',
};

const oromo: ProfessionalToastCopy = {
  availabilityFailed: 'Qophiin keessan haaromfamuu hin dandeenye.',
  keepOneService: 'Kaataloogii keessan keessatti yoo xiqqaate tajaajila tokko tursaa',
  priceRange: 'Gatii guutuu Birr 50 hanga Birr 100,000 galchaa',
  priceUpdated: 'Gatiin haaromfameera. Maamiltoonni beellama isaanii itti aanu irraa eegalee gatii haaraa argu.',
  serviceAdded: 'Tajaajilli kaataloogii keessanitti dabalameera',
  onMyWayAt: '«Karaa irran jira» {time} argama',
  bookingFailed: 'Beellamni haaromfamuu hin dandeenye.',
  sessionComplete: 'Hojiin xumurameera — kaffaltiin dhumaa {name} irraa gaafatameera',
  declined: 'Gaaffiin didamee nama biraatti kennameera',
  noShowRecorded: 'Dhabamuun maamilaa galmaa’eera',
  catalogSaved: 'Jijjiiramni kaataloogii olkaa’ameera',
  catalogFailed: 'Jijjiiramni kaataloogii olkaa’amuu hin dandeenye.',
  jobDescription: 'Tajaajila manaa qabame',
  paymentCard: 'Kaardii',
  paymentCash: 'Maallaqa harkaa',
  dateToday: 'Har’a',
  dateTomorrow: 'Bor',
  timeJoiner: 'sa’aatii',
};

export const professionalToastCopy: Record<ApiProfessionalAppLanguage, ProfessionalToastCopy> = {
  en: english,
  am: amharic,
  om: oromo,
};

export function fillProfessionalToast(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}
