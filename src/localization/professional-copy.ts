import type { ProfessionalAppLanguage } from '@/features/professional/registration/professional-registration-types';

/**
 * Copy for the professional workspace (everything after approval). The language
 * is the one the professional chose when they registered, changeable later from
 * Profile → Language. Templates use {name} placeholders filled by `t(key, params)`.
 */
const english = {
  // Shared
  tabHome: 'Home', tabCalendar: 'Calendar', tabEarnings: 'Earnings', tabProfile: 'Profile',
  goBack: 'Go back', back: 'Back', cancel: 'Cancel', keep: 'Keep', delete: 'Delete', dismiss: 'Dismiss', remove: 'Remove', view: 'View', you: 'You',
  retry: 'Retry', signOut: 'Sign out', professionalFallbackName: 'Professional',
  loadError: 'We couldn’t load your professional account. Please retry to continue with your saved application.',
  today: 'Today', yesterday: 'Yesterday', daysAgo: '{days} days ago', weekAgo: '1 week ago', weeksAgo: '{weeks} weeks ago',
  visitOne: 'visit', visitMany: 'visits',

  // Home
  brandTagline: 'ATELIER & HOME', notifications: 'Notifications', availableBadge: 'AVAILABLE', offlineBadge: 'OFFLINE', availableForBookings: 'Available for bookings',
  noActiveRequests: 'No active requests right now. New bookings will appear here.',
  metricThisWeek: 'This week', metricCompleted: 'Completed', metricRating: 'Rating', metricRatingOne: 'Rating · 1 review', metricRatingMany: 'Rating · {count} reviews', ratingNew: 'New',
  upcomingBookings: 'Upcoming bookings', calendarLink: 'Calendar', recentVisits: 'Recent visits', last30Days: 'Last 30 days',
  identityReviewed: 'Identity reviewed professional.', zonesActiveIn: ' Travel zones active in {zones}.', addisAbaba: 'Addis Ababa',

  // Job cards and actions
  statusNewRequest: 'New request', statusConfirmed: 'Confirmed', statusOnTheWay: 'On the way', statusInProgress: 'In progress',
  decline: 'Decline', accept: 'Accept', confirmAccept: 'Confirm accept',
  onMyWayUnlocks: 'On my way unlocks {time}', awaitingDeposit: 'Awaiting 50% deposit', finishOtherVisit: 'Finish your visit with {name} first',
  onMyWay: 'I’m on my way', startWork: 'Start work', arrived: 'I’ve arrived', checkOut: 'Check out',
  startWorkTimer: 'Start work — start timer', checkOutRequest: 'Check out — request final payment',
  travelFeeLabel: 'Travel fee (0–{cap} ETB):', travelFeeAccessibility: 'Travel fee in ETB',
  travelFeeNone: 'No travel fee. The client pays the service price only.',
  travelFeeAdded: 'ETB {fee} is added to the client’s total. They can cancel for free until you set off.',
  travelFeeInvalid: 'Enter a whole number between 0 and {cap} ETB. Konjo sets this limit.',
  checkoutQuestion: 'Did {name} take any extra services?', extrasLabel: 'Extra services (ETB, optional):', extrasAccessibility: 'Extra services amount in ETB',
  extrasNoteAccessibility: 'What the extra services were', extrasNotePlaceholder: 'What was added, e.g. two extra rows of braids',
  extrasInvalid: 'Enter a whole number of birr up to 100,000, or leave it empty.',
  extrasNone: 'No extras. The client pays the remaining ETB {amount}.',
  extrasAdded: 'ETB {amount} plus Konjo’s ETB {fee} service fee is added to the client’s final payment, ETB {total} in total. You receive the full ETB {amount}.',
  travelSuffix: ' · +ETB {fee} travel', extrasSuffix: ' · +ETB {amount} extras',

  rescheduleTitle: 'New time requested', rescheduleBody: '{name} asked to move this visit to {when}. Your booking keeps its current time until you answer.',
  approveReschedule: 'Accept new time', declineReschedule: 'Keep current time',

  // Payment state
  cancelled: 'Cancelled', completed: 'Completed', paid: 'Paid', awaitingPayment: 'Awaiting payment', paidInCash: 'Paid in cash', paymentPending: 'Payment pending',
  paidInFull: 'Paid in full · ETB {amount}', awaitingFinalPayment: 'Awaiting final payment · ETB {amount} due',
  eyebrowCancelled: 'CANCELLED', eyebrowDone: 'DONE', eyebrowStarts: 'STARTS',
  badgeAwaitingReply: 'Awaiting reply', badgeOnTheWay: 'On the way', badgeInProgress: 'In progress', badgeConfirmed: 'Confirmed',

  // Calendar
  calendarTitle: 'Calendar', nothingScheduled: 'Nothing scheduled yet.',

  // Earnings
  earningsTitle: 'Earnings', thisWeekEyebrow: 'THIS WEEK', payoutProcessing: 'Payout being processed', payoutsGoTo: 'Payouts go to',
  addPayoutInProfile: 'Add a payout method in your profile',
  commissionNote: 'Clients pay Konjo. After each visit is checked out, the Konjo team sends your net earnings to the payout method above. The platform commission is already deducted.',
  payoutHistory: 'Payout history', loadingPayouts: 'Loading payouts…',
  noPayouts: 'No payouts yet. Completed visits appear here once Konjo prepares a payout.',
  payoutPaid: 'Paid', payoutRef: ' · ref {reference}', payoutQueued: 'Being processed by Konjo', payoutFailed: 'Payment failed · contact support',

  // Finished job
  finishedAt: 'Finished {when}', bookingCancelled: 'Booking cancelled', paymentComplete: 'Payment complete', finalPaymentOutstanding: 'Final payment outstanding',
  depositBalanceLine: 'Deposit: ETB {deposit} {depositMark} · Balance: ETB {balance} {balanceMark}', unpaidMark: '(unpaid)', pendingMark: '(pending)',
  balanceNote: 'The client pays the balance from their booking screen. You will be notified the moment it lands, and it is added to your next payout.',

  // Job screen
  jobDetails: 'Job details', loadingBookings: 'Loading your bookings…',
  bookingNotInList: 'This booking is no longer in your list. Bookings older than 30 days are kept in Earnings.', noActiveJob: 'No active job to show.',
  navigate: 'Navigate', navigateLeft: ' · {distance} left', navigateWritten: 'Navigate to the written address',
  noPinNote: 'The client did not pin their address, so navigation searches the written address. Confirm the spot with them if it looks off.',
  sharingOn: 'Sharing your live location with the client. It stops automatically when you tap I’ve arrived.',
  sharingOff: 'Location sharing is off. Allow location access so the client can follow your arrival.',
  sharingStopped: 'Location sharing stopped when you arrived.', sessionTimer: 'Session timer running',
  paidRemaining: 'Paid: ETB {paid} · Remaining: ETB {remaining}', noShowButton: 'Client is not here · Record no-show', sosButton: 'SOS · Alert Konjo support',
  sosTitle: 'Send an SOS alert?', sosBody: 'Konjo operations and the client will be alerted. Your current location is attached when permission is granted.',
  sosSend: 'Send SOS', sosSentTitle: 'SOS sent', sosSentWithLocation: 'The alert and your location were shared.', sosSentNoLocation: 'The alert was sent without location.',
  sosFailedTitle: 'SOS not sent', sosFailedBody: 'Call local emergency services if you are in immediate danger.',
  noShowTitle: 'Record client no-show?',
  noShowBody: 'This cancels the visit. The travel fee and {rate}% service commission are retained under Konjo policy; the remaining prepaid amount is refunded.',
  keepBooking: 'Keep booking', recordNoShow: 'Record no-show',

  // Profile
  profileTitle: 'Profile', profileAccessibility: '{name} profile', newProfessional: 'New professional · No reviews yet', zonesPrefix: 'Zones: {zones}', notSelected: 'Not selected',
  jobsDone: 'Jobs done', experience: 'Experience', yearsShort: '{years} yrs', repeats: 'Repeats', onTime: 'On-time',
  editProfileRow: 'Edit profile, hours & location', servicesRow: 'Services & pricing', portfolioRow: 'Portfolio photos', identityRow: 'Identity review',
  zonesRow: 'Home zones & travel', payoutRow: 'Payout account', languageRow: 'Language / ቋንቋ / Afaan', helpRow: 'Help & support',
  logOut: 'Log out', deleteAccount: 'Delete my account', version: 'Konjo Pro v1.0 · Addis Ababa',
  statusApproved: 'Approved', statusPending: 'Pending review', statusChangesRequested: 'Changes requested', statusRejected: 'Rejected', statusSuspended: 'Suspended',
  deleteTitle: 'Delete your Konjo Pro account?',
  deleteBody: 'Your profile, documents, portfolio and payout details are removed and you are signed out. Completed bookings stay in Konjo’s records for accounting. This cannot be undone.',
  keepAccount: 'Keep account', deleteConfirm: 'Delete account', deleteFailedTitle: 'Account not deleted', deleteFailedBody: 'Please try again or email support.',

  // Ratings
  ratingsTitle: 'Client reviews & ratings', basedOnOne: 'Based on 1 verified home visit', basedOnMany: 'Based on {count} verified home visits',
  ratingAppears: 'Your rating appears after your first completed visit is reviewed.', overallScore: 'OVERALL SCORE', verifiedOnly: 'Verified clients only',
  techniqueResults: 'Technique & results', professionalismPunctuality: 'Professionalism & punctuality', clientReviews: 'CLIENT REVIEWS',
  noReviews: 'No reviews yet. Clients can leave one after each completed visit.', reviewBreakdown: 'Technique {technique}/5 · Professionalism {professionalism}/5',

  // Services
  servicesTitle: 'Services & pricing', popular: '★ Popular', removeService: 'Remove {name}', durationLabel: 'DURATION', hoursValue: '{hours} hours',
  yourPrice: 'YOUR PRICE (ETB)', changePrice: 'Change price', changePriceAccessibility: 'Change the price of {name}', addNewService: '+ Add a new service',
  servicesInfo: 'Prices include your supplies and equipment. Change a price here and clients see it from their next booking. Prices are never changed on a booking that is already made; if a client takes extra services during a visit, you add the amount when you check out and it joins their final payment.',
  newPriceBody: 'New price in ETB. Clients who already booked keep the price they saw.', newPriceAccessibility: 'New price in ETB',
  priceInvalid: 'Enter a whole number between 50 and 100,000.', savePrice: 'Save price',
  removeServiceTitle: 'Remove service?', removeServiceBody: '{name} will no longer be available for new bookings.', keepService: 'Keep service',

  // Zones
  zonesTitle: 'Home zones & travel', workingHours: 'WORKING HOURS', dayAvailability: '{day} availability', zonesYouTravelTo: 'ZONES YOU TRAVEL TO',
  zonesIntro: 'Clients can only request bookings if their home is within your chosen sub-cities.',
  zonesSelectedNote: '{count} zones selected. Clients outside your active travel zones will not be able to book home visits.',
  instantBooking: 'INSTANT BOOKING PREFERENCES', sameDay: 'Accept same-day bookings', sameDayHelp: 'Requires at least 3 hours notice before arrival.',
  bookingPreference: 'BOOKING PREFERENCE', alwaysBookable: 'Clients can book you at any hour while your availability switch is on.',

  // Documents
  documentsTitle: 'Verification documents',
  documentsBanner: 'Identity evidence stays private and is reviewed only by authorized Konjo Operations staff.',
  idFront: 'National ID front', idBack: 'National ID back', diplomas: 'Diploma / certificates',
  docApproved: 'Approved', docInReview: 'In review', docAdded: 'Added', docRequiredOnboarding: 'Required for onboarding', docRejected: 'Rejected', docRequired: 'Required', docPending: 'Pending',
  uploaded: 'Uploaded {date}', chooseDocument: 'Choose a document…', uploadingSecurely: 'Uploading securely…', uploadCertificate: '+ Upload diploma / certificate',
  deleteDocTitle: 'Delete document?', deleteDocBody: 'This removes the private file and its review record.', deleteFile: 'Delete {name}', certificateFallback: 'Certificate',
  documentsPrivacy: 'Your highest-education certificate is required for onboarding. You can also add nail, barbering, massage, or other course certificates. Identity images are used only for internal review.',

  // Payout
  payoutTitle: 'Payout account', payoutMethodEyebrow: 'PAYOUT METHOD', notSetYet: 'Not set yet',
  payoutDescription: 'Clients pay Konjo; after each completed visit the Konjo team sends your earnings here. The platform commission is already deducted.',
  changePayout: 'Change payout method', addPayout: 'Add payout method', payoutHistoryEyebrow: 'PAYOUT HISTORY',

  // Help
  helpTitle: 'Help & support', emergencyTitle: 'In an emergency during a visit',
  emergencyText: 'Use the SOS button on the job screen: it alerts Konjo support with your live location. For immediate danger, call the police first.',
  callSupport: 'Call support · {phone}', emailSupport: 'Email support · {email}', reportSafety: 'Report a safety issue', faqEyebrow: 'FREQUENTLY ASKED',
  faq1Q: 'When and how are weekly payouts sent?',
  faq1A: 'Konjo pays your completed visits to the payout account on your profile, usually within a week of the client’s final payment. Each payment shows in Earnings with a reference.',
  faq2Q: 'What happens if a client cancels last minute?',
  faq2A: 'If the client cancels after you set off, your travel fee is kept for you. Cancellations before that refund the client in full and the visit simply disappears from your list.',
  faq3Q: 'How do I add a new zone or service?',
  faq3A: 'Open Profile, then Services & pricing or Home zones & travel. Changes apply to new bookings right away.',
  safetyEmailSubject: 'Safety issue report from a Konjo professional', safetyEmailBody: 'Please describe what happened, when, and the booking involved:\n',
  supportEmailSubject: 'Support request from a Konjo professional',

  // Edit profile
  editProfileTitle: 'Edit profile', editAfterApproval: 'Your profile can be edited once your application is approved.',
  specialtyLocked: 'Your approved specialty can only be changed by Konjo support.', aboutYou: 'ABOUT YOU', displayName: 'Display name', emailOptional: 'Email (optional)',
  introduction: 'Introduction', yearsExperience: 'Years of experience', educationLevel: 'Highest education level', gender: 'Gender',
  genderHelp: 'Shown on your public profile so clients can filter and choose a professional they are comfortable with.',
  genderFemale: 'Female', genderMale: 'Male', genderUnspecified: 'Prefer not to say', howPaid: 'How Konjo pays you',
  payoutHelp: 'Clients pay Konjo. After each completed visit the Konjo team sends your earnings here.',
  telebirr: 'Telebirr', cbeBirr: 'CBE Birr', bankAccount: 'Bank account', accountHolder: 'Account holder name', bankName: 'Bank name', accountNumber: 'Account number', mobileNumber: 'Mobile number',
  languagesYouSpeak: 'Languages you speak', baseLocation: 'BASE LOCATION', baseLocationHint: 'Where you are based. Clients see this on your profile.',
  workingDaysHours: 'WORKING DAYS & HOURS', workingHint: 'Tap a start or end time to change it.', startTime: '{day} start time', endTime: '{day} end time', dayOff: 'Day off',
  sameDayNotice: 'Requires at least 3 hours notice.', zonesHint: 'Clients can only book you if they live in one of these zones.',
  servicesPrices: 'SERVICES & PRICES', servicesStay: 'All services stay in {specialty}.', serviceName: 'Service name', shorter: 'Shorter', longer: 'Longer',
  minutesValue: '{minutes} min', priceEtb: 'Price (ETB)', includedPlaceholder: 'What is included (optional)', addAnotherService: '+ Add another {specialty} service',
  saveChanges: 'Save changes', saveFailed: 'Your changes could not be saved.',
  vDisplayName: 'Enter a display name of at least 2 characters.', vEmail: 'Enter a valid email address or leave it empty.', vBio: 'Your introduction needs at least 30 characters.',
  vYears: 'Years of experience must be between 0 and 60.', vEducation: 'Choose your highest education level.', vGender: 'Choose your gender, or "Prefer not to say".',
  vPayout: 'Choose how Konjo should pay you and fill in the account details.', vLanguages: 'Choose at least one language.', vBaseZone: 'Choose your base location.',
  vWorkingDay: 'Turn on at least one working day.', vTravelZone: 'Choose at least one travel zone.', vService: 'Keep at least one service.', vServiceFields: 'Every service needs a name and a price.',

  // Language settings
  languageSaveFailed: 'Your language could not be saved. Check your connection and try again.',
} as const;

