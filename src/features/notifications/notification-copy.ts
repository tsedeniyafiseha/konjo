import type { Href } from 'expo-router';
import { checkoutNotificationCopy } from '../../../shared/checkout-notification-copy';
import { isPayoutNotificationTemplate, renderPayoutNotification } from '../../../shared/payout-notification-copy';

import type { ApiNotificationRecord } from '../../../shared/api-contracts';

export type NotificationLanguage = 'en' | 'am' | 'om';
export type NotificationRole = 'client' | 'professional';

interface Rendered {
  title: string;
  body: string;
}

/** `bodyWithAmounts` may use {total} and {travelFee}; it is used when the payload carries them. */
type Copy = Record<NotificationLanguage, Rendered & { bodyWithAmounts?: string }>;

/** Mirrors backend/src/adapters/notification-copy.ts so push and inbox read the same. */
const copy: Record<string, Copy> = {
  booking_requested: {
    en: { title: 'Booking request sent', body: 'We sent your request to the professional. You will hear back shortly.' },
    am: { title: 'የቦታ ማስያዣ ጥያቄ ተልኳል', body: 'ጥያቄዎን ለባለሙያው ልከናል። በቅርቡ ምላሽ ያገኛሉ።' },
    om: { title: 'Gaaffiin beellamaa ergameera', body: 'Gaaffii keessan ogeessaaf ergineerra. Dhiyootti deebii argattu.' },
  },
  new_booking_request: {
    en: { title: 'New booking request', body: 'A client wants to book you. Accept or decline.' },
    am: { title: 'አዲስ የቦታ ማስያዣ ጥያቄ', body: 'አንድ ደንበኛ ሊያስይዝዎት ይፈልጋል። ይቀበሉ ወይም አይቀበሉ።' },
    om: { title: 'Gaaffii beellamaa haaraa', body: 'Maamilli tokko isin beellamachuu barbaada. Fudhadhaa ykn didaa.' },
  },
  booking_accepted: {
    en: {
      title: 'Booking accepted',
      body: 'Your professional accepted the booking. Complete payment to confirm the visit.',
      bodyWithAmounts: 'Your professional accepted the booking. Total ETB {total} including ETB {travelFee} travel fee. Pay the 50% deposit to confirm the visit.',
    },
    am: {
      title: 'ቦታ ማስያዣው ተቀባይነት አግኝቷል',
      body: 'ባለሙያዎ ቦታ ማስያዣውን ተቀብለዋል። ጉብኝቱን ለማረጋገጥ ክፍያውን ያጠናቅቁ።',
      bodyWithAmounts: 'ባለሙያዎ ቦታ ማስያዣውን ተቀብለዋል። ጠቅላላ ETB {total} (የጉዞ ክፍያ ETB {travelFee} ጨምሮ)። ጉብኝቱን ለማረጋገጥ የ50% ተቀማጭ ይክፈሉ።',
    },
    om: {
      title: 'Beellamni fudhatameera',
      body: 'Ogeessi keessan beellama fudhateera. Daawwannaa mirkaneessuuf kaffaltii xumuraa.',
      bodyWithAmounts: 'Ogeessi keessan beellama fudhateera. Waliigala ETB {total}, kaffaltii imalaa ETB {travelFee} dabalatee. Daawwannaa mirkaneessuuf 50% kaffalaa.',
    },
  },
  booking_on_the_way: {
    en: { title: 'Your professional is on the way', body: 'Track their live location on the booking screen.' },
    am: { title: 'ባለሙያዎ በመንገድ ላይ ነው', body: 'ቀጥታ ቦታቸውን በቦታ ማስያዣ ገጹ ይከታተሉ።' },
    om: { title: 'Ogeessi keessan karaa irra jira', body: 'Bakka isaanii kallattiin fuula beellamaa irratti hordofaa.' },
  },
  booking_in_progress: {
    en: { title: 'Your session has started', body: 'Your professional has checked in.' },
    am: { title: 'ክፍለ ጊዜዎ ተጀምሯል', body: 'ባለሙያዎ ደርሰዋል።' },
    om: { title: 'Tajaajilli keessan jalqabeera', body: 'Ogeessi keessan ga’eera.' },
  },
  booking_completed: {
    en: { title: 'Booking completed', body: 'Thanks for booking with Konjo. Rate your experience.' },
    am: { title: 'ቦታ ማስያዣው ተጠናቋል', body: 'በKonjo ስለያዙ እናመሰግናለን። ልምድዎን ይገምግሙ።' },
    om: { title: 'Beellamni xumurameera', body: 'Konjo waliin beellamachuu keessaniif galatoomaa. Muuxannoo keessan madaalaa.' },
  },
  booking_cancelled: {
    en: { title: 'Booking not going ahead', body: 'This booking was cancelled. Open it for details or book another professional.' },
    am: { title: 'ቦታ ማስያዣው ተሰርዟል', body: 'ይህ ቦታ ማስያዣ ተሰርዟል። ለዝርዝር ይክፈቱት ወይም ሌላ ባለሙያ ይያዙ።' },
    om: { title: 'Beellamni hin raawwatamu', body: 'Beellamni kun haqameera. Ibsaaf banaa ykn ogeessa biraa beellamadhaa.' },
  },
  booking_client_no_show: {
    en: { title: 'Visit could not take place', body: 'The professional could not find you at the address. The travel fee has been kept.' },
    am: { title: 'ጉብኝቱ ሊካሄድ አልቻለም', body: 'ባለሙያው በአድራሻው ሊያገኝዎት አልቻለም። የጉዞ ክፍያው ተይዟል።' },
    om: { title: 'Daawwannaan raawwatamuu hin dandeenye', body: 'Ogeessi teessoo irratti isin argachuu hin dandeenye. Kaffaltiin imalaa qabameera.' },
  },
  booking_reassigned: {
    en: { title: 'A new professional is assigned', body: 'Your original professional could not confirm in time, so we found you another one.' },
    am: { title: 'አዲስ ባለሙያ ተመድቧል', body: 'የመጀመሪያው ባለሙያ በጊዜ ማረጋገጥ ስላልቻሉ ሌላ አግኝተንልዎታል።' },
    om: { title: 'Ogeessi haaraan ramadameera', body: 'Ogeessi jalqabaa yeroon mirkaneessuu waan hin dandeenyeef kan biraa isiniif arganne.' },
  },
  booking_reassigned_away: {
    en: { title: 'Booking request expired', body: 'A request was reassigned because it was not accepted in time.' },
    am: { title: 'የቦታ ማስያዣ ጥያቄ ጊዜው አልፏል', body: 'በጊዜ ስላልተቀበሉት ጥያቄው ለሌላ ባለሙያ ተላልፏል።' },
    om: { title: 'Gaaffiin beellamaa yeroon darbeera', body: 'Gaaffiin yeroon waan hin fudhatamneef ogeessa biraatti dabarfameera.' },
  },
  booking_rescheduled: {
    en: { title: 'Booking rescheduled', body: 'A client moved a booking to a new time. Check your schedule.' },
    am: { title: 'ቦታ ማስያዣው ተቀይሯል', body: 'አንድ ደንበኛ ቦታ ማስያዣውን ወደ አዲስ ሰዓት አዛውሯል። መርሃ ግብርዎን ይመልከቱ።' },
    om: { title: 'Beellamni jijjiirameera', body: 'Maamilli tokko beellama gara yeroo haaraatti jijjiireera. Sagantaa keessan ilaalaa.' },
  },
  booking_reschedule_requested: {
    en: { title: 'New time requested', body: 'A client asked to move a confirmed booking to a new time. Open the job to accept or decline it.' },
    am: { title: 'አዲስ ሰዓት ተጠይቋል', body: 'አንድ ደንበኛ የተረጋገጠ ቦታ ማስያዣን ወደ አዲስ ሰዓት ለማዛወር ጠይቋል። ለመቀበል ወይም ላለመቀበል ሥራውን ይክፈቱ።' },
    om: { title: 'Yeroon haaraan gaafatameera', body: 'Maamilli tokko beellama mirkanaa’e gara yeroo haaraatti jijjiiruu gaafateera. Fudhachuuf ykn diduuf hojii banaa.' },
  },
  booking_reschedule_accepted: {
    en: { title: 'New time confirmed', body: 'Your professional accepted the new time. Your booking continues as usual.' },
    am: { title: 'አዲሱ ሰዓት ተረጋግጧል', body: 'ባለሙያዎ አዲሱን ሰዓት ተቀብለዋል። ቦታ ማስያዣዎ እንደተለመደው ይቀጥላል።' },
    om: { title: 'Yeroon haaraan mirkanaa’eera', body: 'Ogeessi keessan yeroo haaraa fudhateera. Beellamni keessan akkuma baratameetti itti fufa.' },
  },
  booking_reschedule_declined: {
    en: { title: 'New time not possible', body: 'Your professional cannot make the new time, so your booking keeps its original time. You can cancel for free before they set off.' },
    am: { title: 'አዲሱ ሰዓት አይቻልም', body: 'ባለሙያዎ አዲሱን ሰዓት ማድረግ አይችሉም፤ ቦታ ማስያዣዎ በመጀመሪያው ሰዓት ይቀጥላል። ከመነሳታቸው በፊት በነጻ መሰረዝ ይችላሉ።' },
    om: { title: 'Yeroon haaraan hin danda’amu', body: 'Ogeessi keessan yeroo haaraa dhaqqabuu hin danda’u, kanaaf beellamni keessan yeroo jalqabaa eega. Osoo isaan hin ka’in bilisaan haquu dandeessu.' },
  },
  booking_reminder: {
    en: { title: 'Booking tomorrow', body: 'A reminder that you have a Konjo booking tomorrow.' },
    am: { title: 'ነገ ቦታ ማስያዣ አለዎት', body: 'ነገ የKonjo ቦታ ማስያዣ እንዳለዎት ማስታወሻ።' },
    om: { title: 'Bor beellama qabdu', body: 'Bor beellama Konjo akka qabdan yaadachiisa.' },
  },
  review_submitted: {
    en: { title: 'New review', body: 'A client left you a review.' },
    am: { title: 'አዲስ ግምገማ', body: 'አንድ ደንበኛ ግምገማ ትቶልዎታል።' },
    om: { title: 'Madaallii haaraa', body: 'Maamilli tokko madaallii isiniif dhiiseera.' },
  },
  safety_incident_opened: {
    en: { title: 'Safety alert received', body: 'The Konjo safety team has been notified and will contact you.' },
    am: { title: 'የደህንነት ማንቂያ ደርሷል', body: 'የKonjo የደህንነት ቡድን ተነግሮታል፤ ያገኙዎታል።' },
    om: { title: 'Akeekkachiisni nageenyaa dhaqqabeera', body: 'Gareen nageenyaa Konjo beeksifameera; isin qunnama.' },
  },
  professional_application_approved: {
    en: { title: 'Application approved', body: 'Welcome to Konjo. Your professional account is live.' },
    am: { title: 'ማመልከቻዎ ጸድቋል', body: 'ወደ Konjo እንኳን ደህና መጡ። የባለሙያ መለያዎ ነቅቷል።' },
    om: { title: 'Iyyanni mirkanaa’eera', body: 'Baga gara Konjo dhuftan. Akkaawuntiin ogeessaa keessan hojii irra jira.' },
  },
  professional_application_rejected: {
    en: { title: 'Application not approved', body: 'Review the note in the app, update your details and submit again.' },
    am: { title: 'ማመልከቻው አልጸደቀም', body: 'ማስታወሻውን በመተግበሪያው ይመልከቱ፣ መረጃዎን ያስተካክሉና እንደገና ያስገቡ።' },
    om: { title: 'Iyyanni hin mirkanoofne', body: 'Yaadannoo appii keessatti ilaalaa, odeeffannoo sirreessaa, irra deebi’aa galchaa.' },
  },
};

