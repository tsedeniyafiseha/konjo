# Remaining release audit — 9 October 2026

This audit covers the current repository, the deployed Supabase API, the live
website, EAS builds, TestFlight, Render, and Google Play Console. It is a
release decision record, not a guarantee of store approval.

## Decision

**Do not submit the current build to Apple App Review or Google Play review.**
The mobile source is substantially closer to release, but the public website
has an active privacy/security defect and the only TestFlight build predates
the production migration.

## P0 — block submission

### 1. Secure or disable the legacy website registration system

The live `konjoet.com` site is not built from this repository's `website/`
directory. Its compiled JavaScript connects directly to a separate, legacy
Supabase project.

Read-only verification on 9 October 2026 found:

- anonymous users can read rows from both the legacy `clients` and
  `professionals` tables;
- the client form uploads identity documents and stores an email plus a public
  document URL;
- the professional form stores name, phone, home location, portfolio URLs,
  national-ID URL, and certificate URL;
- a client-side administrator password is present in public JavaScript; and
- the administrator bundle performs database operations using the public
  anonymous client. Write access was not tested because that would alter live
  data.

Required response:

1. Temporarily disable `/register/client` and `/register/professional`, or
   replace them with the current Edge API-backed forms.
2. Deny anonymous reads and writes on every legacy table and storage bucket.
3. Rotate the exposed administrator password and remove password-only,
   client-side administration.
4. Move identity uploads to private storage with short-lived signed review
   links.
5. Review access logs and determine whether notification to affected people or
   authorities is legally required.
6. Fix the homepage footer: its Privacy Policy and Terms links currently point
   to `#`, although the legal pages themselves exist.

Do not upload only `website/site.js` over the live site. The deployed site is a
different compiled application and would not load that file.

### 2. Produce and test a current native release candidate

The current TestFlight archive is version `1.0.0` build `1`, created from
commit `02eecf6`. Current `main` is commit `db250c7`, nine commits later, with
the Supabase Edge migration, store safeguards, moderation, and auth fixes. The
old binary still contains the former Render/mock environment.

App Store Connect currently shows one build, two internal testers, zero
sessions, and zero crashes. A new binary is required after all P0 fixes, then
both invited testers must install and complete the release test matrix.

### 3. Finish payment-provider production approval

Chapa remains in Test Mode and merchant compliance is incomplete. Before store
submission, complete merchant verification and prove the real provider flow,
including success, failure, abandonment, duplicate callback, retry, deposit,
final balance, cancellation, refund execution, and payout transport.

The draft Chapa compliance form currently classifies the business as **Digital
Products → Apps**. That conflicts with Konjo's store-review position that it is
a marketplace for physical, in-person services. Change it to the accurate
physical-service classification accepted by Chapa (likely Personal Services)
before submitting the merchant application.

Apple In-App Purchase, StoreKit, Google Play Billing, and Sign in with Apple
are **not** required for the current product:

- Konjo payments buy in-person services consumed outside the app, so Chapa is
  the correct payment category.
- Konjo uses its own email/password and phone/OTP authentication, not a
  third-party social login.

Re-audit those decisions if the app later sells digital features or adds
Google/Facebook login.

### 4. Complete background-location review evidence

Background location is a core professional-trip feature, but it is a sensitive
Google Play permission. Before upload:

- use a prominent in-app disclosure immediately before the runtime request;
- make the disclosure explicitly state that Konjo collects location to share
  active-trip progress even when the app is in the background or not in use;
- record a short video showing the disclosure, consent and denial paths, the
  live-trip feature, and automatic stop behavior;
- complete Play Console's Location Permissions declaration; and
- keep the privacy policy and listing description consistent with the exact
  released behavior.

The current implementation requests permission only after an in-app
disclosure and stops sharing on arrival, booking end, sign-out, expiry, or
authorization failure. The wording still needs its final Play-policy pass.

### 5. Create and configure the Google Play developer account

The signed-in Google account has not created a Play Console developer account;
it is still at the account-type selection screen. For a commercial Konjo
business, use an Organization account and complete the required organization
verification (including a D-U-N-S number). Do not select Personal merely to
avoid verification. A newly created Personal account would also require a
closed test with at least 12 continuously opted-in testers for 14 days before
production access.

After account creation, add the app with package
`com.tsedeniya.konjoclient`, configure Play App Signing, and upload an AAB—not
the internal-distribution APK.

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
- Complete age rating/content rating, app access instructions, ads declaration
  (no ads), target audience (18+), support details, copyright, categories, EU
  trader status, and current agreements.
- Prove client signup, email confirmation, login, password reset, expired and
  reused recovery links, plus professional OTP signup, resend, invalid code,
  and expired code.
- Prove APNs/FCM closed-app delivery and cold-start navigation.
- Run a two-account booking: request, acceptance, deposit, background travel,
  arrival, checkout, final payment, receipt, report/block, admin resolution,
  and account deletion.
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
- custom-scheme deep links work, but verified Universal Links/App Links remain
  recommended hardening; and
- R8/resource shrinking is a future Android quality requirement, not the
  immediate October 2026 submission blocker.

## Infrastructure status

- Production mobile API: Supabase Edge Function — live.
- Database, private Storage, Auth, Cron and Vault worker: Supabase — live.
- SMS Ethiopia signed Auth hook: configured; real-device delivery evidence
  still required. The dashboard balance is only ETB 10 and the active key has a
  February 2027 expiry, so add a balance monitor and rotation reminder.
- Resend SMTP/domain: configured and verified. Recent confirmation and password
  reset messages show as delivered; release-device link completion still needs
  evidence.
- Render: removed on 9 October 2026. The `konjo-preview` Blueprint was
  disconnected first, then `konjo-api-preview` was permanently deleted.
  Workspace search confirms there are no matching Konjo Render resources.

## Release order

1. Contain the legacy website exposure.
2. ~~Remove Render after disconnecting its Blueprint.~~ Completed 9 October
   2026.
3. Finish Chapa production approval and payment operations.
4. Create the Google Play Organization account and app record.
5. Finalize background-location wording and store evidence.
6. Build new iOS TestFlight and Android internal/AAB candidates from the same
   release commit.
7. Complete physical-device and two-account testing.
8. Finish store forms, screenshots, reviewer access, and review notes.
9. Submit the exact build that passed the release test matrix.

