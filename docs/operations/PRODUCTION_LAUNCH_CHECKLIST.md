# Production launch checklist

## Status on 2026-10-07: what is left before launch

Everything below the line is the full gate list. These are the concrete items
still open after the end-to-end work of 2026-09-23 to 2026-09-26; each needs
an account, a secret or a decision from the Konjo team rather than more code.
The Apple-specific audit, payment decision, review notes and evidence checklist
are in [`APPLE_APP_REVIEW_READINESS.md`](./APPLE_APP_REVIEW_READINESS.md).
The physical-iPhone test sequence is in
[`TESTFLIGHT_RELEASE_CANDIDATE_PLAN.md`](./TESTFLIGHT_RELEASE_CANDIDATE_PLAN.md),
and the prepared store copy is in
[`APP_STORE_LISTING_DRAFT.md`](./APP_STORE_LISTING_DRAFT.md).

Verified 7 October 2026 after the first TestFlight upload: the preview API
`/health` and `/ready` endpoints returned HTTP 200, the connected Supabase
schema and service-role access passed the read-only preflight, the public
privacy, terms and account-deletion URLs returned HTTP 200, and the preview
professional OTP endpoint returned the documented six-digit code `247124`.

1. **Hosting for the API** with a public HTTPS domain. Set
   `KONJO_PUBLIC_API_URL`, `KONJO_PUBLIC_WEB_URL`, `EXPO_PUBLIC_API_BASE_URL`
   and `EXPO_PUBLIC_WEB_URL` to it, `NODE_ENV=production`,
   `KONJO_AUTH_MODE=provider`, `KONJO_PAYMENT_SANDBOX_CHECKOUT=false`, a
   private `KONJO_PAYMENT_WEBHOOK_SECRET` and `KONJO_WORKER_TOKEN`, and a
   scheduler calling `POST /v1/internal/jobs/run`. The API refuses to start in
   production with test keys, HTTP URLs or the sandbox flag.
   Verified 7 October 2026: Render workspace `My Workspace` is on the Hobby
   plan, `konjo-api-preview` uses a Free instance, current and projected monthly
   charges are `$0.00`, and the build-pipeline monthly spend limit is `$0`.
   Render warns that this Free instance can spin down after inactivity and add
   50 seconds or more to the first request. No production Render service has
   been created yet.
   The preview deployment was refreshed from commit `2d84d68` on 7 October
   2026 and passed Render's `/ready` health check. The Blueprint no longer runs
   `npm ci`: the API uses Node built-ins only, so installing the Expo/Metro
   mobile build toolchain in the server image added audit noise and attack
   surface without providing a runtime dependency.
2. **Chapa live**: switch to `CHAPA_LIVE_` keys once the merchant account is
   approved, register `https://<api>/v1/payments/webhooks/{telebirr|cbe|card}`
   and the webhook secret in the Chapa dashboard, enable Telebirr, CBE Birr and
   cards on the merchant, then run one controlled live payment. Verify-on-return
   is already in place for the app, webhooks are the source of truth.
   Verified 7 October 2026: the Chapa merchant is still in **Test Mode** and
   the dashboard says compliance is due. The verification workflow requires
   Business Information, Business Contact, Documents & Verification, and
   Contact Person. The account holder must review and submit that sensitive
   business information before Chapa can issue live access.
   Apple In-App Purchase is intentionally not used: the booking buys a physical,
   in-person service consumed outside the app. Apple Pay is optional, is not
   listed by Chapa, and Ethiopia is not currently an Apple Pay market.
3. **Push to closed apps**: Android configuration was completed on 7 October
   2026. Firebase project `konjo-134d4` contains the Android app
   `com.tsedeniya.konjoclient`; `GOOGLE_SERVICES_JSON` is an EAS file variable
   in development, preview and production; and the Firebase service account is
   assigned to that package for FCM V1 in EAS. The downloaded private key was
   removed after upload. The Apple APNs key was configured in EAS on 7 October
   2026. Remaining: make native builds and prove closed-app delivery on physical
   Android and iPhone devices. Expo Go cannot receive push.
4. **Supabase**: enable leaked-password protection in Auth settings (the
   advisor still reports it off). All migrations through
   `202609230010_production_hardening` are applied to the live project.
5. **SMS**: production `SMSETHIOPIA_API_KEY` and the Supabase Auth SMS hook
   secret on the hosted API.
6. **Play Store**: signing key, listing, privacy policy and data-safety form;
   the package is `com.tsedeniya.konjoclient`, version `1.0.0`.
7. **Web app** (optional, for shareable profile links): deploy the
   `npm run web:export` output under `EXPO_PUBLIC_WEB_URL`; until then the share
   button sends the `konjoclient://` deep link.