export type ProfessionalCopyKey = keyof typeof english;
export type ProfessionalCopy = { [Key in ProfessionalCopyKey]: string };

const amharic: ProfessionalCopy = {
  tabHome: 'መነሻ', tabCalendar: 'ቀን መቁጠሪያ', tabEarnings: 'ገቢ', tabProfile: 'መገለጫ',
  goBack: 'ተመለስ', back: 'ተመለስ', cancel: 'ሰርዝ', keep: 'አቆይ', delete: 'አጥፋ', dismiss: 'ዝጋ', remove: 'አስወግድ', view: 'እይ', you: 'እርስዎ',
  retry: 'እንደገና ሞክር', signOut: 'ውጣ', professionalFallbackName: 'ባለሙያ',
  loadError: 'የባለሙያ መለያዎን መጫን አልተቻለም። በተቀመጠው ማመልከቻዎ ለመቀጠል እንደገና ይሞክሩ።',
  today: 'ዛሬ', yesterday: 'ትናንት', daysAgo: 'ከ{days} ቀናት በፊት', weekAgo: 'ከ1 ሳምንት በፊት', weeksAgo: 'ከ{weeks} ሳምንታት በፊት',
  visitOne: 'ጉብኝት', visitMany: 'ጉብኝቶች',

  brandTagline: 'አቴሊዬ እና ቤት', notifications: 'ማሳወቂያዎች', availableBadge: 'ዝግጁ', offlineBadge: 'ከመስመር ውጭ', availableForBookings: 'ለቦታ ማስያዝ ዝግጁ',
  noActiveRequests: 'አሁን ንቁ ጥያቄ የለም። አዳዲስ ቦታ ማስያዣዎች እዚህ ይታያሉ።',
  metricThisWeek: 'በዚህ ሳምንት', metricCompleted: 'የተጠናቀቁ', metricRating: 'ደረጃ', metricRatingOne: 'ደረጃ · 1 ግምገማ', metricRatingMany: 'ደረጃ · {count} ግምገማዎች', ratingNew: 'አዲስ',
  upcomingBookings: 'የሚመጡ ቦታ ማስያዣዎች', calendarLink: 'ቀን መቁጠሪያ', recentVisits: 'የቅርብ ጊዜ ጉብኝቶች', last30Days: 'ያለፉት 30 ቀናት',
  identityReviewed: 'ማንነቱ የተረጋገጠ ባለሙያ።', zonesActiveIn: ' የጉዞ አካባቢዎች በ{zones} ንቁ ናቸው።', addisAbaba: 'አዲስ አበባ',

  statusNewRequest: 'አዲስ ጥያቄ', statusConfirmed: 'ተረጋግጧል', statusOnTheWay: 'በመንገድ ላይ', statusInProgress: 'በሂደት ላይ',
  decline: 'አትቀበል', accept: 'ተቀበል', confirmAccept: 'መቀበሉን አረጋግጥ',
  onMyWayUnlocks: '«በመንገድ ላይ ነኝ» {time} ይከፈታል', awaitingDeposit: '50% ቅድመ ክፍያ በመጠበቅ ላይ', finishOtherVisit: 'መጀመሪያ ከ{name} ጋር ያለውን ጉብኝት ይጨርሱ',
  onMyWay: 'በመንገድ ላይ ነኝ', startWork: 'ሥራ ጀምር', arrived: 'ደርሻለሁ', checkOut: 'አጠናቅ',
  startWorkTimer: 'ሥራ ጀምር — ሰዓት ቆጣሪ ያስጀምሩ', checkOutRequest: 'አጠናቅ — የመጨረሻ ክፍያ ጠይቅ',
  travelFeeLabel: 'የመጓጓዣ ክፍያ (0–{cap} ብር)፡', travelFeeAccessibility: 'የመጓጓዣ ክፍያ በብር',
  travelFeeNone: 'የመጓጓዣ ክፍያ የለም። ደንበኛው የአገልግሎቱን ዋጋ ብቻ ይከፍላል።',
  travelFeeAdded: 'ETB {fee} በደንበኛው ጠቅላላ ላይ ይጨመራል። እስኪነሱ ድረስ በነጻ መሰረዝ ይችላሉ።',
  travelFeeInvalid: 'ከ0 እስከ {cap} ብር ሙሉ ቁጥር ያስገቡ። ይህን ገደብ Konjo ያስቀምጣል።',
  checkoutQuestion: '{name} ተጨማሪ አገልግሎት ወስደዋል?', extrasLabel: 'ተጨማሪ አገልግሎቶች (ብር፣ አማራጭ)፡', extrasAccessibility: 'የተጨማሪ አገልግሎቶች መጠን በብር',
  extrasNoteAccessibility: 'ተጨማሪ አገልግሎቶቹ ምን ነበሩ', extrasNotePlaceholder: 'የተጨመረው ነገር፣ ለምሳሌ ሁለት ተጨማሪ መስመር ሹሩባ',
  extrasInvalid: 'እስከ 100,000 ብር ሙሉ ቁጥር ያስገቡ ወይም ባዶ ይተዉት።',
  extrasNone: 'ተጨማሪ የለም። ደንበኛው ቀሪውን ETB {amount} ይከፍላል።',
  extrasAdded: 'ETB {amount} እና የKonjo የአገልግሎት ክፍያ ETB {fee} በደንበኛው የመጨረሻ ክፍያ ላይ ይጨመራል፤ በአጠቃላይ ETB {total}። እርስዎ ሙሉውን ETB {amount} ይቀበላሉ።',
  travelSuffix: ' · +ETB {fee} መጓጓዣ', extrasSuffix: ' · +ETB {amount} ተጨማሪ',

  rescheduleTitle: 'አዲስ ሰዓት ተጠይቋል', rescheduleBody: '{name} ይህን ጉብኝት ወደ {when} ለማዛወር ጠይቀዋል። እስኪመልሱ ድረስ ቦታ ማስያዣው በአሁኑ ሰዓት ይቆያል።',
  approveReschedule: 'አዲሱን ሰዓት ተቀበል', declineReschedule: 'የአሁኑን ሰዓት አቆይ',
  cancelled: 'ተሰርዟል', completed: 'ተጠናቋል', paid: 'ተከፍሏል', awaitingPayment: 'ክፍያ በመጠበቅ ላይ', paidInCash: 'በጥሬ ገንዘብ ተከፍሏል', paymentPending: 'ክፍያ በመጠባበቅ ላይ',
  paidInFull: 'ሙሉ በሙሉ ተከፍሏል · ETB {amount}', awaitingFinalPayment: 'የመጨረሻ ክፍያ በመጠበቅ ላይ · ETB {amount} ይቀራል',
  eyebrowCancelled: 'ተሰርዟል', eyebrowDone: 'ተጠናቋል', eyebrowStarts: 'ይጀምራል',
  badgeAwaitingReply: 'ምላሽ በመጠበቅ ላይ', badgeOnTheWay: 'በመንገድ ላይ', badgeInProgress: 'በሂደት ላይ', badgeConfirmed: 'ተረጋግጧል',

  calendarTitle: 'ቀን መቁጠሪያ', nothingScheduled: 'እስካሁን የተያዘ ነገር የለም።',

  earningsTitle: 'ገቢ', thisWeekEyebrow: 'በዚህ ሳምንት', payoutProcessing: 'ክፍያ በሂደት ላይ', payoutsGoTo: 'ክፍያዎች የሚላኩት ወደ',
  addPayoutInProfile: 'በመገለጫዎ ውስጥ የክፍያ ዘዴ ያክሉ',
  commissionNote: 'ደንበኞች ለKonjo ይከፍላሉ። እያንዳንዱ ጉብኝት ከተጠናቀቀ በኋላ የKonjo ቡድን የተጣራ ገቢዎን ከላይ ወዳለው የክፍያ ዘዴ ይልካል። የመድረኩ ኮሚሽን አስቀድሞ ተቀንሷል።',
  payoutHistory: 'የክፍያ ታሪክ', loadingPayouts: 'ክፍያዎች በመጫን ላይ…',
  noPayouts: 'እስካሁን ክፍያ የለም። Konjo ክፍያ ሲያዘጋጅ የተጠናቀቁ ጉብኝቶች እዚህ ይታያሉ።',
  payoutPaid: 'ተከፍሏል', payoutRef: ' · ማጣቀሻ {reference}', payoutQueued: 'በKonjo በሂደት ላይ', payoutFailed: 'ክፍያ አልተሳካም · ድጋፍን ያነጋግሩ',

  finishedAt: '{when} ተጠናቋል', bookingCancelled: 'ቦታ ማስያዣው ተሰርዟል', paymentComplete: 'ክፍያ ተጠናቋል', finalPaymentOutstanding: 'የመጨረሻ ክፍያ ይቀራል',
  depositBalanceLine: 'ቅድመ ክፍያ፡ ETB {deposit} {depositMark} · ቀሪ፡ ETB {balance} {balanceMark}', unpaidMark: '(አልተከፈለም)', pendingMark: '(በመጠባበቅ ላይ)',
  balanceNote: 'ደንበኛው ቀሪውን ከቦታ ማስያዣ ገጹ ይከፍላል። እንደደረሰ ወዲያውኑ ይነገርዎታል፤ በቀጣዩ ክፍያዎ ላይ ይጨመራል።',

  jobDetails: 'የሥራ ዝርዝር', loadingBookings: 'ቦታ ማስያዣዎችዎ በመጫን ላይ…',
  bookingNotInList: 'ይህ ቦታ ማስያዣ ከዝርዝርዎ ውስጥ የለም። ከ30 ቀናት በላይ የሆኑ ቦታ ማስያዣዎች በገቢ ውስጥ ይቀመጣሉ።', noActiveJob: 'የሚታይ ንቁ ሥራ የለም።',
  navigate: 'አቅጣጫ', navigateLeft: ' · {distance} ይቀራል', navigateWritten: 'ወደ የተጻፈው አድራሻ አቅጣጫ',
  noPinNote: 'ደንበኛው አድራሻውን በካርታ አላመለከተም፤ ስለዚህ አቅጣጫው የተጻፈውን አድራሻ ይፈልጋል። ትክክል ካልመሰለ ከደንበኛው ጋር ያረጋግጡ።',
  sharingOn: 'የቀጥታ አካባቢዎን ለደንበኛው እያጋሩ ነው። «ደርሻለሁ» ሲነኩ በራሱ ይቆማል።',
  sharingOff: 'አካባቢ ማጋራት ጠፍቷል። ደንበኛው መድረስዎን እንዲከታተል የአካባቢ ፈቃድ ይስጡ።',
  sharingStopped: 'ሲደርሱ አካባቢ ማጋራት ቆሟል።', sessionTimer: 'የሥራ ሰዓት ቆጣሪ እየሄደ ነው',
  paidRemaining: 'የተከፈለ፡ ETB {paid} · ቀሪ፡ ETB {remaining}', noShowButton: 'ደንበኛው እዚህ የለም · አለመገኘት መዝግብ', sosButton: 'SOS · የKonjo ድጋፍን አስጠንቅቅ',
  sosTitle: 'የSOS ማንቂያ ይላክ?', sosBody: 'የKonjo ኦፕሬሽኖች እና ደንበኛው ይነገራቸዋል። ፈቃድ ከተሰጠ የአሁኑ አካባቢዎ ይያያዛል።',
  sosSend: 'SOS ላክ', sosSentTitle: 'SOS ተልኳል', sosSentWithLocation: 'ማንቂያው እና አካባቢዎ ተጋርተዋል።', sosSentNoLocation: 'ማንቂያው ያለ አካባቢ ተልኳል።',
  sosFailedTitle: 'SOS አልተላከም', sosFailedBody: 'በአፋጣኝ አደጋ ውስጥ ከሆኑ የአካባቢውን የአደጋ ጊዜ አገልግሎት ይደውሉ።',
  noShowTitle: 'የደንበኛ አለመገኘት ይመዝገብ?',
  noShowBody: 'ይህ ጉብኝቱን ይሰርዛል። የመጓጓዣ ክፍያው እና {rate}% የአገልግሎት ኮሚሽን በKonjo ፖሊሲ መሠረት ይቀራሉ፤ ቀሪው አስቀድሞ የተከፈለ መጠን ይመለሳል።',
  keepBooking: 'ቦታ ማስያዣውን አቆይ', recordNoShow: 'አለመገኘት መዝግብ',

  profileTitle: 'መገለጫ', profileAccessibility: 'የ{name} መገለጫ', newProfessional: 'አዲስ ባለሙያ · እስካሁን ግምገማ የለም', zonesPrefix: 'አካባቢዎች፡ {zones}', notSelected: 'አልተመረጠም',
  jobsDone: 'የተሠሩ ሥራዎች', experience: 'ልምድ', yearsShort: '{years} ዓመት', repeats: 'ተደጋጋሚ', onTime: 'በሰዓቱ',
  editProfileRow: 'መገለጫ፣ ሰዓት እና አካባቢ አርትዕ', servicesRow: 'አገልግሎቶች እና ዋጋ', portfolioRow: 'የሥራ ፎቶዎች', identityRow: 'የማንነት ግምገማ',
  zonesRow: 'የመነሻ አካባቢዎች እና ጉዞ', payoutRow: 'የክፍያ ሂሳብ', languageRow: 'Language / ቋንቋ / Afaan', helpRow: 'እገዛ እና ድጋፍ',
  logOut: 'ውጣ', deleteAccount: 'መለያዬን አጥፋ', version: 'Konjo Pro v1.0 · አዲስ አበባ',
  statusApproved: 'ጸድቋል', statusPending: 'በግምገማ ላይ', statusChangesRequested: 'ለውጦች ተጠይቀዋል', statusRejected: 'ውድቅ ተደርጓል', statusSuspended: 'ታግዷል',
  deleteTitle: 'የKonjo Pro መለያዎ ይጥፋ?',
  deleteBody: 'መገለጫዎ፣ ሰነዶችዎ፣ የሥራ ፎቶዎችዎ እና የክፍያ ዝርዝሮችዎ ይወገዳሉ እና ይወጣሉ። የተጠናቀቁ ቦታ ማስያዣዎች ለሂሳብ አያያዝ በKonjo መዝገብ ይቆያሉ። ይህ ሊቀለበስ አይችልም።',
  keepAccount: 'መለያውን አቆይ', deleteConfirm: 'መለያ አጥፋ', deleteFailedTitle: 'መለያው አልጠፋም', deleteFailedBody: 'እንደገና ይሞክሩ ወይም ለድጋፍ ኢሜይል ይላኩ።',

  ratingsTitle: 'የደንበኞች ግምገማ እና ደረጃ', basedOnOne: 'በ1 የተረጋገጠ የቤት ጉብኝት ላይ የተመሠረተ', basedOnMany: 'በ{count} የተረጋገጡ የቤት ጉብኝቶች ላይ የተመሠረተ',
  ratingAppears: 'የመጀመሪያው የተጠናቀቀ ጉብኝትዎ ከተገመገመ በኋላ ደረጃዎ ይታያል።', overallScore: 'አጠቃላይ ነጥብ', verifiedOnly: 'የተረጋገጡ ደንበኞች ብቻ',
  techniqueResults: 'ቴክኒክ እና ውጤት', professionalismPunctuality: 'ሙያዊነት እና ሰዓት አክባሪነት', clientReviews: 'የደንበኞች ግምገማዎች',
  noReviews: 'እስካሁን ግምገማ የለም። ደንበኞች ከእያንዳንዱ የተጠናቀቀ ጉብኝት በኋላ መስጠት ይችላሉ።', reviewBreakdown: 'ቴክኒክ {technique}/5 · ሙያዊነት {professionalism}/5',

  servicesTitle: 'አገልግሎቶች እና ዋጋ', popular: '★ ተወዳጅ', removeService: '{name} አስወግድ', durationLabel: 'የሚፈጀው ጊዜ', hoursValue: '{hours} ሰዓት',
  yourPrice: 'ዋጋዎ (ብር)', changePrice: 'ዋጋ ቀይር', changePriceAccessibility: 'የ{name} ዋጋ ቀይር', addNewService: '+ አዲስ አገልግሎት ጨምር',
  servicesInfo: 'ዋጋዎች ቁሳቁስዎን እና መሣሪያዎን ያካትታሉ። እዚህ ዋጋ ሲቀይሩ ደንበኞች ከቀጣዩ ቦታ ማስያዣቸው ጀምሮ ያዩታል። አስቀድሞ በተያዘ ቦታ ላይ ዋጋ በፍጹም አይቀየርም፤ ደንበኛ በጉብኝት ወቅት ተጨማሪ አገልግሎት ከወሰደ፣ ሲያጠናቅቁ መጠኑን ያክላሉ እና በመጨረሻ ክፍያቸው ላይ ይጨመራል።',
  newPriceBody: 'አዲስ ዋጋ በብር። አስቀድመው የያዙ ደንበኞች ያዩትን ዋጋ ይቀጥላሉ።', newPriceAccessibility: 'አዲስ ዋጋ በብር',
  priceInvalid: 'ከ50 እስከ 100,000 ሙሉ ቁጥር ያስገቡ።', savePrice: 'ዋጋ አስቀምጥ',
  removeServiceTitle: 'አገልግሎቱ ይወገድ?', removeServiceBody: '{name} ለአዲስ ቦታ ማስያዣዎች አይገኝም።', keepService: 'አገልግሎቱን አቆይ',

  zonesTitle: 'የመነሻ አካባቢዎች እና ጉዞ', workingHours: 'የሥራ ሰዓት', dayAvailability: 'የ{day} ዝግጁነት', zonesYouTravelTo: 'የሚጓዙባቸው አካባቢዎች',
  zonesIntro: 'ደንበኞች ቤታቸው በመረጧቸው ክፍለ ከተማዎች ውስጥ ከሆነ ብቻ ቦታ መያዝ ይችላሉ።',
  zonesSelectedNote: '{count} አካባቢዎች ተመርጠዋል። ከንቁ የጉዞ አካባቢዎችዎ ውጭ ያሉ ደንበኞች የቤት ጉብኝት መያዝ አይችሉም።',
  instantBooking: 'የፈጣን ቦታ ማስያዝ ምርጫዎች', sameDay: 'የዕለቱን ቦታ ማስያዝ ተቀበል', sameDayHelp: 'ከመድረስ በፊት ቢያንስ የ3 ሰዓት ማሳወቂያ ያስፈልጋል።',
  bookingPreference: 'የቦታ ማስያዝ ምርጫ', alwaysBookable: 'የዝግጁነት መቀየሪያዎ በርቶ እስካለ ድረስ ደንበኞች በማንኛውም ሰዓት ሊይዙዎት ይችላሉ።',

  documentsTitle: 'የማረጋገጫ ሰነዶች',
  documentsBanner: 'የማንነት ማስረጃ ግላዊ ሆኖ ይቆያል እና በተፈቀደላቸው የKonjo ኦፕሬሽን ሠራተኞች ብቻ ይገመገማል።',
  idFront: 'የብሔራዊ መታወቂያ ፊት', idBack: 'የብሔራዊ መታወቂያ ጀርባ', diplomas: 'ዲፕሎማ / ሰርተፊኬቶች',
  docApproved: 'ጸድቋል', docInReview: 'በግምገማ ላይ', docAdded: 'ተጨምሯል', docRequiredOnboarding: 'ለምዝገባ ያስፈልጋል', docRejected: 'ውድቅ ተደርጓል', docRequired: 'ያስፈልጋል', docPending: 'በመጠባበቅ ላይ',
  uploaded: '{date} ተሰቅሏል', chooseDocument: 'ሰነድ ይምረጡ…', uploadingSecurely: 'በደህንነት በመስቀል ላይ…', uploadCertificate: '+ ዲፕሎማ / ሰርተፊኬት ስቀል',
  deleteDocTitle: 'ሰነዱ ይጥፋ?', deleteDocBody: 'ይህ ግላዊ ፋይሉን እና የግምገማ መዝገቡን ያስወግዳል።', deleteFile: '{name} አጥፋ', certificateFallback: 'ሰርተፊኬት',
  documentsPrivacy: 'የከፍተኛ ትምህርት ሰርተፊኬትዎ ለምዝገባ ያስፈልጋል። የጥፍር፣ የፀጉር አስተካካይ፣ የማሳጅ ወይም ሌሎች የኮርስ ሰርተፊኬቶችንም ማከል ይችላሉ። የማንነት ምስሎች ለውስጥ ግምገማ ብቻ ይውላሉ።',

  payoutTitle: 'የክፍያ ሂሳብ', payoutMethodEyebrow: 'የክፍያ ዘዴ', notSetYet: 'እስካሁን አልተቀመጠም',
  payoutDescription: 'ደንበኞች ለKonjo ይከፍላሉ፤ እያንዳንዱ ጉብኝት ከተጠናቀቀ በኋላ የKonjo ቡድን ገቢዎን እዚህ ይልካል። የመድረኩ ኮሚሽን አስቀድሞ ተቀንሷል።',
  changePayout: 'የክፍያ ዘዴ ቀይር', addPayout: 'የክፍያ ዘዴ ጨምር', payoutHistoryEyebrow: 'የክፍያ ታሪክ',

  helpTitle: 'እገዛ እና ድጋፍ', emergencyTitle: 'በጉብኝት ወቅት አደጋ ሲያጋጥም',
  emergencyText: 'በሥራ ገጹ ላይ ያለውን የSOS ቁልፍ ይጠቀሙ፤ የKonjo ድጋፍን ከቀጥታ አካባቢዎ ጋር ያስጠነቅቃል። ለአፋጣኝ አደጋ መጀመሪያ ፖሊስ ይደውሉ።',
  callSupport: 'ለድጋፍ ይደውሉ · {phone}', emailSupport: 'ለድጋፍ ኢሜይል · {email}', reportSafety: 'የደህንነት ችግር ሪፖርት አድርግ', faqEyebrow: 'ተደጋጋሚ ጥያቄዎች',
  faq1Q: 'ሳምንታዊ ክፍያዎች መቼ እና እንዴት ይላካሉ?',
  faq1A: 'Konjo የተጠናቀቁ ጉብኝቶችዎን በመገለጫዎ ወዳለው የክፍያ ሂሳብ ይከፍላል፤ ብዙውን ጊዜ ደንበኛው የመጨረሻ ክፍያ ከፈጸመ በአንድ ሳምንት ውስጥ። እያንዳንዱ ክፍያ በገቢ ውስጥ ከማጣቀሻ ጋር ይታያል።',
  faq2Q: 'ደንበኛ በመጨረሻ ደቂቃ ቢሰርዝ ምን ይሆናል?',
  faq2A: 'ደንበኛው ከተነሱ በኋላ ከሰረዘ የመጓጓዣ ክፍያዎ ለእርስዎ ይቀራል። ከዚያ በፊት የሚደረጉ ስረዛዎች ለደንበኛው ሙሉ ተመላሽ ያደርጋሉ እና ጉብኝቱ ከዝርዝርዎ ይጠፋል።',
  faq3Q: 'አዲስ አካባቢ ወይም አገልግሎት እንዴት እጨምራለሁ?',
  faq3A: 'መገለጫን ከዚያም አገልግሎቶች እና ዋጋ ወይም የመነሻ አካባቢዎች እና ጉዞን ይክፈቱ። ለውጦች ወዲያውኑ ለአዳዲስ ቦታ ማስያዣዎች ይተገበራሉ።',
  safetyEmailSubject: 'ከKonjo ባለሙያ የደህንነት ችግር ሪፖርት', safetyEmailBody: 'ምን እንደተከሰተ፣ መቼ እና የትኛው ቦታ ማስያዣ እንደሆነ ይግለጹ፡\n',
  supportEmailSubject: 'ከKonjo ባለሙያ የድጋፍ ጥያቄ',

  editProfileTitle: 'መገለጫ አርትዕ', editAfterApproval: 'ማመልከቻዎ ከጸደቀ በኋላ መገለጫዎን ማርትዕ ይችላሉ።',
  specialtyLocked: 'የጸደቀው ሙያዎ በKonjo ድጋፍ ብቻ ሊቀየር ይችላል።', aboutYou: 'ስለ እርስዎ', displayName: 'የባለሙያ መጠሪያ ስም', emailOptional: 'ኢሜይል (አማራጭ)',
  introduction: 'መግቢያ', yearsExperience: 'የሙያ ልምድ በዓመት', educationLevel: 'ከፍተኛው የትምህርት ደረጃ', gender: 'ጾታ',
  genderHelp: 'ደንበኞች የሚመቻቸውን ባለሙያ እንዲያጣሩ እና እንዲመርጡ በይፋ መገለጫዎ ላይ ይታያል።',
  genderFemale: 'ሴት', genderMale: 'ወንድ', genderUnspecified: 'መናገር አልፈልግም', howPaid: 'Konjo እንዴት ይክፈልዎት',
  payoutHelp: 'ደንበኞች ለKonjo ይከፍላሉ። እያንዳንዱ ጉብኝት ከተጠናቀቀ በኋላ የKonjo ቡድን ገቢዎን እዚህ ይልካል።',
  telebirr: 'ቴሌብር', cbeBirr: 'ሲቢኢ ብር', bankAccount: 'የባንክ ሂሳብ', accountHolder: 'የሂሳብ ባለቤት ስም', bankName: 'የባንክ ስም', accountNumber: 'የሂሳብ ቁጥር', mobileNumber: 'የሞባይል ቁጥር',
  languagesYouSpeak: 'የሚናገሯቸው ቋንቋዎች', baseLocation: 'መነሻ አካባቢ', baseLocationHint: 'የሚገኙበት ቦታ። ደንበኞች በመገለጫዎ ላይ ያዩታል።',
  workingDaysHours: 'የሥራ ቀናት እና ሰዓት', workingHint: 'ለመቀየር የመጀመሪያ ወይም የመጨረሻ ሰዓቱን ይንኩ።', startTime: 'የ{day} መጀመሪያ ሰዓት', endTime: 'የ{day} መጨረሻ ሰዓት', dayOff: 'የዕረፍት ቀን',
  sameDayNotice: 'ቢያንስ የ3 ሰዓት ማሳወቂያ ያስፈልጋል።', zonesHint: 'ደንበኞች ከእነዚህ አካባቢዎች በአንዱ የሚኖሩ ከሆነ ብቻ ሊይዙዎት ይችላሉ።',
  servicesPrices: 'አገልግሎቶች እና ዋጋዎች', servicesStay: 'ሁሉም አገልግሎቶች በ{specialty} ውስጥ ይቆያሉ።', serviceName: 'የአገልግሎት ስም', shorter: 'አሳጥር', longer: 'አራዝም',
  minutesValue: '{minutes} ደቂቃ', priceEtb: 'ዋጋ (ብር)', includedPlaceholder: 'የተካተተው ነገር (አማራጭ)', addAnotherService: '+ ሌላ የ{specialty} አገልግሎት ጨምር',
  saveChanges: 'ለውጦችን አስቀምጥ', saveFailed: 'ለውጦችዎ ሊቀመጡ አልቻሉም።',
  vDisplayName: 'ቢያንስ 2 ፊደላት ያለው መጠሪያ ስም ያስገቡ።', vEmail: 'ትክክለኛ ኢሜይል ያስገቡ ወይም ባዶ ይተዉት።', vBio: 'መግቢያዎ ቢያንስ 30 ፊደላት ያስፈልገዋል።',
  vYears: 'የሙያ ልምድ ከ0 እስከ 60 መሆን አለበት።', vEducation: 'ከፍተኛውን የትምህርት ደረጃዎን ይምረጡ።', vGender: 'ጾታዎን ይምረጡ ወይም «መናገር አልፈልግም»።',
  vPayout: 'Konjo እንዴት እንደሚከፍልዎ ይምረጡ እና የሂሳብ ዝርዝሮቹን ይሙሉ።', vLanguages: 'ቢያንስ አንድ ቋንቋ ይምረጡ።', vBaseZone: 'መነሻ አካባቢዎን ይምረጡ።',
  vWorkingDay: 'ቢያንስ አንድ የሥራ ቀን ያብሩ።', vTravelZone: 'ቢያንስ አንድ የጉዞ አካባቢ ይምረጡ።', vService: 'ቢያንስ አንድ አገልግሎት ያቆዩ።', vServiceFields: 'እያንዳንዱ አገልግሎት ስም እና ዋጋ ያስፈልገዋል።',

  languageSaveFailed: 'ቋንቋዎ ሊቀመጥ አልቻለም። ግንኙነትዎን ያረጋግጡ እና እንደገና ይሞክሩ።',
};

