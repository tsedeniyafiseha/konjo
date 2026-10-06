type Message = { title: string; body: string };
export const checkoutNotificationCopy: Record<string, Record<'en' | 'am' | 'om', Message>> = {
  booking_accepted: {
    en: { title: 'Booking accepted', body: 'Open your booking to pay the 50% deposit and confirm your visit.' },
    am: { title: 'ጥያቄዎ ተቀባይነት አግኝቷል', body: '50% ቅድመ ክፍያ ለመክፈል ቦታ ማስያዣዎን ይክፈቱ።' },
    om: { title: 'Beellamni fudhatameera', body: 'Kaffaltii duraa 50% kaffaluuf beellama keessan banaa.' },
  },
  booking_arrived: {
    en: { title: 'Your professional has arrived', body: 'The session timer starts when your professional begins work.' },
    am: { title: 'ባለሙያዎ ደርሰዋል', body: 'ባለሙያዎ ሥራ ሲጀምሩ የጊዜ መቁጠሪያው ይጀምራል።' },
    om: { title: 'Ogeessi keessan ga’eera', body: 'Yeroon tajaajilaa yeroo ogeessi hojii jalqabu eegala.' },
  },
  booking_completed: {
    en: { title: 'Your session is complete', body: 'Open your booking to review the final payment and receipt.' },
    am: { title: 'አገልግሎቱ ተጠናቋል', body: 'የመጨረሻ ክፍያና ደረሰኝ ለማየት ቦታ ማስያዣዎን ይክፈቱ።' },
    om: { title: 'Tajaajilli xumurameera', body: 'Kaffaltii xumuraa fi nagahee ilaaluuf beellama keessan banaa.' },
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
