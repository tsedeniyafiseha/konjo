/**
 * The Terms & Conditions and Privacy & Security policy shown in the app before
 * a client creates an account and before a professional submits their
 * application. Bump LEGAL_VERSION whenever the wording changes materially; the
 * version a person accepted is stored with their acceptance. The public pages
 * at website/terms.html and website/privacy.html carry the same wording.
 */
export const LEGAL_VERSION = '2026-10-11';

export type LegalLanguage = 'en' | 'am' | 'om';

export interface LegalSection {
  heading: string;
  paragraphs: readonly string[];
}

export interface LegalDocument {
  title: string;
  intro: string;
  sections: readonly LegalSection[];
}

export interface LegalLabels {
  sheetTitle: string;
  readPrompt: string;
  accepted: string;
  scrollHint: string;
  accept: string;
  close: string;
  lastUpdated: string;
  fallbackNote: string | null;
}

export const legalLabels: Record<LegalLanguage, LegalLabels> = {
  en: {
    sheetTitle: 'Before you continue',
    readPrompt: 'Confirm you are 18 or older, then read and accept the Terms & Conditions and the Privacy & Security policy.',
    accepted: 'Age confirmed; Terms & Conditions and Privacy & Security accepted.',
    scrollHint: 'Scroll to the end to continue.',
    accept: 'I am 18+ and agree',
    close: 'Close',
    lastUpdated: 'Last updated 11 October 2026',
    fallbackNote: null,
  },
  am: {
    sheetTitle: 'ከመቀጠልዎ በፊት',
    readPrompt: 'ዕድሜዎ 18 ወይም ከዚያ በላይ መሆኑን ያረጋግጡ፤ ከዚያም የአገልግሎት ውሎችንና የግላዊነትና ደህንነት መመሪያን ያንብቡና ይቀበሉ።',
    accepted: 'ዕድሜዎ 18 ወይም ከዚያ በላይ መሆኑን አረጋግጠዋል፤ ውሎቹንና መመሪያውን ተቀብለዋል።',
    scrollHint: 'ለመቀጠል እስከ መጨረሻው ያንሸራትቱ።',
    accept: 'ዕድሜዬ 18+ ነው፤ እስማማለሁ',
    close: 'ዝጋ',
    lastUpdated: 'የመጨረሻ ዝማኔ፡ ጥቅምት 1 ቀን 2019 ዓ.ም. (11 October 2026)',
    fallbackNote: null,
  },
  om: {
    sheetTitle: 'Osoo itti hin fufin dura',
    readPrompt: 'Umriin keessan waggaa 18 ykn isaa ol taʼuu mirkaneessaa; Haala Tajaajilaa fi Imaammata Iccitii fi Nageenyaa dubbisaa fudhadhaa.',
    accepted: 'Umriin waggaa 18+ mirkanaaʼeera; Haalli Tajaajilaa fi Imaammanni Iccitii fi Nageenyaa fudhatameera.',
    scrollHint: 'Itti fufuuf hanga dhumaatti gadi harkisaa.',
    accept: 'Umriin koo 18+; waliigaleera',
    close: 'Cufi',
    lastUpdated: 'Yeroo dhumaa kan haaromfame: 11 Onkololeessa 2026',
    fallbackNote: 'Barreeffamni seeraa kun yeroo ammaa Afaan Ingiliffaatiin qofa argama.',
  },
};

