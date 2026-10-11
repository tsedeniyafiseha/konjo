# Remaining release audit — 9 October 2026

This audit covers the current repository, the deployed Supabase API, the live
website, EAS builds, TestFlight, Render, and Google Play Console. It is a
release decision record, not a guarantee of store approval.

## Decision

**The code is a release candidate; do not select it for final store review
until the final iOS build 8 and Android build 6 pass the physical-device test matrix.**
The website and mobile API now use the protected Supabase Edge API, payments
are intentionally cash-only for version 1. Android build 6 was produced from
release commit `f7b5e65`; corrected iOS build 8 was produced from `acb1a7a`.

## P0 — block submission

### 1. Website migration — completed

Read-only verification on 9 October 2026 confirmed that the deployed client
and professional forms call the current Supabase Edge API at
`/v1/public/contact` and `/v1/public/professional-applications`. The former
legacy Supabase browser client is no longer present in those bundles. Privacy,
Terms, and account-deletion links are live, and Universal Link/App Link
association files are served as JSON from `/.well-known/`.

No existing rows in the mobile Supabase project were deleted or rewritten.

### 2. Produce and test a current native release candidate — built

Build 2 produced a valid Android AAB, but its iOS build correctly failed after
Universal Links were added because the older provisioning profile did not yet
contain Associated Domains. The Apple capability was enabled and a new active
profile (`S75Q6J32JL`) was generated on 10 October 2026.

The final version `1.0.0` candidates finished successfully:

- Android build 6: `7b0b6603-9283-40a6-af23-309f5b2332c6`;
- iOS build 8: `1d95f927-a415-4bc1-978c-ddcbcd55cae6`.

The iOS archive was uploaded to App Store Connect through EAS submission
`f5584c29-078e-479e-9ad9-f6a0b976ab9f`. Build 7 failed Apple's upload
processing with error 90683 because `NSMotionUsageDescription` was missing;
build 8 restores it, its signed IPA was inspected before upload, and Apple
processing completed successfully. Both invited testers must install build 8
and complete the release test matrix. Earlier iOS builds 1 through 7 and Android
builds 1 through 5 are obsolete and must not be submitted for review.

### 3. Payment launch decision — completed for version 1

Production and preview are set to `cash_only`. The released client offers only
cash payment to the professional after the in-person service, and the API
rejects online-payment methods while this mode is active. Chapa's draft
classification was corrected to **Personal Services → Health And Beauty
Spas**, but merchant approval is no longer a version-1 submission dependency.

Do not enable `chapa_live` until merchant approval and the real provider flow
have passed success, failure, abandonment, duplicate callback, retry,
cancellation, refund, and payout testing.

Apple In-App Purchase, StoreKit, Google Play Billing, and Sign in with Apple
are **not** required for the current product:

- Konjo payments buy in-person services consumed outside the app, so Chapa is
  the correct payment category.
- Konjo uses its own email/password and phone/OTP authentication, not a
  third-party social login.

Re-audit those decisions if the app later sells digital features or adds
Google/Facebook login.

### 4. Complete background-location review evidence — code complete

Background location is a core professional-trip feature, but it is a sensitive
Google Play permission. Before upload:

- use the implemented prominent in-app disclosure immediately before the
  runtime request;
- keep its exact explanation that Konjo collects and shares precise active-trip
  location while the app is in the background or the phone is locked;
- record a short video showing the disclosure, consent and denial paths, the
  live-trip feature, and automatic stop behavior;
- complete Play Console's Location Permissions declaration; and
- keep the privacy policy and listing description consistent with the exact
  released behavior.

The implementation requests permission only after the disclosure and stops
sharing on arrival, booking end, sign-out, expiry, or authorization failure.
The remaining item is a real-device evidence video and the Play Console form.

### 5. Create and configure the Google Play developer account — app record created

The Individual/Personal developer account is active and Play Console reported
no developer-account policy issues on 11 October 2026. The permanent app record
was created as **Konjo: Beauty & Wellness**, app type **App**, price **Free**,
default language **English (United States)**, package
`com.tsedeniya.konjoclient`, Play app ID `4975048077116437921`.

