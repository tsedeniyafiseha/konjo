import {
  professionalSpecialties,
  type ProfessionalAppLanguage,
  type ProfessionalEducationLevel,
  type ProfessionalLanguageProficiency,
  type ProfessionalSpecialty,
  type ProfessionalSpokenLanguage,
} from '../../../application/professional-registration/professional-registration-contracts.ts';

const specialtyNames: Record<ProfessionalAppLanguage, readonly string[]> = {
  en: ['Hair styling', 'Braids & natural hair', 'Nail care', 'Makeup artistry', 'Barbering', 'Massage & wellness'],
  am: ['ፀጉር ማስዋብ', 'ጉንጉን እና የተፈጥሮ ፀጉር', 'የጥፍር እንክብካቤ', 'ሜካፕ', 'ባርበር', 'ማሳጅ እና ዌልነስ'],
  om: ['Miidhagsa rifeensaa', 'Shurrubbaa fi rifeensa uumamaa', 'Kunuunsa qeensaa', 'Miidhagsa fuulaa', 'Barberii', 'Masaajii fi fayyaa'],
};

const spokenLanguageNames: Record<ProfessionalAppLanguage, Record<ProfessionalSpokenLanguage, string>> = {
  en: { Amharic: 'Amharic', 'Afaan Oromo': 'Afaan Oromo', Tigrinya: 'Tigrinya', Somali: 'Somali', English: 'English', Arabic: 'Arabic', French: 'French', Italian: 'Italian' },
  am: { Amharic: 'አማርኛ', 'Afaan Oromo': 'ኦሮምኛ', Tigrinya: 'ትግርኛ', Somali: 'ሶማልኛ', English: 'እንግሊዝኛ', Arabic: 'ዓረብኛ', French: 'ፈረንሳይኛ', Italian: 'ጣልያንኛ' },
  om: { Amharic: 'Afaan Amaaraa', 'Afaan Oromo': 'Afaan Oromoo', Tigrinya: 'Afaan Tigree', Somali: 'Afaan Somaalee', English: 'Afaan Ingilizii', Arabic: 'Afaan Arabaa', French: 'Afaan Faransaayii', Italian: 'Afaan Xaaliyaanii' },
};

const educationLevelNames: Record<ProfessionalAppLanguage, Record<ProfessionalEducationLevel, string>> = {
  en: { secondary: 'Secondary school', certificate: 'Vocational certificate', diploma: 'Diploma', bachelors: "Bachelor’s degree", postgraduate: 'Postgraduate degree' },
  am: { secondary: 'ሁለተኛ ደረጃ', certificate: 'የሙያ ማረጋገጫ', diploma: 'ዲፕሎማ', bachelors: 'የመጀመሪያ ዲግሪ', postgraduate: 'ድህረ ምረቃ' },
  om: { secondary: 'Mana barumsaa sadarkaa lammaffaa', certificate: 'Ragaa ogummaa', diploma: 'Dipiloomaa', bachelors: 'Digrii jalqabaa', postgraduate: 'Digrii olaanaa' },
};

const proficiencyNames: Record<ProfessionalAppLanguage, Record<ProfessionalLanguageProficiency, string>> = {
  en: { basic: 'Basic', conversational: 'Conversational', fluent: 'Fluent', native: 'Native' },
  am: { basic: 'መሠረታዊ', conversational: 'የውይይት', fluent: 'ቅልጥፍና', native: 'አፍ መፍቻ' },
  om: { basic: 'Bu’uuraa', conversational: 'Haasaʼaa', fluent: 'Sirriitti', native: 'Afaan dhalootaa' },
};

export function localizedSpecialtyName(
  specialty: ProfessionalSpecialty | null,
  language: ProfessionalAppLanguage,
): string {
  const index = professionalSpecialties.findIndex((item) => item.id === specialty);
  return index >= 0 ? specialtyNames[language][index] : '';
}

export function localizedSpokenLanguageName(
  spokenLanguage: ProfessionalSpokenLanguage,
  language: ProfessionalAppLanguage,
): string {
  return spokenLanguageNames[language][spokenLanguage];
}

export function localizedEducationLevelName(
  educationLevel: ProfessionalEducationLevel,
  language: ProfessionalAppLanguage,
): string {
  return educationLevelNames[language][educationLevel];
}

export function localizedLanguageProficiencyName(
  proficiency: ProfessionalLanguageProficiency,
  language: ProfessionalAppLanguage,
): string {
  return proficiencyNames[language][proficiency];
}