const englishTerms: LegalDocument = {
  title: 'Terms & Conditions',
  intro: 'These terms are an agreement between you and Konjo. Please read them. By pressing "I am 18+ and agree" you confirm that you are at least 18 and accept these terms together with the Privacy & Security policy.',
  sections: [
    {
      heading: '1. What Konjo is',
      paragraphs: [
        'Konjo is an online marketplace that connects clients with independent beauty and grooming professionals who travel to the client’s address in Addis Ababa.',
        'Konjo is not a salon and does not employ professionals. Each professional is an independent business who decides which bookings to accept and how to carry out the service. Konjo provides the app, checks professionals’ identity documents, coordinates bookings, records cash-payment status, and offers support. Konjo does not perform, supervise or inspect any service and is not present at any visit.',
      ],
    },
    {
      heading: '2. Your account',
      paragraphs: [
        'You must be 18 or older. Give accurate details, keep your sign-in private and tell us if your account is misused. You are responsible for everything done under your account.',
        'Professionals must hold the training, licences and permissions their services require, must keep those current, and are responsible for their own taxes and business obligations.',
      ],
    },
    {
      heading: '3. Bookings, prices and payment',
      paragraphs: [
        'The price shown when you book includes the service price, Konjo’s service fee and any travel fee the professional adds when accepting, up to a cap set by Konjo.',
        'For version 1, the client pays the displayed total directly to the professional in cash after the physical service. Konjo does not collect a deposit, card payment or wallet payment in the app.',
        'The app records the amount due and marks the cash payment when the professional completes the visit. Any settlement account supplied by a professional is not used for client cash payments in version 1.',
      ],
    },
    {
      heading: '4. Cancellations and cash disputes',
      paragraphs: [
        'Cancel before the professional sets off and no payment is due in the app. If the booking is cancelled after travel starts, or the client is not present, the parties should contact Konjo support about any travel-fee or cash dispute.',
        'Konjo cannot automatically refund cash exchanged directly between a client and professional. Disputes can be raised from the booking within 7 days of the visit.',
      ],
    },
    {
      heading: '5. Safety and conduct',
      paragraphs: [
        'Treat each other with respect. Harassment, discrimination, intoxication, or unsafe or unlawful behaviour leads to removal from Konjo. Both sides can use the in-app SOS during a visit; it alerts Konjo support and shares the live location. The SOS is a support tool, not an emergency service. In an emergency call the police or an ambulance first.',
        'Clients must provide a safe, clean space for the service and must tell the professional in advance about allergies, skin or scalp conditions, pregnancy, medication, or anything else that could affect the service or their health.',
        'Professionals must use clean, hygienic tools and products, follow product instructions, carry out only the services they are qualified for, and stop immediately if the client asks.',
      ],
    },
    {
      heading: '6. Your responsibility and Konjo’s liability',
      paragraphs: [
        'You enter each booking voluntarily. The professional alone is responsible for how the service is carried out, and the client alone is responsible for their premises and for the information they give. Konjo’s role is limited to running the platform.',
        'To the fullest extent Ethiopian law allows, Konjo is not responsible for, and will not compensate you for: the quality, safety, timing or result of any service; injury, illness, allergic or skin reaction, or any other harm a client experiences during or after a visit; loss, theft or damage to a client’s property; injury, threats, assault or any harm a professional experiences at a client’s address; loss of or damage to a professional’s tools, products or vehicle; a professional or client not showing up or arriving late; any dispute between a client and a professional about service, conduct or payment; or the acts or omissions of anyone who is not a Konjo employee.',
        'Konjo does not guarantee that its identity checks detect every risk, that the app is always available or error-free, or that any booking will be accepted.',
        'If Konjo is nevertheless found liable for something connected to a booking, its total liability is limited to the amount permitted by applicable Ethiopian law. Konjo is not liable for indirect or consequential loss, including lost income, medical costs, or lost opportunities.',
        'You agree to compensate Konjo for claims, losses and costs that result from your breach of these terms or from your conduct during a visit.',
        'Nothing in these terms excludes liability for Konjo’s own fraud or gross negligence, or any liability that cannot be excluded under the laws of Ethiopia.',
      ],
    },
    {
      heading: '7. Disputes and reviews',
      paragraphs: [
        'Raise a problem from the booking within 7 days. Konjo may investigate and help the client and professional resolve a cash-payment dispute, but Konjo cannot automatically reverse cash exchanged directly between them. This does not settle any legal claim between a client and a professional.',
        'Reviews must be honest and about a completed visit. Konjo may remove reviews that break these terms.',
      ],
    },
    {
      heading: '8. Law enforcement',
      paragraphs: [
        'Konjo does not tolerate illegal activity. If an Ethiopian law enforcement authority presents a valid legal request, Konjo will disclose the information it holds that is relevant to the matter, which may include account details, booking and payment records, device information, location records from visits and SOS records.',
      ],
    },
    {
      heading: '9. Suspension, ending and changes',
      paragraphs: [
        'You can delete your account at any time from the app. Konjo may suspend or remove accounts that break these terms or put others at risk.',
        'Konjo may update these terms. For material changes you will be asked to accept them again in the app before continuing.',
      ],
    },
    {
      heading: '10. Governing law and contact',
      paragraphs: [
        'These terms are governed by the laws of the Federal Democratic Republic of Ethiopia. Contact: info@konjoet.com, Konjo, Addis Ababa, Ethiopia.',
      ],
    },
  ],
};

