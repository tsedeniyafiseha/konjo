# Konjo API foundation

This backend supports a deterministic local mode using Node's built-in HTTP, crypto, and SQLite modules, plus provider mode with Supabase Auth and Postgres-backed professional onboarding. Local data is stored in `backend/data/konjo.db`; provider mode requires server-only Supabase credentials and never exposes them to Expo.

Run it with:

```bash
npm run backend:dev
```

Then opt the Expo client into the API adapter:

```bash
EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:4000 npm run web
```

For an Android emulator, use `http://10.0.2.2:4000`. A physical device needs the computer's LAN address. `EXPO_PUBLIC_API_BASE_URL` is safe to expose because it is only a public endpoint; provider secrets must stay on the backend.

Implemented endpoints:

- `GET /health`
- `GET /ready` (active persistence-provider readiness)
- `GET /v1/zones`
- `POST /v1/auth/otp/request`
- `POST /v1/auth/otp/verify`
- `POST /v1/auth/register/client`
- `POST /v1/auth/login/client`
- `POST /v1/auth/login/admin`
- `POST /v1/auth/logout`
- `POST /v1/auth/password-reset/request`
- `POST /v1/auth/password-reset/confirm`
- `GET`, `PATCH`, `DELETE /v1/me`
- `GET /v1/client-data`
- `GET /v1/client/identity`
- `POST /v1/client/fayda/verify`
- `PUT /v1/client/account`
- `POST /v1/client/addresses`
- `PATCH`, `DELETE /v1/client/addresses/:addressId`
- `POST /v1/client/addresses/:addressId/default`
- `PUT`, `DELETE /v1/client/favorites/:professionalId`
- `PATCH /v1/client/notification-preferences`
- `POST /v1/devices`
- `DELETE /v1/devices/:deviceId`
- `GET /v1/notifications`
- `POST /v1/internal/jobs/run` (`X-Konjo-Worker-Token` protected scheduler entry point)
- `POST /v1/professional/fayda/verify`
- `GET`, `PUT /v1/professional/application`
- `POST /v1/development/professional/application/approve` (development mode only)
- `GET /v1/professional/dashboard`
- `GET`, `PATCH /v1/professional/catalog`
- `PATCH /v1/professional/availability`
- `GET /v1/professional/payouts`
- `POST /v1/development/professional/payouts/batch` (development mode only)
- `POST /v1/development/professional/payouts/:payoutId/pay` (development mode only)
- `POST /v1/professional/bookings/:bookingId/{accept|decline|travel|check-in|complete|no-show}`
- `GET /v1/categories`
- `GET /v1/professionals` (`query`, `category`, `zone`, `featured`, and `available` filters)
- `GET /v1/professionals/:professionalId/availability?date=YYYY-MM-DD&serviceId=...`
- `GET`, `POST /v1/bookings`
- `POST /v1/bookings/:bookingId/payment` (accepted bookings only)
- `DELETE /v1/bookings/:bookingId`
- `PATCH /v1/bookings/:bookingId/schedule`
- `POST /v1/bookings/:bookingId/review`
- `POST /v1/bookings/:bookingId/dispute`
- `POST /v1/bookings/:bookingId/sos`
- `GET /v1/payments/:paymentIntentId`
- `POST /v1/payments/webhooks/{telebirr|cbe|card}` (signed provider callback)
- `GET /v1/development/payments/:paymentIntentId/ledger-audit` (development mode only)
- `POST /v1/development/jobs/run` (development mode only)
- `GET /v1/admin/summary`
- `GET /v1/admin/domain-events/dead-letters`
- `POST /v1/admin/domain-events/dead-letters/:eventId/replay`
- `GET /v1/admin/professional-applications`
- `POST /v1/admin/professional-applications/:professionalId/{approve|request-changes|reject}`
- `GET /v1/admin/professionals`
- `PATCH /v1/admin/professionals/:professionalId`
- `POST /v1/admin/professionals/:professionalId/{suspend|restore}`
- `GET /v1/admin/bookings` (`query`, `status`, `dateFrom`, `dateTo`, and `professionalId` filters)
- `GET /v1/admin/categories`
- `PUT /v1/admin/categories/:categoryId`
- `GET`, `PATCH /v1/admin/settings/commission`
- `POST /v1/admin/bookings/:bookingId/refund`
- `GET /v1/admin/payouts`
- `GET /v1/admin/zones`
- `PUT /v1/admin/zones/:zoneId`
- `GET`, `POST /v1/admin/promotions`
- `PATCH /v1/admin/promotions/:promotionId`
- `GET /v1/admin/disputes`
- `POST /v1/admin/disputes/:disputeId/resolve`
- `GET /v1/admin/quality-flags`
- `POST /v1/admin/quality-flags/:flagId/resolve`
- `GET /v1/admin/safety-incidents`
- `POST /v1/admin/safety-incidents/:incidentId/resolve`
- `GET`, `POST /v1/admin/broadcasts`
- `GET /v1/admin/audit-logs`
- `GET /v1/admin/exports/{bookings|revenue|professionals|payouts}.csv`

