# Professional matching and onboarding gap audit

Date: 2026-09-20

## Implemented in this pass

- Professional onboarding now requires a highest education level.
- Spoken languages now carry an explicit proficiency: basic, conversational, fluent, or native.
- Supported client-facing languages were expanded to Amharic, Afaan Oromo, Tigrinya, Somali, English, Arabic, and French.
- Qualifications are persisted in SQLite and Supabase, returned to administrators, published in marketplace profiles, and shown to clients.
- English-language clients receive a language-fit ranking boost for fluent/native English professionals. Amharic clients receive the equivalent Amharic boost. This uses communication preference rather than an inferred nationality or an “expat” label.
- The female-only discovery filter now uses administrator-verified eligibility from the marketplace API instead of seeded fallback gender.
- Existing language-only records are preserved and backfilled as conversational so no existing professional disappears during migration.

## Highest-priority remaining gaps

| Priority | Gap | Evidence and impact | Recommended next change |
| --- | --- | --- | --- |
| P0 | International client authentication is not supported | The UI describes international phone numbers and diaspora use, but all phone entry and backend validation require Ethiopian `+251` numbers. An expat without a local SIM cannot create an account. | Add country-code-aware E.164 authentication, provider coverage checks, and email/passkey fallback. Keep professional onboarding restricted separately if operations requires Ethiopian numbers. |
| P0 | Client service language is inferred from app language | Ranking now uses the selected app language, but interface language and the language a client wants for an appointment are not always the same. | Add `preferredServiceLanguages` to client onboarding/profile and allow a per-booking override. Use that signal for ranking and reassignment. |
| P1 | Education is self-reported, not verified | A certificate document kind exists, but it is optional and is not linked to education, institution, specialty, license, issue date, or expiry. | Add structured qualifications and an administrator verification status. Require evidence only for regulated/high-risk services, and show “self-reported” versus “verified” honestly. |
| P1 | Distance and “nearest” sorting are placeholders | API professionals default to 99 km unless they match seeded records; validated coordinates and travel-time ordering are not available. | Complete geocoding, store consented service coordinates, and rank by travel-time/coverage rather than a static distance. |
| P1 | In-app chat is advertised but absent | Notification preferences include chat messages, but there is no conversation/message data model, route, or working client/professional chat surface. | Either implement booking-scoped, moderated chat with retention/reporting rules or remove the setting until it exists. |
| P1 | Public reviews expose aggregates, not review content | Marketplace summaries return rating and review count. API-backed profiles do not receive review text; only seeded fallback profiles have review lists. | Add paginated, moderation-aware professional review endpoints and localized empty/error states. |
| P1 | Availability lacks exceptions | Weekly working hours exist, but breaks, leave, blackout dates, temporary zone changes, and capacity buffers are not modeled. | Add date-specific exceptions and travel buffers before scaling bookings or reassignment. |
| P2 | Client localization is narrower than professional localization | Professional onboarding supports English, Amharic, and Afaan Oromo; the client experience supports only English and Amharic. | Add Afaan Oromo first, then translate only languages justified by customer demand and QA capacity. |
| P2 | Accessibility/device evidence is incomplete | Static checks pass, but the roadmap still calls out target-device typography, TalkBack, keyboard, slow-network, and low/mid-range Android testing. | Create a release matrix with retained screenshots/videos and blocking acceptance criteria. |
| P2 | Support is still a placeholder | The client settings screen explicitly says support is coming soon. | Add a real support channel, booking-linked issue intake, operating hours, and escalation ownership before launch. |

## External launch dependencies already identified

Payment provider certification, international/local SMS coverage, Expo push credentials, maps/geocoding, hosted scheduler, monitoring, backup/restore exercises, and production incident ownership remain external launch dependencies. They should stay visible in the launch gate but are separate from the product-data gaps above.

## Recommended sequence

1. Fix international authentication and capture explicit client service-language preferences.
2. Correct authoritative female-only discovery and complete coordinate-backed matching.
3. Link education/credentials to evidence and administrator verification.
4. Add availability exceptions and booking-scoped communication.
5. Finish review content, localization, accessibility, and support readiness.
