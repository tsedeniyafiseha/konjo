type Message = { title: string; body: string };
export const checkoutNotificationCopy: Record<string, Record<'en' | 'am' | 'om', Message>> = {
  booking_accepted: {
    en: { title: 'Booking accepted', body: 'Your visit is confirmed. Pay the professional in cash after the service.' },
    am: { title: 'ጥያቄዎ ተቀባይነት አግኝቷል', body: 'ጉብኝትዎ ተረጋግጧል። አገልግሎቱ ከተጠናቀቀ በኋላ ለባለሙያው በጥሬ ገንዘብ ይክፈሉ።' },
    om: { title: 'Beellamni fudhatameera', body: 'Daawwannaan keessan mirkanaaʼeera. Tajaajila booda ogeessaaf maallaqa harkaan kaffalaa.' },
  },
  booking_arrived: {
    en: { title: 'Your professional has arrived', body: 'The session timer starts when your professional begins work.' },
    am: { title: 'ባለሙያዎ ደርሰዋል', body: 'ባለሙያዎ ሥራ ሲጀምሩ የጊዜ መቁጠሪያው ይጀምራል።' },
    om: { title: 'Ogeessi keessan ga’eera', body: 'Yeroon tajaajilaa yeroo ogeessi hojii jalqabu eegala.' },
  },
  booking_completed: {
    en: { title: 'Your session is complete', body: 'Your cash payment is recorded. Open the booking for the receipt and review.' },
    am: { title: 'አገልግሎቱ ተጠናቋል', body: 'የጥሬ ገንዘብ ክፍያዎ ተመዝግቧል። ደረሰኙን ለማየትና ግምገማ ለመስጠት ቦታ ማስያዣዎን ይክፈቱ።' },
    om: { title: 'Tajaajilli xumurameera', body: 'Kaffaltiin maallaqa harkaa galmaaʼeera. Nagahee fi madaallii ilaaluuf beellama banaa.' },
  },
  booking_deposit_paid: {
    en: { title: '50% deposit received', body: 'The visit is confirmed. Open the booking when you are ready to travel.' },
    am: { title: '50% ቅድመ ክፍያ ተቀብለናል', body: 'ጉብኝቱ ተረጋግጧል። ለጉዞ ሲዘጋጁ ቦታ ማስያዣውን ይክፈቱ።' },
    om: { title: 'Kaffaltiin duraa 50% fudhatameera', body: 'Daawwannaan mirkanaa’eera. Imaluuf yeroo qophooftan beellama banaa.' },
  },
  booking_paid: {
    en: { title: 'Booking fully paid', body: 'Both payments are confirmed. Open Konjo for the details.' },
    am: { title: 'ክፍያው ሙሉ በሙሉ ተጠናቋል', body: 'ሁለቱም ክፍያዎች ተረጋግጠዋል። ለዝርዝር Konjoን ይክፈቱ።' },
    om: { title: 'Beellamni guutumaan kaffalameera', body: 'Kaffaltiin lamaanuu mirkanaa’eera. Ibsaaf Konjo banaa.' },
  },
  payment_captured: {
    en: { title: 'Payment received', body: 'Your payment is confirmed. Open the booking for your remaining balance or receipt.' },
    am: { title: 'ክፍያ ተቀብለናል', body: 'ክፍያዎ ተረጋግጧል። ቀሪ ክፍያ ወይም ደረሰኝ ለማየት ቦታ ማስያዣዎን ይክፈቱ።' },
    om: { title: 'Kaffaltiin fudhatameera', body: 'Kaffaltiin keessan mirkanaa’eera. Haftee ykn nagahee ilaaluuf beellama banaa.' },
  },
};