const oromo: ProfessionalCopy = {
  tabHome: 'Mana', tabCalendar: 'Kaalandarii', tabEarnings: 'Galii', tabProfile: 'Piroofaayilii',
  goBack: 'Duubatti deebi’i', back: 'Duubatti', cancel: 'Haqi', keep: 'Tursi', delete: 'Balleessi', dismiss: 'Cufi', remove: 'Balleessi', view: 'Ilaali', you: 'Isin',
  retry: 'Irra deebi’ii yaali', signOut: 'Ba’i', professionalFallbackName: 'Ogeessa',
  loadError: 'Herrega ogummaa keessanii fe’uu hin dandeenye. Iyyannoo olkaa’ameen itti fufuuf irra deebi’aa yaalaa.',
  today: 'Har’a', yesterday: 'Kaleessa', daysAgo: 'Guyyaa {days} dura', weekAgo: 'Torban 1 dura', weeksAgo: 'Torban {weeks} dura',
  visitOne: 'daawwannaa', visitMany: 'daawwannaawwan',

  brandTagline: 'ATELIER FI MANA', notifications: 'Beeksisa', availableBadge: 'QOPHII', offlineBadge: 'SARARAAN ALA', availableForBookings: 'Beellamaaf qophii',
  noActiveRequests: 'Amma gaaffiin jiru hin jiru. Beellamni haaraan asitti mul’ata.',
  metricThisWeek: 'Torban kana', metricCompleted: 'Xumuraman', metricRating: 'Madaallii', metricRatingOne: 'Madaallii · yaada 1', metricRatingMany: 'Madaallii · yaada {count}', ratingNew: 'Haaraa',
  upcomingBookings: 'Beellama dhufu', calendarLink: 'Kaalandarii', recentVisits: 'Daawwannaa dhiyoo', last30Days: 'Guyyoota 30 darban',
  identityReviewed: 'Ogeessa eenyummaan isaa mirkanaa’e.', zonesActiveIn: ' Naannoowwan imalaa {zones} keessatti hojii irra jiru.', addisAbaba: 'Finfinnee',

  statusNewRequest: 'Gaaffii haaraa', statusConfirmed: 'Mirkanaa’eera', statusOnTheWay: 'Karaa irra', statusInProgress: 'Hojii irra',
  decline: 'Didi', accept: 'Fudhadhu', confirmAccept: 'Fudhachuu mirkaneessi',
  onMyWayUnlocks: '«Karaa irran jira» {time} banama', awaitingDeposit: 'Kaffaltii duraa 50% eegaa jira', finishOtherVisit: 'Dura daawwannaa {name} waliin xumuraa',
  onMyWay: 'Karaa irran jira', startWork: 'Hojii jalqabi', arrived: 'Ga’eera', checkOut: 'Xumuri',
  startWorkTimer: 'Hojii jalqabi — sa’aatii lakkaa’aa jalqabsiisi', checkOutRequest: 'Xumuri — kaffaltii dhumaa gaafadhu',
  travelFeeLabel: 'Kaffaltii imalaa (0–{cap} Birr):', travelFeeAccessibility: 'Kaffaltii imalaa Birriin',
  travelFeeNone: 'Kaffaltiin imalaa hin jiru. Maamilli gatii tajaajilaa qofa kaffala.',
  travelFeeAdded: 'ETB {fee} waliigala maamilaa irratti dabalama. Hanga isin ka’tanitti bilisaan haquu danda’u.',
  travelFeeInvalid: 'Lakkoofsa guutuu 0 hanga {cap} Birr galchaa. Daangaa kana Konjo kaa’a.',
  checkoutQuestion: '{name} tajaajila dabalataa fudhatee jiraa?', extrasLabel: 'Tajaajila dabalataa (Birr, filannoo):', extrasAccessibility: 'Hanga tajaajila dabalataa Birriin',
  extrasNoteAccessibility: 'Tajaajilli dabalataa maal ture', extrasNotePlaceholder: 'Waan dabalame, fkn. sarara shuruubaa lama dabalataa',
  extrasInvalid: 'Lakkoofsa guutuu hanga Birr 100,000 galchaa ykn duwwaa dhiisaa.',
  extrasNone: 'Dabalataan hin jiru. Maamilli hafaa ETB {amount} kaffala.',
  extrasAdded: 'ETB {amount} fi kaffaltii tajaajilaa Konjo ETB {fee} kaffaltii dhumaa maamilaa irratti dabalama, waliigala ETB {total}. Isin ETB {amount} guutuu fudhattu.',
  travelSuffix: ' · +ETB {fee} imala', extrasSuffix: ' · +ETB {amount} dabalataa',

  rescheduleTitle: 'Yeroon haaraan gaafatameera', rescheduleBody: '{name} daawwannaa kana gara {when} jijjiiruu gaafateera. Hanga deebii kennitanitti beellamni yeroo ammaa eega.',
  approveReschedule: 'Yeroo haaraa fudhadhu', declineReschedule: 'Yeroo ammaa tursi',
  cancelled: 'Haqameera', completed: 'Xumurameera', paid: 'Kaffalameera', awaitingPayment: 'Kaffaltii eegaa jira', paidInCash: 'Maallaqa harkaan kaffalame', paymentPending: 'Kaffaltiin eegamaa jira',
  paidInFull: 'Guutummaatti kaffalame · ETB {amount}', awaitingFinalPayment: 'Kaffaltii dhumaa eegaa jira · ETB {amount} hafa',
  eyebrowCancelled: 'HAQAME', eyebrowDone: 'XUMURAME', eyebrowStarts: 'JALQABA',
  badgeAwaitingReply: 'Deebii eegaa jira', badgeOnTheWay: 'Karaa irra', badgeInProgress: 'Hojii irra', badgeConfirmed: 'Mirkanaa’eera',

  calendarTitle: 'Kaalandarii', nothingScheduled: 'Hanga ammaatti wanti qabame hin jiru.',

  earningsTitle: 'Galii', thisWeekEyebrow: 'TORBAN KANA', payoutProcessing: 'Kaffaltiin adeemsa irra jira', payoutsGoTo: 'Kaffaltiin kan ergamu gara',
  addPayoutInProfile: 'Piroofaayilii keessan keessatti mala kaffaltii dabalaa',
  commissionNote: 'Maamiltoonni Konjo’f kaffalu. Daawwannaan tokko tokko erga xumuramee booda, gareen Konjo galii keessan qulqulluu gara mala kaffaltii armaan olii erga. Komishiniin waltajjii duraan hir’ifameera.',
  payoutHistory: 'Seenaa kaffaltii', loadingPayouts: 'Kaffaltiiwwan fe’amaa jiru…',
  noPayouts: 'Hanga ammaatti kaffaltiin hin jiru. Konjo kaffaltii qopheessinaan daawwannaawwan xumuraman asitti mul’atu.',
  payoutPaid: 'Kaffalameera', payoutRef: ' · wabii {reference}', payoutQueued: 'Konjo’n adeemsifamaa jira', payoutFailed: 'Kaffaltiin hin milkoofne · deeggarsa quunnamaa',

  finishedAt: '{when} xumurame', bookingCancelled: 'Beellamni haqameera', paymentComplete: 'Kaffaltiin xumurameera', finalPaymentOutstanding: 'Kaffaltiin dhumaa hafeera',
  depositBalanceLine: 'Kaffaltii duraa: ETB {deposit} {depositMark} · Hafaa: ETB {balance} {balanceMark}', unpaidMark: '(hin kaffalamne)', pendingMark: '(eegamaa jira)',
  balanceNote: 'Maamilli hafaa fuula beellama isaa irraa kaffala. Yeroo ga’u battalumatti isinitti himama, kaffaltii keessan itti aanu irratti dabalama.',

  jobDetails: 'Bal’ina hojii', loadingBookings: 'Beellamoota keessan fe’amaa jiru…',
  bookingNotInList: 'Beellamni kun tarree keessan keessa hin jiru. Beellamni guyyaa 30 ol ta’e Galii keessatti kaa’ama.', noActiveJob: 'Hojiin mul’atu hin jiru.',
  navigate: 'Qajeelfama', navigateLeft: ' · {distance} hafa', navigateWritten: 'Gara teessoo barreeffameetti qajeeli',
  noPinNote: 'Maamilli teessoo isaa kaartaa irratti hin kaa’ne, kanaaf qajeelfamni teessoo barreeffame barbaada. Dogoggora yoo fakkaate isaan waliin mirkaneessaa.',
  sharingOn: 'Bakka keessan kallattiin maamilaaf qoodaa jirtu. «Ga’eera» yoo tuqtan ofumaan dhaabbata.',
  sharingOff: 'Qoodinsi bakkaa cufaadha. Maamilli dhufaatii keessan akka hordofuuf hayyama bakkaa kennaa.',
  sharingStopped: 'Yeroo geessan qoodinsi bakkaa dhaabbateera.', sessionTimer: 'Sa’aatiin lakkaa’aan hojii deemaa jira',
  paidRemaining: 'Kaffalame: ETB {paid} · Hafaa: ETB {remaining}', noShowButton: 'Maamilli as hin jiru · dhabamuu galmeessi', sosButton: 'SOS · Deeggarsa Konjo beeksisi',
  sosTitle: 'Akeekkachiisa SOS ergaa?', sosBody: 'Hojii Konjo fi maamilli beeksifamu. Hayyamni yoo kenname bakki keessan ammaa itti dabalama.',
  sosSend: 'SOS ergi', sosSentTitle: 'SOS ergameera', sosSentWithLocation: 'Akeekkachiisni fi bakki keessan qoodameera.', sosSentNoLocation: 'Akeekkachiisni bakka malee ergameera.',
  sosFailedTitle: 'SOS hin ergamne', sosFailedBody: 'Balaa hatattamaa keessa yoo jiraattan tajaajila balaa naannoo bilbilaa.',
  noShowTitle: 'Dhabamuu maamilaa galmeessuu?',
  noShowBody: 'Kun daawwannaa haqa. Kaffaltiin imalaa fi komishiniin tajaajilaa {rate}% imaammata Konjo’tiin ni hafu; hangi duraan kaffalame hafe ni deebi’a.',
  keepBooking: 'Beellama tursi', recordNoShow: 'Dhabamuu galmeessi',

  profileTitle: 'Piroofaayilii', profileAccessibility: 'Piroofaayilii {name}', newProfessional: 'Ogeessa haaraa · Yaadni hin jiru', zonesPrefix: 'Naannoowwan: {zones}', notSelected: 'Hin filatamne',
  jobsDone: 'Hojii raawwataman', experience: 'Muuxannoo', yearsShort: 'waggaa {years}', repeats: 'Irra deebi’an', onTime: 'Yeroon',
  editProfileRow: 'Piroofaayilii, sa’aatii fi bakka gulaali', servicesRow: 'Tajaajiloota fi gatii', portfolioRow: 'Suuraa hojii', identityRow: 'Gamaaggama eenyummaa',
  zonesRow: 'Naannoo ka’umsaa fi imala', payoutRow: 'Herrega kaffaltii', languageRow: 'Language / ቋንቋ / Afaan', helpRow: 'Gargaarsa fi deeggarsa',
  logOut: 'Ba’i', deleteAccount: 'Herrega koo balleessi', version: 'Konjo Pro v1.0 · Finfinnee',
  statusApproved: 'Mirkanaa’eera', statusPending: 'Gamaaggama irra', statusChangesRequested: 'Jijjiiramni gaafatameera', statusRejected: 'Kufeera', statusSuspended: 'Dhaabbateera',
  deleteTitle: 'Herrega Konjo Pro keessan balleessuu?',
  deleteBody: 'Piroofaayiliin, sanadoonni, suuraaleen hojii fi odeeffannoon kaffaltii keessan ni haqamu, ni baatu. Beellamni xumurame herregaaf galmee Konjo keessatti hafa. Kun duubatti hin deebi’u.',
  keepAccount: 'Herrega tursi', deleteConfirm: 'Herrega balleessi', deleteFailedTitle: 'Herregni hin balleeffamne', deleteFailedBody: 'Irra deebi’aa yaalaa ykn deeggarsaaf imeelii ergaa.',

  ratingsTitle: 'Yaada fi madaallii maamiltootaa', basedOnOne: 'Daawwannaa manaa mirkanaa’e 1 irratti hundaa’e', basedOnMany: 'Daawwannaa manaa mirkanaa’an {count} irratti hundaa’e',
  ratingAppears: 'Madaalliin keessan daawwannaan xumurame jalqabaa erga gamaaggamamee booda mul’ata.', overallScore: 'QABXII WALIIGALAA', verifiedOnly: 'Maamiltoota mirkanaa’an qofa',
  techniqueResults: 'Ogummaa fi bu’aa', professionalismPunctuality: 'Ogummaa fi yeroo eeguu', clientReviews: 'YAADA MAAMILTOOTAA',
  noReviews: 'Hanga ammaatti yaadni hin jiru. Maamiltoonni daawwannaa xumurame tokko tokko booda kennuu danda’u.', reviewBreakdown: 'Ogummaa {technique}/5 · Ogummaa hojii {professionalism}/5',

  servicesTitle: 'Tajaajiloota fi gatii', popular: '★ Jaallatamaa', removeService: '{name} balleessi', durationLabel: 'YEROO FUDHATU', hoursValue: 'sa’aatii {hours}',
  yourPrice: 'GATII KEESSAN (BIRR)', changePrice: 'Gatii jijjiiri', changePriceAccessibility: 'Gatii {name} jijjiiri', addNewService: '+ Tajaajila haaraa dabali',
  servicesInfo: 'Gatiin meeshaalee fi qodaa keessan dabalata. Asitti gatii yoo jijjiirtan maamiltoonni beellama isaanii itti aanu irraa eegalee argu. Beellama duraan qabame irratti gatiin gonkumaa hin jijjiiramu; maamilli yeroo daawwannaa tajaajila dabalataa yoo fudhate, yeroo xumurtan hanga dabaltu, kaffaltii dhumaa isaa irratti dabalama.',
  newPriceBody: 'Gatii haaraa Birriin. Maamiltoonni duraan qabatan gatii argan itti fufu.', newPriceAccessibility: 'Gatii haaraa Birriin',
  priceInvalid: 'Lakkoofsa guutuu 50 hanga 100,000 galchaa.', savePrice: 'Gatii olkaa’i',
  removeServiceTitle: 'Tajaajila balleessuu?', removeServiceBody: '{name} beellama haaraaf hin argamu.', keepService: 'Tajaajila tursi',

  zonesTitle: 'Naannoo ka’umsaa fi imala', workingHours: 'SA’AATII HOJII', dayAvailability: 'Qophii {day}', zonesYouTravelTo: 'NAANNOOWWAN ITTI DEEMTAN',
  zonesIntro: 'Maamiltoonni manni isaanii kutaa magaalaa filattan keessa yoo jiraate qofa beellama gaafachuu danda’u.',
  zonesSelectedNote: 'Naannoowwan {count} filatamaniiru. Maamiltoonni naannoo imalaa keessan alaa daawwannaa manaa qabachuu hin danda’an.',
  instantBooking: 'FILANNOO BEELLAMA HATATTAMAA', sameDay: 'Beellama guyyaa sanatti fudhadhu', sameDayHelp: 'Ga’uu dura yoo xiqqaate beeksisa sa’aatii 3 barbaada.',
  bookingPreference: 'FILANNOO BEELLAMAA', alwaysBookable: 'Hanga qabduun qophii keessan banaa jirutti maamiltoonni sa’aatii kamittuu isin qabachuu danda’u.',

  documentsTitle: 'Sanadoota mirkaneessaa',
  documentsBanner: 'Ragaan eenyummaa dhuunfaa ta’ee hafa, hojjettoota Konjo hayyamamaniin qofa gamaaggamama.',
  idFront: 'Waraqaa eenyummaa biyyaalessaa fuuldura', idBack: 'Waraqaa eenyummaa biyyaalessaa duuba', diplomas: 'Dippiloomaa / ragaalee',
  docApproved: 'Mirkanaa’eera', docInReview: 'Gamaaggama irra', docAdded: 'Dabalameera', docRequiredOnboarding: 'Galmeef barbaachisa', docRejected: 'Kufeera', docRequired: 'Barbaachisa', docPending: 'Eegamaa jira',
  uploaded: '{date} fe’ame', chooseDocument: 'Sanada filadhaa…', uploadingSecurely: 'Nageenyaan fe’amaa jira…', uploadCertificate: '+ Dippiloomaa / ragaa fe’i',
  deleteDocTitle: 'Sanada balleessuu?', deleteDocBody: 'Kun faayilii dhuunfaa fi galmee gamaaggamaa isaa haqa.', deleteFile: '{name} balleessi', certificateFallback: 'Ragaa',
  documentsPrivacy: 'Ragaan barnoota olaanaa keessanii galmeef barbaachisa. Ragaalee leenjii qeensaa, rifeensa muruu, maasaajii ykn kan biroo dabaluu dandeessu. Suuraaleen eenyummaa gamaaggama keessoo qofaaf fayyadamu.',

  payoutTitle: 'Herrega kaffaltii', payoutMethodEyebrow: 'MALA KAFFALTII', notSetYet: 'Hanga ammaatti hin kaa’amne',
  payoutDescription: 'Maamiltoonni Konjo’f kaffalu; daawwannaan tokko tokko erga xumuramee booda gareen Konjo galii keessan asitti erga. Komishiniin waltajjii duraan hir’ifameera.',
  changePayout: 'Mala kaffaltii jijjiiri', addPayout: 'Mala kaffaltii dabali', payoutHistoryEyebrow: 'SEENAA KAFFALTII',

  helpTitle: 'Gargaarsa fi deeggarsa', emergencyTitle: 'Yeroo daawwannaa balaa hatattamaa yoo uumame',
  emergencyText: 'Qabduu SOS fuula hojii irraa fayyadamaa: deeggarsa Konjo bakka keessan kallattii waliin beeksisa. Balaa hatattamaaf dura poolisii bilbilaa.',
  callSupport: 'Deeggarsa bilbili · {phone}', emailSupport: 'Deeggarsaaf imeelii · {email}', reportSafety: 'Rakkoo nageenyaa gabaasi', faqEyebrow: 'GAAFFII YEROO BAAY’EE',
  faq1Q: 'Kaffaltiin torbanii yoom fi akkamitti ergama?',
  faq1A: 'Konjo daawwannaa xumurtan gara herrega kaffaltii piroofaayilii keessan irra jiruutti kaffala, yeroo baay’ee kaffaltii dhumaa maamilaa booda torban tokko keessatti. Kaffaltiin tokko tokko Galii keessatti wabii waliin mul’ata.',
  faq2Q: 'Maamilli yeroo dhumaa yoo haqe maaltu ta’a?',
  faq2A: 'Maamilli erga isin ka’tanii booda yoo haqe, kaffaltiin imalaa keessan isiniif hafa. Haqamni sanaan dura maamilaaf guutummaatti deebi’a, daawwannaan tarree keessan irraa bada.',
  faq3Q: 'Naannoo ykn tajaajila haaraa akkamittin dabala?',
  faq3A: 'Piroofaayilii banaa, achiis Tajaajiloota fi gatii ykn Naannoo ka’umsaa fi imala. Jijjiiramni beellama haaraaf battalumatti hojii irra oola.',
  safetyEmailSubject: 'Gabaasa rakkoo nageenyaa ogeessa Konjo irraa', safetyEmailBody: 'Maaltu akka ta’e, yoom, fi beellama kam akka ta’e ibsaa:\n',
  supportEmailSubject: 'Gaaffii deeggarsaa ogeessa Konjo irraa',

  editProfileTitle: 'Piroofaayilii gulaali', editAfterApproval: 'Iyyannoon keessan erga mirkanaa’ee booda piroofaayilii keessan gulaaluu dandeessu.',
  specialtyLocked: 'Ogummaan keessan mirkanaa’e deeggarsa Konjo qofaan jijjiiramuu danda’a.', aboutYou: 'WAA’EE KEESSAN', displayName: 'Maqaa ogummaa', emailOptional: 'Imeelii (filannoo)',
  introduction: 'Seensa', yearsExperience: 'Waggaa muuxannoo ogummaa', educationLevel: 'Sadarkaa barnootaa olaanaa', gender: 'Saala',
  genderHelp: 'Maamiltoonni ogeessa isaaniif mijatu akka calalanii filataniif piroofaayilii ifaa keessan irratti mul’ata.',
  genderFemale: 'Dubartii', genderMale: 'Dhiira', genderUnspecified: 'Himuu hin barbaadu', howPaid: 'Konjo akkamitti isin kaffala',
  payoutHelp: 'Maamiltoonni Konjo’f kaffalu. Daawwannaan tokko tokko erga xumuramee booda gareen Konjo galii keessan asitti erga.',
  telebirr: 'Telebirr', cbeBirr: 'CBE Birr', bankAccount: 'Herrega baankii', accountHolder: 'Maqaa abbaa herregaa', bankName: 'Maqaa baankii', accountNumber: 'Lakkoofsa herregaa', mobileNumber: 'Lakkoofsa bilbilaa',
  languagesYouSpeak: 'Afaanota dubbattan', baseLocation: 'BAKKA KA’UMSAA', baseLocationHint: 'Bakka jiraattan. Maamiltoonni piroofaayilii keessan irratti argu.',
  workingDaysHours: 'GUYYOOTA FI SA’AATII HOJII', workingHint: 'Jijjiiruuf sa’aatii jalqabaa ykn dhumaa tuqaa.', startTime: 'Sa’aatii jalqabaa {day}', endTime: 'Sa’aatii dhumaa {day}', dayOff: 'Guyyaa boqonnaa',
  sameDayNotice: 'Yoo xiqqaate beeksisa sa’aatii 3 barbaada.', zonesHint: 'Maamiltoonni naannoowwan kana keessaa tokko keessa yoo jiraatan qofa isin qabachuu danda’u.',
  servicesPrices: 'TAJAAJILOOTA FI GATII', servicesStay: 'Tajaajiloonni hundi {specialty} keessatti hafu.', serviceName: 'Maqaa tajaajilaa', shorter: 'Gabaabsi', longer: 'Dheeressi',
  minutesValue: 'daqiiqaa {minutes}', priceEtb: 'Gatii (Birr)', includedPlaceholder: 'Waan keessatti dabalamu (filannoo)', addAnotherService: '+ Tajaajila {specialty} biraa dabali',
  saveChanges: 'Jijjiirama olkaa’i', saveFailed: 'Jijjiiramni keessan olkaa’amuu hin dandeenye.',
  vDisplayName: 'Maqaa ogummaa yoo xiqqaate qubee 2 qabu galchaa.', vEmail: 'Imeelii sirrii galchaa ykn duwwaa dhiisaa.', vBio: 'Seensi keessan yoo xiqqaate qubee 30 barbaada.',
  vYears: 'Waggaan muuxannoo 0 hanga 60 ta’uu qaba.', vEducation: 'Sadarkaa barnootaa olaanaa keessan filadhaa.', vGender: 'Saala keessan filadhaa ykn «Himuu hin barbaadu».',
  vPayout: 'Konjo akkamitti akka isin kaffalu filadhaa, odeeffannoo herregaa guutaa.', vLanguages: 'Yoo xiqqaate afaan tokko filadhaa.', vBaseZone: 'Bakka ka’umsaa keessan filadhaa.',
  vWorkingDay: 'Yoo xiqqaate guyyaa hojii tokko banaa.', vTravelZone: 'Yoo xiqqaate naannoo imalaa tokko filadhaa.', vService: 'Yoo xiqqaate tajaajila tokko tursaa.', vServiceFields: 'Tajaajilli tokko tokko maqaa fi gatii barbaada.',

  languageSaveFailed: 'Afaan keessan olkaa’amuu hin dandeenye. Quunnamtii keessan mirkaneessaa, irra deebi’aa yaalaa.',
};

