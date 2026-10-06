# Chapa checkout, tracking and notifications

Updated 22 September 2026. This describes the implemented flow and remaining
release requirements. Automated checks do not certify live money movement,
native background behavior, or store approval.

## Booking and Chapa payment flow

Konjo integrates **Chapa API v2** (https://docs.chapa.global/docs/v2), keys
`CHAPA_TEST_…` / `CHAPA_LIVE_…` from dashboard.chapa.global. One host
(`api.chapa.global`) serves both environments; the key decides the mode.

1. The client requests a booking; the professional accepts and may add a
   travel fee. Acceptance notifies the client and unlocks payment.
2. `POST /v1/bookings/:id/payment` creates a hosted checkout
   (`POST /v2/payments/hosted`). Amounts go as whole santim (ETB × 100),
   the `merchant_reference` is a stable 20-character digest of the booking
   stage and attempt (`KJ…`, see `chapaMerchantReference`) and becomes the
   intent's `providerReference`; the signed-in client is sent as `customer`
   (name, phone, email). The app opens `checkoutUrl` in the system browser.
3. Chapa reports the outcome by webhook (`POST /v1/payments/webhooks/{method}`,
   header `x-chapa-signature` = HMAC-SHA256 hex of the raw body with
   `KONJO_PAYMENT_WEBHOOK_SECRET`; events `payment.success`,
   `payment.failed`, `payment.cancelled`; other events are acknowledged and
   ignored; `mode` must match the key). The API re-verifies every event with
   `GET /v2/payments/{merchant_reference}/verify` before recording it.
4. When the checkout browser closes, the app calls
   `POST /v1/bookings/:id/payment/verify`; the API asks Chapa for the verdict
   and records it through the same event store and event id as the webhook,
   so the two never double-count. This is what settles payments during local
   development, where Chapa cannot reach the API.
5. Split payments: 50% deposit after acceptance, balance after checkout, as
   before. Cash bookings never touch Chapa.

Local development: `KONJO_PAYMENT_SANDBOX_CHECKOUT=true` replaces Chapa with
a one-button sandbox page; set it to `false` with test keys to exercise the
real hosted checkout (Chapa's test mode simulates payments, no money moves).
Register the public webhook URL and secret in the Chapa dashboard before
going live; production startup refuses test keys and the sandbox flag.

## Synchronization and privacy

- Supabase Realtime invalidates booking, payment, inbox and tracking projections.
  Authorized API reads remain authoritative, with polling and foreground refresh
  as recovery paths.
- The location task stores the active booking and access token in native secure
  storage with a 12-hour expiry. Every report is authorization-checked. An auth
  failure, cancellation, check-out, or sign-out stops sharing; terminal bookings
  also delete their latest tracking row.
- The disclosure appears before OS location prompts. Declining still allows the
  professional to manage the booking. Android uses a visible foreground-service
  notification and iOS shows its background-location indicator.
- Notification workers persist Expo push tickets and then poll push receipts.
  Only a successful receipt confirms transport delivery. Invalid device tokens
  are disabled, and sign-out unregisters the current installation.
- Notification taps, including cold launches, resolve against the signed-in
  user's inbox. A successful push receipt cannot prove that the person saw it.

## Required production configuration

| Setting or account | Purpose |
| --- | --- |
| `KONJO_CHAPA_SECRET_KEY` | Konjo-owned live Chapa merchant secret. Production startup rejects the test-key prefixes `CHAPA_TEST_`, `CHASECK_TEST-` and `sk_test_` (`backend/src/adapters/chapa-key-mode.ts`). |
| `KONJO_PAYMENT_WEBHOOK_SECRET` | Chapa webhook signing secret configured in the merchant dashboard. Never expose it through `EXPO_PUBLIC_*`. |
| `KONJO_PUBLIC_API_URL`, `KONJO_PUBLIC_WEB_URL` | Public HTTPS webhook and return targets. |
| `KONJO_PAYMENT_SANDBOX_CHECKOUT=false` | Required in production. Local deterministic checkout remains development-only. |
| `KONJO_EAS_PROJECT_ID` | Konjo-owned Expo project used to issue push tokens. |
| `KONJO_ANDROID_PACKAGE`, `KONJO_IOS_BUNDLE_IDENTIFIER` | Account-owned app identifiers. |
| `GOOGLE_SERVICES_JSON` | EAS file variable for Android Firebase configuration. |
| FCM v1 and APNs credentials | Configure Android and Apple push credentials in EAS. |
| `EXPO_ACCESS_TOKEN` | Server-only token when Expo enhanced push security is enabled. |
| `KONJO_WORKER_TOKEN` | Protects the worker endpoint used by a reliable scheduler. |
| `KONJO_AUTH_MODE=provider`, `NODE_ENV=production` | Enables provider-backed production guards. |

`app.config.ts` reads the native identifiers from the environment. `eas.json`
provides development, internal preview and production profiles. Build and test
on real Android and iOS phones; Expo Go and web export cannot prove push or
background location.

## Live tracking: MapLibre + CARTO Voyager, phone GPS

The tracking screens use `BookingMap` (`src/features/location/booking-map.tsx`).
On Android and iOS it renders the **CARTO Voyager** vector basemap
(OpenStreetMap data) natively with `@maplibre/maplibre-react-native`; the web
build (`booking-map.web.tsx`) renders the same style with MapLibre GL JS in an
iframe. No Google Maps Platform API is used anywhere in Konjo: the map, the
live markers, the journey line and the area label all work with
`GOOGLE_MAPS_API_KEY` absent.

Configuration:

1. Get a CARTO Basemaps key (carto.com/basemaps/apikey) and put it in `.env`
   as `CARTO_BASEMAPS_API_KEY=...`. `app.config.ts` publishes the full style
   URL (`https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json?key=…`)
   as `extra.mapStyleUrl`; the key is never logged. It ships inside the app,
   so restrict it to the app in the CARTO dashboard.
2. `@maplibre/maplibre-react-native` is a native module: after adding or
   upgrading it run `npx expo prebuild` and a native build (`npx expo
   run:android`, `npx expo run:ios` or `eas build`). Expo Go cannot run it.
3. Changing the key needs only a Metro restart (the style URL is read from
   the app config at Metro start), not a native rebuild.
4. Without a key the map shows "The map is not configured for this build";
   it never falls back to public OpenStreetMap tile servers.

| Question | Answer |
| --- | --- |
| Map style / tiles | CARTO Voyager vector style with the Konjo key (override with `EXPO_PUBLIC_MAP_STYLE_URL` for another CARTO style or a self-hosted MapLibre style). Attribution "© OpenStreetMap contributors, © CARTO" is rendered on every map and links to carto.com/attributions. |
| Map library | Native: MapLibre React Native 11 (MapLibre Native, config plugin `@maplibre/maplibre-react-native`). Web: MapLibre GL JS 5.6.1 from cdnjs with subresource-integrity hashes. Style-load failure or a 25 s timeout shows "The map could not load" instead of a blank box. |
| Markers | Destination pin (olive), professional (gold dot), own position (blue dot), each with a label. Markers are updated in place; the professional's pin is tweened over 0.9 s between reports so movement reads as continuous. A dashed line shows the remaining journey from the professional to the destination. |
| Camera | Fits all markers when tracking starts and re-fits after a marker moves more than 60 m. Any pan or zoom by the user stops following; a recenter button turns it back on. |
| Reverse geocoder | The professional's phone, via `expo-location` `reverseGeocodeAsync` (the operating system's geocoder). No API key, no Google Maps Platform call from Konjo. Not called on web. Tracking never depends on it: the GPS marker is the source of truth and the label is optional. |
| Geocode throttle | Once per 300 m of movement, one request at a time, retried after 60 s only when no label exists yet. The last label is reused between calls, and the server keeps the previous label when a report has none. |
| GPS sampling | `watchPositionAsync` at high accuracy, every 5 s or 15 m, plus a 20 s heartbeat that re-sends the last known position while stationary. Background: TaskManager task, same interval, with an Android foreground-service notification. |
| Backend update | `POST /v1/professional/bookings/:id/location` at most every 4 s and only after the sampler produced a new point, with latitude, longitude, accuracy, heading, speed and `areaLabel` (≤ 80 chars). Only the assigned professional, only while `on_the_way` and before arrival; one row per booking (`booking_tracking`), newest point wins. |
| Client update | `GET /v1/bookings/:id/tracking` polled every 10 s while the app is foregrounded, plus an immediate refetch on Supabase realtime changes to `booking_tracking` (RLS: booking participants only) and on app resume. The screen shows "Currently near Bole · Updated 4 s ago", distance and ETA. Points older than 10 min are marked stale. |
| Sharing window | Starts when the professional taps "I'm on my way" and accepts the in-app disclosure and then the OS permission prompt. Stops automatically at "I've arrived", cancellation, completion or sign-out. Postgres deletes the row when a booking completes or is cancelled; nothing is kept as history. |
| Background tracking | Android: foreground service with `ACCESS_BACKGROUND_LOCATION`, needed because the professional navigates in Google Maps while Konjo is in the background. iOS: the `location` background mode with the "Always" prompt that `expo-location` requires for background updates. Both need a native build; web is foreground-only. |
| Denied / unavailable | Permission denied or GPS off: the professional's job screen says sharing is off, the client sees "Waiting for … to share their live location". Network loss: reports are skipped and resume with the next point; the client keeps the last point and shows how old it is. |
| Navigation | The Navigate button opens an external app: Google Maps if installed, else Apple Maps on iOS; the navigation intent, then any map app, then the Google Maps web link on Android. Coordinates when the address is pinned, the written address otherwise. No API key involved. |

Usage policy: CARTO Basemaps is free for non-commercial use up to 5,000,000
tile requests a month and for commercial use up to 1,000,000; above that the
Basemaps Commercial plan is required. Keep the attribution visible. Never
point the app at the public `tile.openstreetmap.org` raster servers.

Testing on an emulator: the professional's phone must be in Addis for the map
to make sense. In the Android emulator set a position under Extended controls
→ Location (for example 9.0227, 38.7660 for Kazanchis); the default position
is in California. The client's address pin comes from the booking address, so
book with a pinned address to see the destination marker.

## Client booking history

`POST /v1/bookings/:id/archive` lets a client remove a completed or cancelled
booking from their own list (`bookings.client_archived_at`,
`archive_client_booking`). Nothing is deleted: the professional, administrators,
payments, earnings and receipts are unaffected, and `list_client_bookings`
simply skips archived rows.

## Professional dashboard

`GET /v1/professional/dashboard` returns the open jobs plus `recentJobs`
(completed or cancelled in the last 30 days, newest first, each with its
`paymentSummary`), and the professional's `rating` and `reviewCount`. The
professional app uses them for the Recent visits list, the finished-booking
detail with "Paid in full" / "Awaiting final payment", the Rating metric and
the reviews screen (which reads the public `/v1/professionals/:id/reviews`).
Notification taps route to `/pro/job?bookingId=…`, which resolves against open
and recent jobs and shows a loading state until the dashboard has arrived.

## Expo Go

The app runs in Expo Go for quick testing. Two libraries need care there:

- `expo-notifications` throws the moment it is imported in Expo Go on Android
  (push was removed from Expo Go in SDK 53), which used to break every screen
  that imports the notification context. It is now loaded through
  `loadNotifications()` in `src/features/notifications/expo-notifications-module.ts`,
  which returns null on web and in Expo Go on Android. The in-app inbox still
  polls; only system push is skipped there.
- The map is a WebView page, so it needs no native map SDK; Expo Go, the
  development build and the web all show the same OpenStreetMap map.

Background location and push delivery to a closed app still need a
development build.

## Making a professional's phone buzz in development

The whole pipeline is built: the professional app registers an Expo push token
(`src/features/notifications/push-registration.ts`), a booking request emits
`BookingRequested`, the worker projects it to a `new_booking_request` push job
for the professional, and `backend/src/adapters/notification-gateway.ts` sends it
through the Expo push service with `priority: high` on the `bookings` channel.
The API also runs the worker immediately after a request, an acceptance or a
cancellation, so delivery does not wait for the 60-second timer.

What is not in the repository, and must be supplied once per Expo account:

1. `eas init` in the project (or copy the project id from expo.dev) and set
   `KONJO_EAS_PROJECT_ID=<uuid>` in `.env`. Without it the app never asks for
   notification permission and never registers a token.
2. Android: create a Firebase project with an Android app whose package name is
   `com.tsedeniya.konjoclient` (or whatever `KONJO_ANDROID_PACKAGE` is set to),
   download `google-services.json` to the project root, and set
   `GOOGLE_SERVICES_JSON=./google-services.json`. Then upload the Firebase
   service-account key as the FCM V1 credential: `eas credentials` → Android →
   Google Service Account → FCM V1. Keep the service-account JSON out of git.
3. iOS: set `KONJO_IOS_BUNDLE_IDENTIFIER` and let `eas credentials` (iOS → Push
   Notifications) create the APNs key. Requires a paid Apple developer account.
4. Rebuild the native project so the Firebase plugin is applied:
   `npx expo prebuild --clean` then `npx expo run:android` (or
   `eas build --profile development`). Install on a physical phone; emulators
   without Google Play services and Expo Go cannot receive FCM pushes.
5. Sign in as the professional once so the token is registered (`POST
   /v1/devices`), then send a request from a client. The push arrives with the
   app closed, like any messaging app.

Only the newest active device per user receives a push. `EXPO_ACCESS_TOKEN` is
optional and only needed once Expo enhanced push security is turned on.

## Remaining launch gates

- Connect Konjo's Chapa sandbox merchant first. If every Chapa endpoint (even
  `GET /v1/banks`) answers "Invalid API Key or the business can't accept payments",
  the merchant account is not yet activated for that mode; regenerate the keys
  in the Chapa dashboard after activation and keep
  `KONJO_PAYMENT_SANDBOX_CHECKOUT=true` locally until then. Certify successful, failed,
  abandoned, duplicated and retried deposit/balance checkouts, then reconcile a
  controlled live payment against Chapa's merchant dashboard.