The remaining Play Console setup tasks are the privacy policy, sign-in details,
ads declaration, content rating, target audience, Data safety, government-app,
financial-features and health declarations, category/contact details, Store
Listing, Play App Signing and the signed AAB upload. Upload Android build 6's
AAB—not the internal-distribution APK. Because this is a new personal account,
production access also requires a closed test with at least 12 continuously
opted-in testers for at least 14 days; the console currently reports 0 opted-in
testers.

## P1 — required store forms and evidence

- Apple App Privacy and Google Data Safety answers must match the final binary
  and providers: name, email, phone, physical address, precise/background
  location, identity and portfolio photos, user content/reviews/support,
  account/device/push identifiers, purchase history, selected payment method,
  and professional payout/earnings data.
- Google account deletion needs both the working in-app path and
  `https://konjoet.com/delete-account`; Apple needs the in-app deletion path.
- Supply stable client and professional reviewer accounts that do not require
  manual approval, a private phone, or a real charge.
- Upload real device screenshots from the final release build. Current design
  exports are not release evidence.
- Complete Google content rating, app access instructions, ads declaration (no
  ads), target audience (18+), EU trader status, and current agreements. Apple
  copyright, categories, listing copy, URLs, release strategy, and the
  least-restrictive accurate age questionnaire are now stored in
  `store.config.json`.
- Prove client signup, email confirmation, login, password reset, expired and
  reused recovery links, plus professional OTP signup, resend, invalid code,
  and expired code.
- Prove APNs/FCM closed-app delivery and cold-start navigation.
- Run a two-account booking: request, acceptance, cash-method confirmation,
  background travel, arrival, service completion, cash receipt, review,
  report/block, admin resolution, and account deletion.
- Monitor the support inbox and assign an owner for payment, safety, privacy,
  and account-deletion escalations.

## Automated scanner triage

The compliance guard reports three critical findings. Two are false positives
from archived design HTML: Apple external payment and Google Play Billing do
not apply to Konjo's physical services. The third—Google background location—is
real and remains blocking.

Other scanner findings were manually triaged:

- account deletion exists in-app and on the web;
- `SYSTEM_ALERT_WINDOW` and audio recording are removed from release builds;
- notification permission is requested at runtime and denial is handled;
- report, block, moderation, and administrative resolution exist;
- no advertising or analytics SDK was found in the release dependency list;
- verified Universal Links/App Links are configured in the app and live
  website association files; and
- R8 and resource shrinking are enabled for release builds using the official
  Expo SDK 57 build-properties plugin.

## Infrastructure status

- Production mobile API: Supabase Edge Function — live.
- Database, private Storage, Auth, Cron and Vault worker: Supabase — live.
- SMS Ethiopia signed Auth hook: deployed, but provider approval and
  real-device delivery evidence are still pending. Do not claim working SMS in
  review notes until a delivery is visible in both Supabase and SMS Ethiopia
  logs. Add a balance monitor and key-rotation reminder after approval.
- Resend SMTP/domain: configured and verified. Recent confirmation and password
  reset messages show as delivered; release-device link completion still needs
  evidence.
- Render: removed on 9 October 2026. The `konjo-preview` Blueprint was
  disconnected first, then `konjo-api-preview` was permanently deleted.
  Workspace search confirms there are no matching Konjo Render resources.

## Release order

1. ~~Replace the legacy website data path.~~ Completed 9 October 2026; the
   deployed forms now use the protected Supabase Edge endpoints.
2. ~~Remove Render after disconnecting its Blueprint.~~ Completed 9 October
   2026.
3. ~~Choose a review-safe payment mode.~~ Cash-only completed for version 1.
4. ~~Create the Google Play Personal account and app record.~~ Completed
   11 October 2026. Finish the Play setup forms and start the required
   12-tester/14-day closed test.
5. Record the background-location evidence video and complete its declaration.
6. ~~Create the final iOS and Android candidates.~~ Completed 11 October 2026;
   corrected iOS build 8 was uploaded to App Store Connect the same day and the
   signed Android build 6 AAB is ready for Play Console.
7. ~~Provision stable Apple reviewer access and review notes.~~ Completed
   11 October 2026; App Store Connect has the stable client account, Kiki's
   approved professional account and the reviewer contact. Complete the
   physical-device/two-account testing.
8. Finish Apple App Privacy, both stores' remaining declarations, screenshots,
   Google app access and review evidence.
9. Submit the exact build that passed the release test matrix.

