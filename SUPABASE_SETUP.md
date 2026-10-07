# Supabase setup

Konjo uses Supabase Auth for passwordless phone OTP sessions. Application data lives in Postgres under row-level security (RLS), and professional identity files live in a private Storage bucket.

## Connect a project

1. Connect the Supabase integration to the intended development project. Do not paste database passwords, service-role keys, or access tokens into chat or source files.
2. Add the project's URL and **publishable** key to a local `.env` file:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   KONJO_SUPABASE_URL=https://PROJECT_REF.supabase.co
   KONJO_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   # Backend only; never prefix this with EXPO_PUBLIC_ or NEXT_PUBLIC_.
   KONJO_SUPABASE_SECRET_KEY=sb_secret_...
   ```

3. Apply `supabase/migrations/202609170001_initial_konjo_schema.sql` to the development project.
4. Run `npm run supabase:check`. It must report that both the credentials and Konjo schema are available.
5. Run the database tests in `supabase/tests/database` with `supabase test db` against a local or linked test database.
6. Generate TypeScript database types from the applied schema before adding data repositories.
7. In **Authentication → URL Configuration**, allow both `konjoclient://**` for native builds and the exact development/production web origins, for example `http://localhost:8081/**` during local development.
8. Set `EXPO_PUBLIC_AUTH_PROVIDER=supabase`, restart Expo, and exercise phone registration, OTP verification, login, token refresh, and logout.

## Live location tracking

The `record_booking_location` and `get_booking_tracking` RPC functions, and the
`booking_tracking` table are defined in migration
`202609220003_booking_tracking_checkout_and_coordinates.sql`. Push this
migration to your linked Supabase project to activate live tracking:

```sh
npx supabase db push --project-ref uikwhmkkfidckcejllrk
```

This is safe to run repeatedly — all statements use `create or replace` or `if not exists`.
After the migration lands, Supabase Realtime is also enabled on `booking_tracking`
so client polling is supplemented by instant push updates whenever the professional
posts a new GPS point.

Verify the functions are live:

```sh
npm run supabase:check
```

If the check passes, restart the backend server. The tracking route
`POST /v1/professional/bookings/:id/location` and its polling counterpart
`GET /v1/bookings/:id/tracking` will begin delegating to Supabase immediately.

## Push notifications