8. **Maps and live tracking**: put the CARTO Basemaps key in `.env` as
   `CARTO_BASEMAPS_API_KEY` and restrict it to the app in the CARTO
   dashboard; the in-app map is MapLibre rendering CARTO Voyager (no Google
   Maps Platform key anywhere). Native builds include
   `@maplibre/maplibre-react-native`, so run `npx expo prebuild` and build
   after adding it. Without the key the map shows a "not configured" state
   and tracking text still works. Background location
   (sharing while the phone is locked) needs the native build; in the Play
   Console, complete the *Location permissions* declaration for
   `ACCESS_BACKGROUND_LOCATION` with the in-app disclosure text and a short
   video of the "I'm on my way" flow, or the review will reject the listing.
   Verified 2026-09-26: the API smoke test covers report → client read →
   label carry-over → clear-on-checkout; the live database has
   `booking_tracking` in the realtime publication with full replica identity.
9. **Client authentication email**: Resend custom SMTP is connected,
   `konjoet.com` is Verified, a recovery email has been delivered, and Supabase
   **Confirm email** is enabled. Launch remains blocked until fresh client
   signup, confirmation, login, and password recovery pass end to end on a
   physical phone. Follow
   [`CLIENT_EMAIL_AUTH.md`](./CLIENT_EMAIL_AUTH.md).
10. **User-generated-content moderation**: implemented in code on 8 October
    2026. Profile and review reports now use an in-app form and a persistent
    moderation queue; professional blocks are stored per client account and
    enforced again when a booking is quoted; administrators can dismiss a
    report, hide a reported review, or suspend a reported professional with an
    audit record. Apply migration
    `202610080001_content_moderation_and_blocking.sql` to the hosted Supabase
    project, deploy the matching API, then prove report, block, cross-device
    restore and admin resolution in the release build.

### Security review 2026-09-26 (backend + app audit) — what was fixed in code

- Rate limiting: budgets keyed on verified sessions only, a separate 30/min
  per-address budget for `/v1/auth/*`, bounded maps, and `X-Forwarded-For`
  honoured for `KONJO_TRUSTED_PROXY_HOPS` hops.
- Start-up refuses the default webhook secret and auth pepper (≥32 chars)
  whenever `KONJO_AUTH_MODE=provider`; `KONJO_ENVIRONMENT=production` marks a
  deployment as production without relying on `NODE_ENV`; production also
  requires https-only `KONJO_ALLOWED_ORIGINS`.
- HSTS in production, `Permissions-Policy`, `Cross-Origin-Opener-Policy`,
  `Access-Control-Max-Age`; `/health` no longer reveals configuration.
- CSV exports neutralise spreadsheet formulas; upload attachment names are
  sanitised; payment-provider and identity-provider messages are generic in
  production; the development job runner is administrator-only.
- App: `ITSAppUsesNonExemptEncryption=false`, splash image, `SYSTEM_ALERT_WINDOW`
  and `RECORD_AUDIO` blocked, admin console limited to web/dev builds,
  `professional-email` and `+not-found` routes, https-only API in release,
  tappable Terms/Privacy links, hosted `/privacy`, `/terms`,
  `/delete-account` pages (prepared for publishing; formal legal review still
  recommended), professional
  in-app account deletion, real support contacts (`EXPO_PUBLIC_SUPPORT_EMAIL`),
  no sample professionals/jobs in real builds, no stock avatar, review status
  bound to the application.

### Still expected from the Konjo team before submission

1. **Branding assets**: completed on 7 October 2026. The iOS, Android adaptive,
   monochrome, and web favicon assets now use Konjo branding.
2. **Legal text**: the public drafts no longer contain placeholders and use
   `info@konjoet.com`. Formal review by an Ethiopian lawyer is still
   recommended before launch; paste the public URLs into both store listings.
3. **Support**: confirm `EXPO_PUBLIC_SUPPORT_EMAIL` (defaults to
   `info@konjoet.com`) and optionally `EXPO_PUBLIC_SUPPORT_PHONE`; the inbox must be
   monitored.
4. **Google Play**: background-location declaration with a short video of the
   "I'm on my way" flow, foreground-service justification, Data safety form
   (location incl. background, government ID photos, name/phone/email,
   payment info, push tokens), and the account-deletion URL
   (`/delete-account`).
   Also attach test evidence for the in-app content-report and account-level
   block flow after the `202610080001` migration is live.
5. **Apple**: App Privacy questionnaire (same categories), support URL,
   marketing URL, demo account credentials for review (a client and a
   professional), and screenshots.