- Refund and payout code currently records internal accounting. Chapa refund
  execution and payout transport are still outstanding. Never tell a customer
  that money was returned until Chapa confirms it. Payment-initiation timeouts
  and captures arriving after cancellation also need a reconciliation queue.
- Decide and publish the collection/support policy for a final balance the client
  does not pay. Check-out requests payment; it cannot force a charge.
- Test real-device permission denial, lock-screen delivery, cold-start taps,
  token rotation, sign-out, restart, network loss, low-power behavior, and
  tracking termination. OS termination can interrupt background tracking.
- Publish privacy, retention and support policies; complete Apple privacy and
  Google Data Safety forms. Google background-location review requires a core
  feature justification, prominent disclosure and demonstration. Supply working
  review accounts where appropriate. The stores make the approval decision.
- Review map tile-provider terms and capacity before launch. ETA is a rough
  distance estimate, not traffic-aware navigation.

## Verification completed

- `npm run test:contracts`: all 66 suites pass, including installment amounts,
  failed retry, duplicate callbacks, balanced ledger entries and Expo receipts.
- `npm run backend:test`: the HTTP flow passes request, acceptance, deposit,
  arrival, timer, check-out, balance, receipt/earning and cancellation cases.
- TypeScript, lint, architecture checks and the production web export pass.
- Postgres split-checkout and push-receipt tests passed inside a transaction and
  rolled back all synthetic rows. Both migrations were applied to the connected
  Supabase project, and generated client types were refreshed.

## Official references

- [Expo SDK 57 notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)
- [Expo SDK 57 location](https://docs.expo.dev/versions/v57.0.0/sdk/location/)
- [Expo push receipts](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Chapa webhook verification](https://developer.chapa.co/integrations/webhooks)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google background-location requirements](https://support.google.com/googleplay/android-developer/answer/9799150)