const englishPrivacy: LegalDocument = {
  title: 'Privacy & Security',
  intro: 'This policy explains what the Konjo app collects, why, who can see it, and how you stay in control.',
  sections: [
    {
      heading: '1. What we collect',
      paragraphs: [
        'Account details: name, phone number, email address, preferred language, and your password stored only as a secure hash.',
        'Addresses and location: the addresses you save for visits and, if you allow it, your device location to pin an address. For professionals, precise location is collected while you are on the way to a booking, including in the background, so the client can follow your arrival. Sharing starts when you tap "I’m on my way" and stops when you arrive, cancel or sign out.',
        'Identity documents: photos of a government ID, certificates and portfolio images for professionals, and identity uploads for clients where required. They are used only to verify identity and prevent fraud, are stored privately and are not shown to other users.',
        'Bookings and payments: services booked, prices, cash-payment status and booking references. Version 1 does not collect client card or wallet credentials. A professional’s settlement-account details are stored for approved future settlements or adjustments and are not used for client cash payments in version 1.',
        'Reviews, safety reports and support requests you send us, and device data such as a push notification token, app version and technical logs.',
      ],
    },
    {
      heading: '2. Why we use it',
      paragraphs: [
        'To create and run bookings, record cash-payment status, and send booking notifications by push and SMS. To verify identity, keep both sides safe, and respond to SOS alerts and safety reports. To show professionals’ public profiles, ratings and portfolios to clients. To meet legal, tax and accounting obligations.',
      ],
    },
    {
      heading: '3. Who can see it',
      paragraphs: [
        'Only what is needed for the booking: the professional sees the client’s name, address and phone for a confirmed booking; the client sees the professional’s public profile and live location during the visit.',
        'Service providers process data on our behalf: Supabase (database and authentication), Expo (push delivery), SMS Ethiopia (text messages) and our map provider CARTO (map tiles built from OpenStreetMap data), which receives map requests but not your identity. No payment provider receives client data in the cash-only version 1 flow. Konjo does not sell personal data. Konjo discloses data to authorities only on a valid legal request.',
      ],
    },
    {
      heading: '4. How long we keep it',
      paragraphs: [
        'Account data is kept while your account is active. Completed booking and payment records are kept for accounting after an account is deleted. Identity documents and portfolio images are deleted when an account is deleted. Live location points are deleted when a booking is completed or cancelled.',
      ],
    },
    {
      heading: '5. Security',
      paragraphs: [
        'Data travels over encrypted connections, sessions are stored in your phone’s secure storage, documents live in private storage, and access is restricted by role. No system is perfectly secure. Keep your password private and tell us at info@konjoet.com if you believe your account has been misused. Konjo is not responsible for access that results from you sharing your sign-in details.',
      ],
    },
    {
      heading: '6. Your choices',
      paragraphs: [
        'Delete your account from the app at any time. Turn location, notifications and camera access on or off in your phone settings. Email info@konjoet.com to access, correct or export your data.',
        'Konjo is for people aged 18 and over. We will post updates to this policy in the app and, for material changes, ask you to accept them again.',
      ],
    },
  ],
};

