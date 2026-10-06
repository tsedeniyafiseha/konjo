# Production launch checklist

## Status on 2026-09-26: what is left before launch

Everything below the line is the full gate list. These are the concrete items
still open after the end-to-end work of 2026-09-23 to 2026-09-26; each needs
an account, a secret or a decision from the Konjo team rather than more code.

1. **Hosting for the API** with a public HTTPS domain. Set
   `KONJO_PUBLIC_API_URL`, `KONJO_PUBLIC_WEB_URL`, `EXPO_PUBLIC_API_BASE_URL`
   and `EXPO_PUBLIC_WEB_URL` to it, `NODE_ENV=production`,
   `KONJO_AUTH_MODE=provider`, `KONJO_PAYMENT_SANDBOX_CHECKOUT=false`, a
   private `KONJO_PAYMENT_WEBHOOK_SECRET` and `KONJO_WORKER_TOKEN`, and a
   scheduler calling `POST /v1/internal/jobs/run`. The API refuses to start in
   production with test keys, HTTP URLs or the sandbox flag.
2. **Chapa live**: switch to `CHAPA_LIVE_` keys once the merchant account is
   approved, register `https://<api>/v1/payments/webhooks/{telebirr|cbe|card}`
   and the webhook secret in the Chapa dashboard, enable Telebirr, CBE Birr and
   cards on the merchant, then run one controlled live payment. Verify-on-return
   is already in place for the app, webhooks are the source of truth.
3. **Push to closed apps**: upload `google-services.json` (FCM V1) and APNs
   credentials to EAS, then `eas build --profile production`. The EAS project
   id is already in `app.json`. Expo Go cannot receive push.
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
  `/delete-account` pages (drafts — legal review needed), professional
  in-app account deletion, real support contacts (`EXPO_PUBLIC_SUPPORT_EMAIL`),
  no sample professionals/jobs in real builds, no stock avatar, review status
  bound to the application.

### Still expected from the Konjo team before submission

1. **Branding assets**: real app icon (`assets/images/icon.png` 1024²,
   `assets/expo.icon`, Android adaptive foreground/background/monochrome,
   `favicon.png`). The current ones are the Expo template icons.
2. **Legal text**: have a lawyer review `website/privacy.html`,
   `website/terms.html` and `website/delete-account.html`; fill in the company
   registration details and retention periods; host them under the public
   domain and paste the URLs into both store listings.
3. **Support**: confirm `EXPO_PUBLIC_SUPPORT_EMAIL` (defaults to
   Info@Konjo.com) and optionally `EXPO_PUBLIC_SUPPORT_PHONE`; the inbox must be
   monitored.
4. **Google Play**: background-location declaration with a short video of the
   "I'm on my way" flow, foreground-service justification, Data safety form
   (location incl. background, government ID photos, name/phone/email,
   payment info, push tokens), and the account-deletion URL
   (`/delete-account`).
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
   shows a person's name on the store.
2. **App Store Connect record**: create the app with bundle id
   `com.tsedeniya.konjoclient`, name "Konjo", primary language English,
   category Lifestyle (secondary Health & Fitness or Beauty is not a category;
   use Lifestyle), age rating questionnaire (no objectionable content, 4+ unless
   the massage category changes the answer).
3. **Credentials**: run `eas credentials -p ios` once with the Apple account to
   create the distribution certificate, provisioning profile and the **APNs
   key** (needed for push through expo-notifications). Keep the APNs key in EAS.
4. **Environment for the build**: set `KONJO_IOS_BUNDLE_IDENTIFIER`,
   `KONJO_EAS_PROJECT_ID`, `EXPO_PUBLIC_API_BASE_URL` (https production API),
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `CARTO_BASEMAPS_API_KEY` and `EXPO_PUBLIC_SUPPORT_EMAIL` as EAS environment
   variables for the `production` environment (`eas env:create`). The config
   refuses a production build without the bundle id and project id.
5. **Branding**: replace `assets/images/icon.png` (still the Expo template
   chevron) and `assets/expo.icon` with the Konjo icon, 1024×1024, no alpha,
   no rounded corners; Apple rejects placeholder icons. Replace the Android
   adaptive icons at the same time.
6. **Build and TestFlight**: `eas build --platform ios --profile production`
   then `eas submit --platform ios` (or upload from the EAS page). Install via
   TestFlight on a real iPhone and run one full booking: client books,
   professional accepts, deposit via Chapa checkout, travel with background
   location, check out, final payment, payout.
7. **Store listing**: screenshots for 6.7" and 6.5" iPhones (at least the
   home, booking calendar, live map and professional dashboard), subtitle,
   description in English (Amharic optional), keywords, support URL, marketing
   URL, and the **privacy policy URL** (host `website/privacy.html`).
8. **App Privacy questionnaire** (data collection): Contact info (name, phone,
   email), User content (photos for professionals), Identifiers (user id),
   Location (precise; used for app functionality and shared with the client
   during a visit), Purchases (payment info is handled by Chapa, not the app),
   Diagnostics none. Mark nothing as used for tracking.
9. **Review notes** (App Review Information): a client test phone number and a
   professional test account with their SMS codes available during review, a
   sentence explaining that payments are for in-person beauty services (Apple
   allows external payment for physical services, so no In-App Purchase), and
   the background-location justification: "Professionals share live location
   with the client only between tapping I'm on my way and I've arrived; the
   client sees it on a map; sharing stops automatically." Attach a 30-second
   screen recording of that flow.
10. **Sign in with Apple** is not required: the app signs in with phone number
    and password only, with no third-party social login.
11. After approval, enable **phased release** and keep `eas update` for
    JavaScript-only fixes; native changes (new permissions, plugins) need a new
    build and review.
