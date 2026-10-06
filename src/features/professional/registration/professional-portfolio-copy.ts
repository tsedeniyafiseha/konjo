import type { ProfessionalAppLanguage } from './professional-registration-types';

export const PORTFOLIO_MINIMUM = 3;
export const PORTFOLIO_LIMIT = 5;

const english = {
  step: 'Portfolio',
  eyebrow: 'YOUR WORK',
  title: 'Show three examples of your work',
  body: 'Upload at least three clear photos of work you have done yourself. They are reviewed with your application and shown on your public profile once you are approved.',
  add: '+ Add a work photo',
  adding: 'Uploading…',
  remove: 'Remove',
  removeTitle: 'Remove this photo?',
  removeBody: 'It will no longer appear on your profile.',
  keep: 'Keep',
  count: '{count} of {limit} photos',
  needMore: 'Add {count} more photo(s) to continue.',
  limitReached: 'You have reached the {limit}-photo limit. Remove one to add another.',
  continue: 'Continue to services',
  manageTitle: 'Portfolio',
  manageBody: 'Photos you add here are published on your profile immediately. You can keep up to five.',
  empty: 'No portfolio photos yet.',
  live: 'Live',
  inReview: 'In review',
  reviewMissing: 'Upload your ID documents and at least three portfolio photos before submitting.',
  resubmit: 'Update and resubmit',
  reviewNote: 'Note from Konjo',
};

type PortfolioCopy = { [Key in keyof typeof english]: string };

const amharic: PortfolioCopy = {
  step: 'ፖርትፎሊዮ',
  eyebrow: 'የእርስዎ ሥራ',
  title: 'የሥራዎን ሦስት ምሳሌዎች ያሳዩ',
  body: 'እራስዎ የሠሩትን ሥራ የሚያሳዩ ቢያንስ ሦስት ግልጽ ፎቶዎችን ይጫኑ። ከማመልከቻዎ ጋር ይገመገማሉ፤ ሲጸድቁ በሕዝብ መገለጫዎ ላይ ይታያሉ።',
  add: '+ የሥራ ፎቶ ጨምር',
  adding: 'በመጫን ላይ…',
  remove: 'አስወግድ',
  removeTitle: 'ይህን ፎቶ ያስወግዱ?',
  removeBody: 'ከዚህ በኋላ በመገለጫዎ ላይ አይታይም።',
  keep: 'ተው',
  count: '{count} ከ{limit} ፎቶዎች',
  needMore: 'ለመቀጠል {count} ተጨማሪ ፎቶ ይጨምሩ።',
  limitReached: 'የ{limit} ፎቶ ገደብ ላይ ደርሰዋል። ሌላ ለመጨመር አንዱን ያስወግዱ።',
  continue: 'ወደ አገልግሎቶች ቀጥል',
  manageTitle: 'ፖርትፎሊዮ',
  manageBody: 'እዚህ የሚጨምሯቸው ፎቶዎች ወዲያውኑ በመገለጫዎ ላይ ይታያሉ። እስከ አምስት ማስቀመጥ ይችላሉ።',
  empty: 'እስካሁን የፖርትፎሊዮ ፎቶ የለም።',
  live: 'ይታያል',
  inReview: 'በግምገማ ላይ',
  reviewMissing: 'ከማስገባትዎ በፊት የመታወቂያ ሰነዶችዎን እና ቢያንስ ሦስት የፖርትፎሊዮ ፎቶዎችን ይጫኑ።',
  resubmit: 'አስተካክልና እንደገና አስገባ',
  reviewNote: 'ከKonjo የተሰጠ ማስታወሻ',
};

const oromo: PortfolioCopy = {
  step: 'Hojii',
  eyebrow: 'HOJII KEESSAN',
  title: 'Fakkeenya hojii keessanii sadii agarsiisaa',
  body: 'Suuraalee ifaa hojii ofii keessan hojjettan yoo xiqqaate sadii fe’aa. Iyyata keessan waliin ilaalamu; erga mirkanaa’ee booda odeeffannoo keessan irratti mul’atu.',
  add: '+ Suuraa hojii dabali',
  adding: 'Fe’amaa jira…',
  remove: 'Haqi',
  removeTitle: 'Suuraa kana haquu?',
  removeBody: 'Kana booda odeeffannoo keessan irratti hin mul’atu.',
  keep: 'Dhiisi',
  count: 'Suuraa {count}/{limit}',
  needMore: 'Itti fufuuf suuraa {count} dabalaa.',
  limitReached: 'Daangaa suuraa {limit} geessaniittu. Kan biraa dabaluuf tokko haqaa.',
  continue: 'Gara tajaajilaatti itti fufi',
  manageTitle: 'Hojii',
  manageBody: 'Suuraaleen asitti dabaltan battalumatti odeeffannoo keessan irratti mul’atu. Hanga shanii qabachuu dandeessu.',
  empty: 'Ammaaf suuraan hojii hin jiru.',
  live: 'Mul’ata',
  inReview: 'Qorannoo irra',
  reviewMissing: 'Osoo hin galchin dura galmee eenyummaa fi suuraalee hojii yoo xiqqaate sadii fe’aa.',
  resubmit: 'Sirreessiitii irra deebi’ii galchi',
  reviewNote: 'Yaadannoo Konjo',
};

export const professionalPortfolioCopy: Record<ProfessionalAppLanguage, PortfolioCopy> = {
  en: english,
  am: amharic,
  om: oromo,
};

export function fillPortfolioCopy(template: string, values: Record<string, number>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