const amharicTerms: LegalDocument = {
  title: 'የአገልግሎት ውሎች',
  intro: 'እነዚህ ውሎች በእርስዎና በKonjo መካከል ያለ ስምምነት ናቸው። እባክዎ ያንብቧቸው። "ዕድሜዬ 18+ ነው፤ እስማማለሁ" የሚለውን ሲጫኑ ዕድሜዎ ቢያንስ 18 መሆኑን ያረጋግጣሉ እና እነዚህን ውሎችና የግላዊነትና ደህንነት መመሪያን ይቀበላሉ።',
  sections: [
    {
      heading: '1. Konjo ምንድን ነው',
      paragraphs: [
        'Konjo ደንበኞችን በአዲስ አበባ ወደ ደንበኛው አድራሻ ከሚመጡ ነጻ የውበትና እንክብካቤ ባለሙያዎች ጋር የሚያገናኝ የመስመር ላይ ገበያ ነው።',
        'Konjo ሳሎን አይደለም፤ ባለሙያዎችን አይቀጥርም። እያንዳንዱ ባለሙያ የትኛውን ቦታ ማስያዣ እንደሚቀበልና አገልግሎቱን እንዴት እንደሚሰጥ የሚወስን ነጻ ንግድ ነው። Konjo መተግበሪያውን ያቀርባል፣ የባለሙያዎችን የመታወቂያ ሰነዶች ይመረምራል፣ ቦታ ማስያዣን ያስተባብራል፣ የጥሬ ገንዘብ ክፍያ ሁኔታን ይመዘግባል እንዲሁም ድጋፍ ይሰጣል። Konjo ምንም አገልግሎት አይሰጥም፣ አይቆጣጠርም፣ አይመረምርም፤ በማንኛውም ጉብኝት ላይ አይገኝም።',
      ],
    },
    {
      heading: '2. መለያዎ',
      paragraphs: [
        'ዕድሜዎ 18 እና ከዚያ በላይ መሆን አለበት። ትክክለኛ መረጃ ይስጡ፣ የመግቢያ መረጃዎን በሚስጥር ይያዙ፣ መለያዎ ያለአግባብ ከተጠቀመ ያሳውቁን። በመለያዎ ስር ለሚደረግ ማንኛውም ነገር ኃላፊነቱ የእርስዎ ነው።',
        'ባለሙያዎች አገልግሎታቸው የሚጠይቀውን ስልጠና፣ ፈቃድና ማረጋገጫ ሊኖራቸውና ወቅታዊ ሊያደርጉት ይገባል፤ ለራሳቸው ግብርና የንግድ ግዴታዎች ኃላፊ ናቸው።',
      ],
    },
    {
      heading: '3. ቦታ ማስያዣ፣ ዋጋና ክፍያ',
      paragraphs: [
        'ሲያስይዙ የሚታየው ዋጋ የአገልግሎቱን ዋጋ፣ የKonjo የአገልግሎት ክፍያና ባለሙያው ሲቀበል የሚጨምረውን የጉዞ ክፍያ (Konjo በሚያስቀምጠው ጣሪያ መሠረት) ያካትታል።',
        'በስሪት 1 ደንበኛው አገልግሎቱ ከተጠናቀቀ በኋላ የሚታየውን ጠቅላላ ዋጋ ለባለሙያው በቀጥታ በጥሬ ገንዘብ ይከፍላል። Konjo በመተግበሪያው ቅድመ ክፍያ፣ የካርድ ወይም የዋሌት ክፍያ አይሰበስብም።',
        'መተግበሪያው የሚከፈለውን መጠን ይመዘግባል፤ ባለሙያው ጉብኝቱን ሲያጠናቅቅ የጥሬ ገንዘብ ክፍያው እንደተመዘገበ ይቆጠራል። የባለሙያ የማስተካከያ ሂሳብ በስሪት 1 ለደንበኛ የጥሬ ገንዘብ ክፍያ አይጠቀምም።',
      ],
    },
    {
      heading: '4. ስረዛና የጥሬ ገንዘብ ክርክር',
      paragraphs: [
        'ባለሙያው ከመነሳቱ በፊት ከሰረዙ በመተግበሪያው ምንም ክፍያ አይጠየቅም። ጉዞ ከተጀመረ በኋላ ወይም ደንበኛው ካልተገኘ ስለ የጉዞ ክፍያ ወይም የጥሬ ገንዘብ ክርክር የKonjo ድጋፍን ያነጋግሩ።',
        'Konjo በደንበኛና በባለሙያ መካከል በቀጥታ የተለዋወጠ ጥሬ ገንዘብ በራስ-ሰር መመለስ አይችልም። ቅሬታ ከጉብኝቱ በኋላ በ7 ቀናት ውስጥ ማቅረብ ይቻላል።',
      ],
    },
    {
      heading: '5. ደህንነትና ሥነ ምግባር',
      paragraphs: [
        'እርስ በርስ በአክብሮት ይያዙ። ትንኮሳ፣ መድልዎ፣ ስካር፣ አደገኛ ወይም ሕገወጥ ባህሪ ከKonjo ያስወግዳል። ሁለቱም ወገኖች በጉብኝት ወቅት የመተግበሪያውን SOS መጠቀም ይችላሉ፤ ለKonjo ድጋፍ ያሳውቃል፣ ቀጥታ አካባቢን ያጋራል። SOS የድጋፍ መሣሪያ እንጂ የአደጋ ጊዜ አገልግሎት አይደለም። በአደጋ ጊዜ መጀመሪያ ፖሊስ ወይም አምቡላንስ ይደውሉ።',
        'ደንበኞች ለአገልግሎቱ ደህንነቱ የተጠበቀ ንጹህ ቦታ ማዘጋጀትና ስለ አለርጂ፣ የቆዳ ወይም የራስ ቆዳ ችግር፣ እርግዝና፣ መድኃኒት ወይም አገልግሎቱን ወይም ጤናቸውን ሊነካ የሚችል ማንኛውንም ነገር ለባለሙያው አስቀድመው መንገር አለባቸው።',
        'ባለሙያዎች ንጹህና ጤናማ መሣሪያዎችንና ምርቶችን መጠቀም፣ የምርት መመሪያዎችን መከተል፣ ብቁ የሆኑባቸውን አገልግሎቶች ብቻ መስጠትና ደንበኛው ሲጠይቅ ወዲያውኑ ማቆም አለባቸው።',
      ],
    },
    {
      heading: '6. የእርስዎ ኃላፊነትና የKonjo ተጠያቂነት',
      paragraphs: [
        'እያንዳንዱን ቦታ ማስያዣ በፈቃደኝነት ይገባሉ። አገልግሎቱ እንዴት እንደሚሰጥ ኃላፊው ባለሙያው ብቻ ነው፤ ስለ ቤቱና ስለሚሰጠው መረጃ ኃላፊው ደንበኛው ብቻ ነው። የKonjo ሚና መድረኩን ማስተዳደር ብቻ ነው።',
        'የኢትዮጵያ ሕግ በሚፈቅደው ከፍተኛ መጠን Konjo ለሚከተሉት ኃላፊ አይደለም እንዲሁም ካሳ አይከፍልም፡ የማንኛውም አገልግሎት ጥራት፣ ደህንነት፣ ጊዜ ወይም ውጤት፤ ደንበኛ በጉብኝት ወቅት ወይም በኋላ የሚደርስበት ጉዳት፣ ሕመም፣ የአለርጂ ወይም የቆዳ ምላሽ ወይም ሌላ ማንኛውም ጉዳት፤ የደንበኛ ንብረት መጥፋት፣ መሰረቅ ወይም መበላሸት፤ ባለሙያ በደንበኛ አድራሻ የሚደርስበት ጉዳት፣ ዛቻ፣ ጥቃት ወይም ማንኛውም ጉዳት፤ የባለሙያ መሣሪያዎች፣ ምርቶች ወይም ተሽከርካሪ መጥፋት ወይም መበላሸት፤ ባለሙያ ወይም ደንበኛ አለመገኘት ወይም መዘግየት፤ በደንበኛና በባለሙያ መካከል ስለ አገልግሎት፣ ባህሪ ወይም ክፍያ የሚነሳ ማንኛውም ክርክር፤ ወይም የKonjo ሠራተኛ ያልሆነ ማንኛውም ሰው ድርጊት ወይም ቸልተኝነት።',
        'Konjo የመታወቂያ ማረጋገጫው እያንዳንዱን አደጋ እንደሚያገኝ፣ መተግበሪያው ሁልጊዜ እንደሚገኝ ወይም ከስህተት ነጻ እንደሆነ፣ ወይም ማንኛውም ቦታ ማስያዣ ተቀባይነት እንደሚያገኝ ዋስትና አይሰጥም።',
        'ይሁንና Konjo ከቦታ ማስያዣ ጋር በተያያዘ ተጠያቂ ሆኖ ከተገኘ፣ ለዚያ ቦታ ማስያዣ ያለበት አጠቃላይ ተጠያቂነት ለዚያ ቦታ ማስያዣ ለKonjo በከፈሉት መጠን የተገደበ ነው። Konjo ለተዘዋዋሪ ወይም ተከታይ ኪሳራ፣ የገቢ መጥፋትን፣ የሕክምና ወጪንና ያመለጡ ዕድሎችን ጨምሮ ኃላፊ አይደለም።',
        'እነዚህን ውሎች በመጣስዎ ወይም በጉብኝት ወቅት በባህሪዎ ምክንያት ለሚደርሱ ክሶች፣ ኪሳራዎችና ወጪዎች Konjoን ለመካስ ተስማምተዋል።',
        'በእነዚህ ውሎች ውስጥ ምንም ነገር የKonjoን የራሱን ማጭበርበር ወይም ከባድ ቸልተኝነት ተጠያቂነት፣ ወይም በኢትዮጵያ ሕግ ሊገለል የማይችል ማንኛውንም ተጠያቂነት አያገልልም።',
      ],
    },
    {
      heading: '7. ቅሬታና ግምገማ',
      paragraphs: [
        'ችግርን ከቦታ ማስያዣው ላይ በ7 ቀናት ውስጥ ያቅርቡ። Konjo የጥሬ ገንዘብ ክርክርን መመርመርና ሁለቱን ወገኖች ማገዝ ይችላል፣ ግን በቀጥታ የተለዋወጠ ጥሬ ገንዘብ በራስ-ሰር መመለስ አይችልም። ይህ በደንበኛና በባለሙያ መካከል ያለ ሕጋዊ ክስ አይፈታም።',
        'ግምገማዎች ታማኝና ስለተጠናቀቀ ጉብኝት መሆን አለባቸው። Konjo እነዚህን ውሎች የሚጥሱ ግምገማዎችን ሊያስወግድ ይችላል።',
      ],
    },
    {
      heading: '8. ሕግ አስከባሪ አካላት',
      paragraphs: [
        'Konjo ሕገወጥ ተግባርን አይታገስም። የኢትዮጵያ ሕግ አስከባሪ አካል ትክክለኛ ሕጋዊ ጥያቄ ሲያቀርብ Konjo ከጉዳዩ ጋር የሚዛመደውን የያዘውን መረጃ ይገልጻል፤ ይህ የመለያ መረጃን፣ የቦታ ማስያዣና የክፍያ መዝገቦችን፣ የመሣሪያ መረጃን፣ የጉብኝት አካባቢ መዝገቦችንና የSOS መዝገቦችን ሊያካትት ይችላል።',
      ],
    },
    {
      heading: '9. እገዳ፣ መዝጋትና ለውጦች',
      paragraphs: [
        'መለያዎን በማንኛውም ጊዜ ከመተግበሪያው መሰረዝ ይችላሉ። Konjo እነዚህን ውሎች የሚጥሱ ወይም ሌሎችን ለአደጋ የሚያጋልጡ መለያዎችን ሊያግድ ወይም ሊያስወግድ ይችላል።',
        'Konjo እነዚህን ውሎች ሊያዘምን ይችላል። ለከፍተኛ ለውጦች ከመቀጠልዎ በፊት በመተግበሪያው እንደገና እንዲቀበሉ ይጠየቃሉ።',
      ],
    },
    {
      heading: '10. የሚገዛ ሕግና አድራሻ',
      paragraphs: [
        'እነዚህ ውሎች በኢትዮጵያ ፌዴራላዊ ዲሞክራሲያዊ ሪፐብሊክ ሕጎች ይገዛሉ። አድራሻ፡ info@konjoet.com፣ Konjo፣ አዲስ አበባ፣ ኢትዮጵያ።',
      ],
    },
  ],
};