const fallback: Copy = {
  en: { title: 'Konjo update', body: 'There is news about your booking.' },
  am: { title: 'የKonjo ዝማኔ', body: 'ስለ ቦታ ማስያዣዎ አዲስ ነገር አለ።' },
  om: { title: 'Odeeffannoo Konjo', body: 'Waa’ee beellamaa keessanii oduu haaraan jira.' },
};

export function renderNotification(record: Pick<ApiNotificationRecord, 'template' | 'payload'>, language: NotificationLanguage): Rendered {
  const payout = renderPayoutNotification(record.template, record.payload, language);
  if (payout) return payout;
  const message = record.payload?.message;
  const base: Rendered & { bodyWithAmounts?: string } = (checkoutNotificationCopy[record.template] ?? copy[record.template] ?? fallback)[language];
  if (typeof message === 'string' && message.trim()) return { title: base.title, body: message.trim() };
  const total = record.payload?.total;
  const travelFee = record.payload?.travelFee;
  if (base.bodyWithAmounts && typeof total === 'number' && typeof travelFee === 'number') {
    return {
      title: base.title,
      body: base.bodyWithAmounts.replace('{total}', total.toLocaleString('en-US')).replace('{travelFee}', travelFee.toLocaleString('en-US')),
    };
  }
  return { title: base.title, body: base.body };
}

/** Where tapping a notification takes the user. */
export function notificationRoute(role: NotificationRole, record: Pick<ApiNotificationRecord, 'template' | 'payload'>): Href {
  const bookingId = typeof record.payload?.bookingId === 'string' ? record.payload.bookingId : null;
  if (role === 'professional') {
    if (record.template.startsWith('professional_application')) return '/pro' as Href;
    if (isPayoutNotificationTemplate(record.template)) return '/pro/payout' as Href;
    return (bookingId ? `/pro/job?bookingId=${encodeURIComponent(bookingId)}` : '/pro/home') as Href;
  }
  if (!bookingId) return '/bookings' as Href;
  if (record.template === 'payment_captured' && record.payload?.stage === 'balance') return `/receipt/${encodeURIComponent(bookingId)}` as Href;
  return `/booking/${encodeURIComponent(bookingId)}` as Href;
}