export const professionalCopy: Record<ProfessionalAppLanguage, ProfessionalCopy> = {
  en: english,
  am: amharic,
  om: oromo,
};

const dayNames: Record<ProfessionalAppLanguage, readonly string[]> = {
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  am: ['ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'ዓርብ', 'ቅዳሜ', 'እሑድ'],
  om: ['Wiixata', 'Kibxata', 'Roobii', 'Kamisa', 'Jimaata', 'Sanbata', 'Dilbata'],
};

const shortDayNames: Record<ProfessionalAppLanguage, readonly string[]> = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  am: ['ሰኞ', 'ማክ', 'ረቡ', 'ሐሙ', 'ዓር', 'ቅዳ', 'እሑ'],
  om: ['Wix', 'Kib', 'Roo', 'Kam', 'Jim', 'San', 'Dil'],
};

/** Working days are stored with English names; show them in the professional's language. */
export function localizedDayName(day: string, language: ProfessionalAppLanguage): string {
  const index = dayNames.en.indexOf(day);
  return index >= 0 ? dayNames[language][index] : day;
}

export function localizedShortDayNames(language: ProfessionalAppLanguage): readonly string[] {
  return shortDayNames[language];
}

/** Fills {name} placeholders; unknown placeholders are left as they are. */
export function fillProfessionalCopy(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}