const amharicPrivacy: LegalDocument = {
  title: 'ግላዊነትና ደህንነት',
  intro: 'ይህ መመሪያ የKonjo መተግበሪያ ምን እንደሚሰበስብ፣ ለምን፣ ማን ሊያየው እንደሚችልና እርስዎ እንዴት እንደሚቆጣጠሩ ያብራራል።',
  sections: [
    {
      heading: '1. ምን እንሰበስባለን',
      paragraphs: [
        'የመለያ መረጃ፡ ስም፣ ስልክ ቁጥር፣ ኢሜይል፣ የሚመርጡት ቋንቋ እና የይለፍ ቃልዎ (በደህንነቱ የተጠበቀ ሃሽ ብቻ ተከማችቶ)።',
        'አድራሻና አካባቢ፡ ለጉብኝት የሚያስቀምጧቸው አድራሻዎች እና ከፈቀዱ አድራሻ ለመለየት የመሣሪያዎ አካባቢ። ለባለሙያዎች ወደ ቦታ ማስያዣ በመንገድ ላይ ሲሆኑ ደንበኛው መምጣትዎን እንዲከታተል ትክክለኛ አካባቢ ከበስተጀርባም ጭምር ይሰበሰባል። ማጋራት "በመንገድ ላይ ነኝ" ሲጫኑ ይጀምራል፤ ሲደርሱ፣ ሲሰርዙ ወይም ሲወጡ ይቆማል።',
        'የመታወቂያ ሰነዶች፡ ለባለሙያዎች የመንግሥት መታወቂያ ፎቶዎች፣ የምስክር ወረቀቶችና የሥራ ናሙና ምስሎች፤ ለደንበኞች አስፈላጊ ሲሆን የመታወቂያ ሰቀላዎች። ማንነትን ለማረጋገጥና ማጭበርበርን ለመከላከል ብቻ ያገለግላሉ፣ በግል ይከማቻሉ፣ ለሌሎች ተጠቃሚዎች አይታዩም።',
        'ቦታ ማስያዣና ክፍያ፡ የተያዙ አገልግሎቶች፣ ዋጋዎች፣ የጥሬ ገንዘብ ክፍያ ሁኔታና የቦታ ማስያዣ ማጣቀሻዎች። ስሪት 1 የደንበኛ ካርድ ወይም ዋሌት መረጃ አይሰበስብም። የባለሙያ የማስተካከያ ሂሳብ መረጃ ለተፈቀደ የወደፊት ማስተካከያ ይቀመጣል።',
        'የሚልኩልን ግምገማዎች፣ የደህንነት ሪፖርቶችና የድጋፍ ጥያቄዎች፣ እንዲሁም የግፊት ማሳወቂያ ቶከን፣ የመተግበሪያ ስሪትና ቴክኒካዊ መዝገቦች ያሉ የመሣሪያ መረጃዎች።',
      ],
    },
    {
      heading: '2. ለምን እንጠቀማለን',
      paragraphs: [
        'ቦታ ማስያዣ ለመፍጠርና ለማስኬድ፣ የጥሬ ገንዘብ ክፍያ ሁኔታን ለመመዝገብና የቦታ ማስያዣ ማሳወቂያዎችን በግፊትና በSMS ለመላክ። ማንነትን ለማረጋገጥ፣ ሁለቱንም ወገኖች ደህንነት ለመጠበቅና ለSOS ማንቂያዎችና የደህንነት ሪፖርቶች ምላሽ ለመስጠት። የባለሙያዎችን ይፋዊ መገለጫ፣ ደረጃና የሥራ ናሙና ለደንበኞች ለማሳየት። ሕጋዊ፣ የግብርና የሂሳብ ግዴታዎችን ለማሟላት።',
      ],
    },
    {
      heading: '3. ማን ሊያየው ይችላል',
      paragraphs: [
        'ለቦታ ማስያዣው የሚያስፈልገው ብቻ፡ ባለሙያው ለተረጋገጠ ቦታ ማስያዣ የደንበኛውን ስም፣ አድራሻና ስልክ ያያል፤ ደንበኛው የባለሙያውን ይፋዊ መገለጫና በጉብኝት ወቅት ቀጥታ አካባቢ ያያል።',
        'የአገልግሎት አቅራቢዎች በእኛ ስም መረጃ ያስኬዳሉ፡ Supabase (ዳታቤዝና ማረጋገጫ)፣ Expo (የግፊት ማሳወቂያ)፣ SMS Ethiopia (የጽሑፍ መልዕክት) እና CARTO (የካርታ ንብርብሮች)። በጥሬ ገንዘብ ብቻ በሚሰራው ስሪት 1 ምንም የክፍያ አቅራቢ የደንበኛ መረጃ አይቀበልም። Konjo የግል መረጃ አይሸጥም።',
      ],
    },
    {
      heading: '4. ለምን ያህል ጊዜ እናስቀምጣለን',
      paragraphs: [
        'የመለያ መረጃ መለያዎ ንቁ እስከሆነ ድረስ ይቀመጣል። የተጠናቀቁ የቦታ ማስያዣና የክፍያ መዝገቦች መለያ ከተሰረዘ በኋላ ለሂሳብ ዓላማ ይቀመጣሉ። የመታወቂያ ሰነዶችና የሥራ ናሙና ምስሎች መለያ ሲሰረዝ ይሰረዛሉ። የቀጥታ አካባቢ ነጥቦች ቦታ ማስያዣ ሲጠናቀቅ ወይም ሲሰረዝ ይሰረዛሉ።',
      ],
    },
    {
      heading: '5. ደህንነት',
      paragraphs: [
        'መረጃ በተመሰጠሩ ግንኙነቶች ይተላለፋል፣ ክፍለ ጊዜዎች በስልክዎ የደህንነት ማከማቻ ይቀመጣሉ፣ ሰነዶች በግል ማከማቻ ይኖራሉ፣ መዳረሻ በሚና ይገደባል። ምንም ሥርዓት ፍጹም ደህንነቱ የተጠበቀ አይደለም። የይለፍ ቃልዎን በሚስጥር ይያዙ፤ መለያዎ ያለአግባብ ተጠቅሟል ብለው ካመኑ በinfo@konjoet.com ያሳውቁን። የመግቢያ መረጃዎን በማጋራትዎ ለሚፈጠር መዳረሻ Konjo ኃላፊ አይደለም።',
      ],
    },
    {
      heading: '6. ምርጫዎችዎ',
      paragraphs: [
        'መለያዎን በማንኛውም ጊዜ ከመተግበሪያው ይሰርዙ። አካባቢ፣ ማሳወቂያና ካሜራ መዳረሻን በስልክዎ ቅንብሮች ያብሩ ወይም ያጥፉ። መረጃዎን ለማግኘት፣ ለማስተካከል ወይም ለመላክ ወደ info@konjoet.com ኢሜይል ይላኩ።',
        'Konjo ዕድሜያቸው 18 እና ከዚያ በላይ ለሆኑ ሰዎች ነው። የዚህን መመሪያ ዝማኔዎች በመተግበሪያው እናሳውቃለን፤ ለከፍተኛ ለውጦች እንደገና እንዲቀበሉ እንጠይቃለን።',
      ],
    },
  ],
};

/** Terms and privacy documents in the given language. Oromo falls back to English for the body. */
export function legalDocuments(language: LegalLanguage): { terms: LegalDocument; privacy: LegalDocument } {
  if (language === 'am') return { terms: amharicTerms, privacy: amharicPrivacy };
  return { terms: englishTerms, privacy: englishPrivacy };
}