The API hashes passwords with scrypt, hashes persisted session and OTP tokens, applies request limits and security headers, restricts browser origins, validates input, and calculates service/travel prices on the server. Every response carries an `X-Request-Id` (a valid caller-supplied value is preserved), and the service emits one-line JSON request, lifecycle, and worker logs without recording authorization headers or request bodies. `KONJO_LOG_LEVEL` accepts `info`, `error`, or `silent`. Address and booking writes accept only active administrator-configured service zones. Reviews are accepted only for completed bookings and only once per booking. Professional applications require a server-recorded Fayda verification; only the FIN's last four digits are retained. Professional booking transitions are state-checked, and completion creates an idempotent earnings record with the booking's snapshotted commission rate deducted. Catalog results include approved professional metadata, coverage zones, working days, live availability, rating aggregates, and administrator-verified female-only eligibility. Booking and rescheduling reject uncovered zones, days off, paused or suspended professionals, invalid slots, and overlapping appointments. Female-only requests are accepted and reassigned only to professionals whose eligibility was verified by an administrator.

A booking request snapshots the administrator-configured commission rate (18% by default) but creates no payment intent. After the professional accepts, the client may call the idempotent booking-payment endpoint; requested or declined bookings cannot start payment. Wallet/card callbacks require an HMAC signature (`X-Konjo-Signature`), event IDs are replay-safe, and captured funds move through balanced escrow ledger groups. Completion releases professional earnings and the snapshotted commission; eligible post-payment cancellation reverses captured funds. Payout batches claim each earning at most once. The development adapter creates synthetic provider references and signed test events without collecting raw card or wallet credentials. Set `KONJO_PAYMENT_WEBHOOK_SECRET` to a long random backend-only value outside local development.

Cancellation is free before the professional starts traveling. After travel begins, the service amount is refunded while the zone travel fee is retained for the professional. A professional can record a client no-show only after starting travel; the travel fee and booking's snapshotted commission are retained and the remainder is refunded. The applied policy and actual refunded amount are persisted, and every captured-fund settlement is represented by balanced ledger groups.

Booking creation requires a stable client request ID. Repeating the same request returns the original unpaid booking instead of creating duplicates. Payment initiation has its own stable booking-based idempotency key and returns the original payment intent on retries.

Notification work is persisted in an idempotent outbox with delivery-attempt audit rows and capped exponential retries. The development adapter can exercise both success and failure paths; production delivery uses the backend-only `KONJO_NOTIFICATION_DELIVERY_URL` and token. A background worker queues 24-hour reminders and reassigns booking requests that remain unaccepted for 15 minutes, preserving service, price, zone, and slot compatibility. Development mode runs that worker in-process and exposes `POST /v1/development/jobs/run` for deterministic tests. Provider mode disables the process-local timer and requires a managed scheduler to call `POST /v1/internal/jobs/run` with `X-Konjo-Worker-Token`; `KONJO_WORKER_TOKEN` is required and must contain at least 32 characters.

Domain events use a transactional outbox with leases, aggregate versions, retry/backoff, and a failed dead-letter state. An administrator can inspect failed envelopes and explicitly replay one; replay resets its delivery state and writes an audit record in the same transaction. Run `npm run backend:architecture` for dependency boundaries and `npm run backend:event-recovery-contracts` for recovery semantics.

Account deletion uses the same durable event boundary. Database PII is removed or anonymized atomically with an `AccountDeleted` event; its projector removes private professional files through the Supabase Storage API, with normal retry and audited dead-letter replay behavior. It never mutates the Storage metadata schema directly. See the [account deletion runbook](../docs/operations/ACCOUNT_DELETION.md).

Administrator sessions use a separate credential and session store; public registration and OTP endpoints cannot create an administrator. In development only, the first successful login matching `KONJO_ADMIN_EMAIL` and `KONJO_ADMIN_PASSWORD` bootstraps the local administrator. Production administrators must be provisioned out-of-band and mapped to Supabase's `admin` profile role. Application reviews and rejection, professional suspension/restoration and merchandising, refunds, dispute, safety, and quality-flag resolutions, zone changes, promotions, broadcasts, and exports write administrator audit records. Refunds are idempotent and are blocked after an earning enters a payout batch. An aggregate verified-booking rating below 3.0 automatically hides the professional and creates a quality-review flag.

Massage bookings require a server-recorded client Fayda verification; only the last four digits are retained. During an accepted, traveling, or in-progress visit, either participant can create an idempotent SOS incident. The mobile app requests foreground location only when SOS is pressed, sends the alert even when coordinates are unavailable, notifies the counterpart, and exposes the incident to the administrator queue.

Run the self-contained end-to-end smoke suite. It starts the API on a temporary local port with an isolated database, runs the checks, and cleans up afterward:

```bash
npm run backend:test
```

Copy `.env.example` to a local ignored environment file before switching `KONJO_AUTH_MODE` away from `development`. Delivery URLs and tokens are backend-only secrets.