6. **Secrets on the host**: `KONJO_PAYMENT_WEBHOOK_SECRET`, `KONJO_AUTH_PEPPER`,
   `KONJO_WORKER_TOKEN` (all ≥32 random chars), `KONJO_ENVIRONMENT=production`,
   `KONJO_TRUSTED_PROXY_HOPS` matching the load balancer, and
   `KONJO_ALLOWED_ORIGINS` set to the web app's https origin only.
7. **Remaining backend hardening (recommended, not blocking)**: 6-digit OTP
   codes, admin login lockout/second factor, revoking sessions on password
   reset, shorter session lifetime, paginated admin exports, malware scanning
   of application uploads, per-part multipart limits, and authentication (or a
   tight budget) on the public availability and portfolio-feed routes.

---


All items require an accountable owner and dated evidence. A locally complete
adapter or runbook is not evidence that the hosted control is operating.

## Platform and secrets

- [ ] Production and staging projects are separate, and least-privilege access
  is reviewed.
- [ ] Backend-only Supabase, worker, notification, payment, payout, SMS, Fayda,
  maps, and administrator secrets are stored in the hosting secret manager.
- [ ] Public Expo configuration contains only publishable values.
- [ ] HTTPS, managed encryption, key rotation, allowed origins, and Supabase
  Auth redirect URLs are verified from a release build.
- [ ] Supabase Auth leaked-password protection is enabled. The current connected
  project still reports this control as disabled in the security advisor.
- [ ] The load balancer uses `/health` for liveness and `/ready` for traffic
  readiness; a failed Supabase check removes the instance from service.

## Durable operations

- [ ] A managed scheduler calls `POST /v1/internal/jobs/run` at the approved
  cadence with the worker token; overlapping calls and failures are alerted.
- [ ] Structured logs and metrics are centralized with alerts for API errors,
  payment failures, pending/failed domain events, notification retries, booking
  reassignment delay, and SOS failures.
- [ ] Database and Storage backup/restore procedures are configured and a
  staging restore drill has passed with recorded recovery time and data loss.
- [ ] Account deletion, dead-letter replay, payment reconciliation, and incident
  response exercises have passed using synthetic staging data.

## Product providers

- [ ] SMS/OTP, push, Fayda, maps/geocoding, Chapa merchant methods (Telebirr,
  CBE Birr and cards), Chapa refunds, and payout production accounts are
  certified and end-to-end tested.
- [ ] Resend shows the sending domain as Verified; Supabase Confirm email is
  enabled; client signup, confirmation, login, and password recovery pass with
  real delivery evidence.
- [ ] Payment acceptance, duplicate callbacks, cancellation, no-show,
  administrator refund, completion, and payout reconciliation are exercised.
- [ ] Emergency escalation contacts and the customer SOS fallback are approved.

## Release quality

- [ ] CI quality gates pass from the exact release commit.
- [ ] Android device, slow-network, offline recovery, accessibility, English,
  and Amharic layout matrices pass on supported targets.
- [ ] Supabase migrations, generated types, security advisor, RLS tests, and
  public-endpoint preflight checks pass in staging and production.
- [ ] Play Store signing, listing, privacy disclosures, data-safety form,
  support details, staged rollout, and rollback procedure are approved.
- [ ] API/schema docs, architecture decision, admin guide, known issues, and
  support/engineering handover are complete.

## Go/no-go

Launch only when every blocking item has an owner-approved evidence link, no
unreconciled financial or privacy defect remains, on-call coverage is active,
and rollback has been rehearsed. Record the final decision and release commit.

## Apple App Store submission (added 2026-10-03)

What the code already provides: `ios.bundleIdentifier` `com.tsedeniya.konjoclient`,
`ITSAppUsesNonExemptEncryption=false` (no export-compliance questions), purpose
strings for camera, photo library, location (when in use and always, with the
background justification), `UIBackgroundModes: location`, an app-level privacy
manifest (`ios.privacyManifests`), English/Amharic/Afaan Oromoo locales,
in-app account deletion for clients and professionals, hosted privacy, terms
and delete-account pages, and EAS build profiles (`eas.json`). Expo doctor
passes every check except the local CocoaPods one, which EAS cloud builds do not need.

What the Konjo team has to do, in order:

1. **Apple Developer Program** membership (organisation account, $99/year).
   Enrol with the company's D-U-N-S number; individual enrolment is faster but
   shows a person's name on the store. Checked 7 October 2026: the signed-in
   Apple ID `tsedeniyafisehaw@gmail.com` is an App Store Connect Admin on team
   `54SD6P7N7S`, but Apple Developer shows **Access Unavailable** and offers
   “Join the Apple Developer Program.” The membership is enrolled as an
   Individual, so Apple does not permit additional App Store Connect users to
   receive Certificates, Identifiers & Profiles access. Completed 7 October
   2026: the Account Holder performed the one-time setup herself without sharing
   her password or two-factor code. EAS now stores the Distribution Certificate,
   active App Store provisioning profile, APNs key, and an App Store Connect API
   key with the least-privilege `APP_MANAGER` role.