Konjo uses the [Expo Push API](https://docs.expo.dev/push-notifications/sending-notifications/)
to send booking-status and safety notifications to both clients and professionals.

Device tokens are registered at login via `POST /v1/devices` and unregistered at
logout. The backend queues and delivers push jobs through `BackgroundJobProcessor`,
which calls the Expo Push API with an optional enhanced-security access token.

To enable push in development:

1. Run the app on a **physical device** (simulators do not receive push).
2. When prompted, grant notification permission.
3. Optionally set `EXPO_ACCESS_TOKEN` in `.env` to lock down your push channel
   (see the comment in `.env.example` for the Expo dashboard link).
4. Restart the backend server — the gateway picks up the token on boot.

In production, set `EXPO_ACCESS_TOKEN` in your hosting environment (never in
`EXPO_PUBLIC_*`). The token is sent only from the backend to Expo's API; it is
never bundled into the mobile app.

## SMSEthiopia authentication delivery

Konjo's Supabase Send SMS Hook lives in `supabase/functions/send-sms`. It verifies
Supabase's Standard Webhooks signature, validates the Ethiopian recipient and
six-digit OTP, then sends the message through `POST https://smsethiopia.com/api/sms/send`.
The mobile bundle never receives either provider secret.

1. Create the SMSEthiopia account, verify the account phone, and create a campaign-scoped API key. During the free campaign, add every test recipient to the provider whitelist.
2. Deploy the function without JWT verification because Supabase Auth signs hook requests with Standard Webhooks instead:

   ```sh
   supabase functions deploy send-sms --no-verify-jwt
   ```

3. The versioned `supabase/config.toml` declares the hosted **Send SMS** HTTP
   hook. Generate a Standard Webhooks signing secret in a secure local shell,
   install the same value in the Edge Function, preview the hosted Auth change,
   and then push it. Do not print, paste, or commit the generated value:

   ```sh
   export KONJO_SEND_SMS_HOOK_SECRET="v1,whsec_$(openssl rand -base64 32 | tr -d '\n')"
   npx supabase secrets set "SEND_SMS_HOOK_SECRET=${KONJO_SEND_SMS_HOOK_SECRET}" --project-ref uikwhmkkfidckcejllrk
   SEND_SMS_HOOK_SECRET="${KONJO_SEND_SMS_HOOK_SECRET}" npx supabase config diff --project-ref uikwhmkkfidckcejllrk
   SEND_SMS_HOOK_SECRET="${KONJO_SEND_SMS_HOOK_SECRET}" npx supabase config push --project-ref uikwhmkkfidckcejllrk
   unset KONJO_SEND_SMS_HOOK_SECRET
   ```

4. Set the campaign-scoped provider key independently so rotating it does not
   rotate the Auth signing boundary:

   ```sh
   npx supabase secrets set SMSETHIOPIA_API_KEY='YOUR_PROVIDER_KEY' --project-ref uikwhmkkfidckcejllrk
   ```

   Deploying from a new machine also requires a personal Supabase access token.
   Authenticate interactively with `npx supabase login`, or set
   `SUPABASE_ACCESS_TOKEN` only in the local shell for the deployment command.

5. Enable Phone Auth, leave phone autoconfirm disabled, and request an OTP only for a whitelisted test number. Confirm both the Supabase Auth/Function logs and SMSEthiopia SMS Logs show acceptance and delivery.

Run `npm run supabase:sms-contracts` before deployment. The adapter deliberately
fails closed on missing secrets, invalid webhook signatures, malformed phone
numbers or OTPs, network failures, non-2xx responses, and provider rejection.

Keep `EXPO_PUBLIC_AUTH_PROVIDER=api` until the migration and database tests pass. This prevents partially configured Supabase Auth sessions from reaching an API whose authoritative profile schema is absent.

## Connected development project

The development project now has all tracked migrations applied, generated database types at `src/services/supabase-database.types.ts`, and a private professional-document bucket. Local development enables the Supabase authentication adapter with `EXPO_PUBLIC_AUTH_PROVIDER=supabase`. The database security boundaries are clean; the Auth advisor still recommends enabling leaked-password protection for administrator and legacy password accounts.

Professional onboarding is Postgres-authoritative when `KONJO_AUTH_MODE=provider`. The backend requires `KONJO_SUPABASE_SECRET_KEY` (or the server-only fallback `SUPABASE_SERVICE_ROLE_KEY`) in that mode and invokes server-only RPCs for verified-identity recording, atomic submission, restoration, administrator queues, and review/publication. The opaque secret key is sent only as the Supabase `apikey` header; it is never bundled into Expo or accepted from a client. Keep `KONJO_AUTH_MODE=development` for the deterministic SQLite workflow until the server secret and real test accounts are provisioned.

With the backend running, `npm run supabase:integration-check` performs read-only checks of provider mode, readiness, the admin summary and pending application queries, administrator availability, and rejection of unauthenticated admin requests. It does not sign in or approve applications. Use `KONJO_IN_PROCESS_JOBS=false` during local integration testing to prevent scheduled processing of live data. Provider mode also requires a private `KONJO_WORKER_TOKEN` of at least 32 characters; keep it in the ignored `.env` file, never in Expo-public variables.

Approved portfolio work is delivered through `GET /v1/professionals/:professionalId/portfolio`. Postgres returns a storage path only when both the portfolio document and public professional profile are approved and the profile is visible. The backend exchanges each path for a five-minute signed Storage URL, returns no raw storage paths, and the mobile profile loads those URLs on demand.

Provider-mode marketplace discovery, service zones/categories/promotions, availability, client Fayda state, and the booking lifecycle now use server-only Postgres commands. Booking request commit revalidates the quote and slot, then atomically writes only the booking, assignment, status history, and `BookingRequested` event—no payment is created before acceptance. After the professional accepts, a separate idempotent command locks the booking, creates its payment intent, and emits `PaymentAuthorizationRequested`. Professional dashboards, catalog self-service, availability, guarded job transitions, cash capture, escrow release, earnings, client rescheduling/cancellation, post-payment refunds, reviews, ratings, and low-rating quality flags remain in that same authoritative database boundary. Direct `anon` and `authenticated` execution is revoked; the backend invokes these commands with its server-only secret key.

Client onboarding/profile state, normalized addresses, favourites, notification preferences, device registrations, notification history, and ledger audits also use backend-only Postgres projections in provider mode. Account deletion hard-deletes users without booking history; when transaction retention is required, it scrubs delivery, contact, identity, review, dispute, and SOS data, removes document metadata, bans the Auth account, and anonymizes the retained profile and professional display data. The same transaction enqueues `AccountDeleted`; the worker removes private document objects through the official Storage API with retry/dead-letter recovery. See [the account deletion runbook](./docs/operations/ACCOUNT_DELETION.md).

Signed non-cash provider webhooks now update Postgres payment intents with event-ID plus payload-hash replay protection. First capture writes one balanced clearing/escrow ledger group and every accepted transition emits an ordered domain event. Professional payout commands lock unclaimed earnings, claim the complete batch atomically, and settle idempotently; connecting real payout transport remains an external credential and certification task.

Provider-mode background processing uses the same Postgres authority. The backend leases domain events and notification jobs with row locks, projects notifications idempotently, persists capped retry/dead-letter state, supports administrator-audited replay, reassigns overdue requests only after revalidating compatibility and availability, and creates idempotent 24-hour reminders. These RPCs are executable only by `service_role`; production still needs a durable scheduler to invoke the worker and real push/SMS delivery credentials.

Provider-mode trust and safety is also Postgres-authoritative. SOS creation locks the active booking, verifies the reporting participant, enforces one open incident per reporter, and commits the incident plus `SafetyIncidentOpened` counterpart event together. Client disputes and administrator safety, quality, and dispute resolutions are atomic; administrator decisions include immutable audit rows, and profile restoration occurs only after every open quality flag is resolved.

The provider-mode operations console now uses Postgres for its summary, filtered bookings, professionals, payouts, revenue, audit history, zones, disputes, quality flags, safety incidents, and broadcasts. Catalog, commission, zone, promotion, broadcast, professional state, CSV export-audit, and refund commands commit their state and immutable audit together. Administrator refunds lock payment and earning state, reject payout-claimed earnings, balance release/retained-fee reversals, emit `PaymentRefunded`, and remain idempotent.

Client signup, sign-in, and password recovery use email and password through
Supabase Auth. Confirmation and recovery links return to the client email
screen through allow-listed native or web callbacks. Professional
authentication remains phone based, with the temporary registration OTP mock
documented separately. Google sign-in remains hidden until provider
credentials are configured.

The professional document pipeline now supports image-only government ID, front-camera selfie, portfolio photos, and JPG/PNG/WebP/PDF certificates with Expo SDK 57. It rejects empty, incompatible, or larger-than-10-MB files before upload, writes each object below `<professional-user-id>/<document-kind>/`, and then creates its review record. If the record insert fails, the client removes the uploaded object. Owners can remove pending/rejected submissions, while approved evidence is immutable to the owner at both the table and Storage policy layers. Active ID/selfie records are database-unique to close multi-device races. A live upload requires a Supabase-authenticated account whose private `profiles.account_role` is `professional`; an approved public profile is intentionally not required during onboarding.

Provisioned Supabase administrators can review pending documents in the operations console. Preview URLs expire after 60 seconds and are opened without storing them in application state. Decisions use a security-invoker RPC plus RLS and a private non-callable trigger, so the status transition, reviewer metadata, validation, and `admin_audit_logs` insert are atomic. This document boundary introduces no database advisor finding; the project-level Auth advisor still recommends leaked-password protection for administrator and legacy password accounts.

## Security boundary

- `EXPO_PUBLIC_*` values are bundled into the app. Only the project URL and publishable key belong there.
- Service-role keys, provider secrets, and database passwords are server-only.
- Professional onboarding RPCs are executable by `service_role` only. Normal authenticated clients cannot call them directly to forge Fayda verification, bypass document requirements, or self-approve.
- Event, notification, reminder, and reassignment worker RPCs are executable by `service_role` only; mobile clients cannot claim jobs, replay dead letters, or forge delivery results.
- Trust-and-safety RPCs are executable by `service_role` only; callers reach them through authenticated backend role and participant checks.
- Administrator projection and mutation RPCs are executable by `service_role` only. The backend authenticates the administrator before supplying the audited administrator ID.
- Portfolio-path lookup is also server-only; public users receive short-lived signed object URLs only after database approval and visibility checks.
- The backend validates Supabase access tokens through the Auth API and reads the account role from the RLS-protected `profiles` table; it never trusts editable user metadata for authorization.
- Authenticated users receive column-level profile update privileges and cannot update `account_role`.
- The administrator authorization helper lives outside the exposed `public` schema, and the server-only domain-event outbox has an explicit deny policy for client roles.
- The mobile app never writes booking prices or status transitions directly. Those operations will go through trusted server functions that calculate price and enforce the booking state machine.
- The `professional-documents` bucket is private. A professional can access only their own user-ID folder; admins gain access through their database role.

## Migration contents

- Auth-linked profiles with client, professional, and admin roles
- Addis Ababa zones and launch service categories
- Client addresses and notification preferences
- Public professional profiles separated from sensitive applications and documents
- Services, working hours, and travel zones
- Server-only professional identity verification plus atomic application submission, review, audit, publication, and domain-event commands
- Bookings, status history, favourites, and completed-booking reviews
- Client identity verification metadata, promotions, booking disputes, safety incidents, administrator broadcasts, quality flags, audit history, payments, escrow ledger entries, and payout records
- Leased domain-event and notification workers, dead-letter recovery, overdue reassignment, and booking reminders
- Idempotent SOS incidents, booking disputes, quality review, and audited trust-and-safety resolution commands
- Server-only administrator projections, audited catalog/operations commands, broadcast fan-out, and payout-aware refund settlement
- RLS policies and least-privilege grants for every exposed table

## Client email authentication

Clients register and sign in with email + password. Supabase Auth delivers the
confirmation and password-reset emails, and both links return the client to the
`/client-email` screen, which finishes the step automatically. These settings
live in the Supabase dashboard and must be configured once per project:

1. **Authentication → URL Configuration**
   - Site URL: the production web origin (during development `http://localhost:8081`).
   - Redirect URLs: add every origin the app runs on, for example
     `http://localhost:8081/client-email**`, `https://<production-host>/client-email**`
     and `konjoclient://client-email**` for the native builds.
   Links that point somewhere not on this list silently fall back to the Site URL.
2. **Authentication → Providers → Email**: production must have *Confirm email*
   **on** so an account cannot claim an address it does not own. It may remain
   off only during controlled setup while custom SMTP is being verified. The
   `/client-email` screen handles the confirmation callback and check-email
   state.
3. **Project Settings → Authentication → SMTP**: connect a custom SMTP provider
   before launch. Supabase's built-in sender is limited to a few emails per hour
   and only delivers to members of the Supabase organisation, so real clients
   will never receive confirmation or reset emails without it.
4. Links use the PKCE flow, so a link must be opened on the same device (and,
   on the web, in the same browser) that requested it. The screens say so.

`EXPO_PUBLIC_EMAIL_CONFIRM_REDIRECT_URL` and `EXPO_PUBLIC_PASSWORD_RESET_REDIRECT_URL`
in `.env` hold the native deep links; the web app derives its own redirect
from the current origin.

The current Resend/Supabase configuration, remaining production gates, and
acceptance procedure are recorded in
[`docs/operations/CLIENT_EMAIL_AUTH.md`](./docs/operations/CLIENT_EMAIL_AUTH.md).