2. **App Store Connect record**: created on 7 October 2026 as
   **Konjo: Beauty & Wellness**, bundle ID `com.tsedeniya.konjoclient`, SKU
   `konjo-client-ios-2026`, Apple ID `6820140076`. The exact store name `Konjo`
   was already in use; the installed app name remains `Konjo`. Primary language
   is English (U.S.). Category, age rating, listing copy and screenshots remain
   to be completed from the tested release content.
3. **Credentials**: completed 7 October 2026. The Distribution Certificate and
   active App Store provisioning profile expire 7 October 2027. The APNs key and
   App Store Connect submission key are stored in EAS.
4. **Environment for the build**: set `KONJO_IOS_BUNDLE_IDENTIFIER`,
   `KONJO_EAS_PROJECT_ID`, `EXPO_PUBLIC_API_BASE_URL` (https production API),
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `CARTO_BASEMAPS_API_KEY` and `EXPO_PUBLIC_SUPPORT_EMAIL` as EAS environment
   variables for the `production` environment (`eas env:create`). The config
   refuses a production build without the bundle id and project id.
   Completed 7 October 2026 for the bundle/project identifiers, Firebase file,
   Supabase client URL/publishable key, native confirmation/reset redirects,
   CARTO key, website URL and support email. `EXPO_PUBLIC_API_BASE_URL` remains
   intentionally unset until the real production API is deployed. Mock OTP is
   explicitly false in the production EAS environment.
5. **Branding**: completed on 7 October 2026. The iOS icon, Android adaptive
   foreground/background/monochrome icons, and web favicon use Konjo branding.
6. **Build and TestFlight**: the `testflight` profile makes an App Store build
   using the EAS `preview` environment, while `production` remains reserved for
   the real production backend. Run
   `eas build --platform ios --profile testflight --auto-submit` for the internal
   testing build. Install via TestFlight on a real iPhone and run one full booking: client books,
   professional accepts, deposit via Chapa checkout, travel with background
   location, check out, final payment, payout.
   First upload completed 7 October 2026: version `1.0.0`, build `1`, EAS build
   `e5be1e18-3e2b-4efd-9c33-3d23f5d8b195`; App Store Connect status is
   **Ready to Test** in the internal `Team (Expo)` group. Internal invitations
   were sent to `konjoserve@gmail.com` and `tsedeniyafisehaw@gmail.com` on
   7 October 2026; delivery of the TestFlight invitation was confirmed in the
   tester inbox. App Store Connect currently reports zero sessions and zero
   crashes because neither invited tester has installed and opened the build
   yet. EAS reports the iOS store build as `FINISHED`, SDK 57, version `1.0.0`
   build `1`. Complete the real-iPhone test pass before promoting another build
   toward App Review.
7. **Store listing**: screenshots for 6.7" and 6.5" iPhones (at least the
   home, booking calendar, live map and professional dashboard), subtitle,
   description in English (Amharic optional), keywords, support URL, marketing
   URL, and the **privacy policy URL** (host `website/privacy.html`).
   Draft English metadata, categories, public URLs and manual-release settings
   were validated and synced to App Store Connect on 7 October 2026 from
   `store.config.json`. Screenshots, copyright owner, age rating, review
   credentials and final approval of the wording remain open.
8. **App Privacy questionnaire**: declare Contact Info, User Content,
   Identifiers, Precise Location, Purchase History, Payment Info and Other
   Financial Info for their real purposes. Konjo does not receive full client
   card or wallet credentials from Chapa, but it stores the selected payment
   channel and professional payout details. Inspect the final archive's Xcode
   privacy report; do not assume Diagnostics is empty. Mark nothing as tracking
   unless the final SDK/provider audit says otherwise.
9. **Review notes** (App Review Information): a client test phone number and a
   professional test account with their SMS codes available during review, a
   sentence explaining that payments are for in-person beauty services (Apple
   allows external payment for physical services, so no In-App Purchase), and
   the background-location justification: "Professionals share live location
   with the client only between tapping I'm on my way and I've arrived; the
   client sees it on a map; sharing stops automatically." Attach a 30-second
   screen recording of that flow.
10. **Sign in with Apple** is not required: clients use Konjo-owned
    email/password authentication and professionals use Konjo-owned phone/OTP,
    with no third-party social login. Revisit this before adding Google,
    Facebook or another social login.
11. **Compliance**: complete the EU Digital Services Act trader declaration and
    verify the business contact details and all current Apple agreements.
12. After approval, enable **phased release** and keep `eas update` for
    JavaScript-only fixes; native changes (new permissions, plugins) need a new
    build and review.
