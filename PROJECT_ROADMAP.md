# Konjo implementation roadmap

This roadmap tracks the gap between the September 2026 technical brief and the current application. Work is ordered so that each step builds on stable contracts from the previous step.

## Current foundation

- Expo SDK 57 client and professional mobile surfaces
- Passwordless client and professional phone registration/login with secure session storage
- Local Node/SQLite API with hardened authentication, persistent client data, professional seed data, and booking lifecycle foundations
- Client and professional UI flows backed by development data where production services are not connected

## Remaining work

0. **Event-driven architecture foundation — in progress**
   - Complete: audited backend, client, worker, provider, and Supabase boundaries before further feature implementation.
   - Complete: accepted the modular event-driven architecture decision, introduced explicit provider ports and a single backend composition root, and added executable dependency and adapter-contract checks.
   - Complete: extracted background-job orchestration from the HTTP server into a framework-independent application service with injected clock, store, notification gateway, concurrency protection, and contract tests.
   - Complete: extracted OTP issuance into an application command with injected challenge store, clock, ID generator, code security, delivery port, rate policy, and rollback contract tests.
   - Complete: added a generic leased domain-event outbox with versioned envelopes, retry/backoff, dead-letter state, application dispatch, and contract tests; booking creation now commits `BookingRequested` atomically and derives idempotent notifications through an event projector.
   - Complete: added optimistic aggregate versions and migrated booking acceptance, decline, travel, check-in, completion, cancellation/no-show, reassignment, and rescheduling notification side effects to semantic domain events.
   - Complete: added ordered payment aggregate versions and migrated provider authorization/capture/failure, cancellation refunds, administrator refunds, and cash collection notifications to transactional payment events.
   - Complete: migrated review submission, low-rating quality intervention, and two-sided SOS notification side effects to transactional trust-and-safety events.
   - Complete: added ordered payout aggregate versions and transactional `PayoutQueued`/`PayoutPaid` events with idempotent professional notifications.
   - Complete: separated booking requests from payment. Request creation persists the booking and event without calling a payment provider; an accepted-booking payment command uses a stable booking payment key and atomic persistence.
   - Complete: extracted SQLite domain-event and notification outbox repositories behind ports while preserving shared-connection transaction atomicity.
   - Complete: extracted shared booking-time rules, professional availability queries, booking commands, and booking record mapping into focused domain/SQLite modules; booking idempotency, availability revalidation, persistence, and `BookingRequested` enqueue now share one write transaction.
   - Complete: added administrator-only dead-letter inspection and failed-only replay through an application port, with atomic attempt reset and administrator audit metadata in the SQLite recovery repository.
   - Complete: extracted client booking rescheduling into a clock-driven application command and SQLite repository; slot revalidation, optimistic aggregate update, and `BookingRescheduled` enqueue now execute under one write lock and transaction.
   - Complete: extracted client cancellation into a clock-driven application command and SQLite repository, plus a shared SQLite payment-settlement collaborator; booking cancellation, refund/retention ledger entries, earnings, and booking/payment events remain one atomic transaction.
   - Complete: extracted the professional booking state machine into a clock-driven application command and transactional SQLite repository; accept/decline/travel/check-in/complete/no-show now lock before evaluation and atomically coordinate status, settlement, earnings, and events.
   - Complete: extracted review submission and low-rating intervention into an ID/clock-driven application command and transactional SQLite repository; persisted rating baselines replace seed-object coupling and review/quality events remain atomic with review and visibility changes.
   - Complete: extracted signed payment callbacks into an application command with gateway verification, payload hashing, and injected time plus a transactional SQLite repository; replay checks, payment versioning, capture ledger entries, and payment events now execute under one write lock.
   - Complete: extracted payout queueing and settlement into an ID/clock-driven application service and transactional SQLite repository; earning claims, payout versions, and `PayoutQueued`/`PayoutPaid` events now share one write lock and transaction.
   - Complete: extracted SOS, disputes, and administrator safety/quality/dispute resolution into an ID/clock-driven trust-and-safety service and transactional SQLite repository; resolution state, visibility restoration, events, and administrator audits are now atomic.
   - Complete: extracted administrator refunds into an ID/clock-driven application command and transactional SQLite repository; ledger reversals, earnings cleanup, payment versioning, `PaymentRefunded`, and audit records now commit atomically, including audited idempotent retries.
   - Complete: extracted administrator category, commission, zone, promotion, and broadcast mutations into an application service and transactional SQLite repository so state changes, notifications, and audit records commit together.
   - Complete: extracted administrator professional review, publication, merchandising, suspension, and restoration into an application service and transactional SQLite repository; application/catalog changes and administrator audits now commit atomically.
   - Complete: extracted Fayda verification persistence, session lifecycle, OTP verification, password resets, client registration, and client/administrator login behind application services and provider/SQLite ports; one-time challenges are consumed atomically and only credential hashes or Fayda last-four values are persisted.
   - Complete: repaired the backend TypeScript configuration so it actually checks all backend source and contract scripts, then resolved the hidden result-union and seed-data errors it exposed.
   - Complete: extracted client profile/onboarding/account deletion and saved-address, favourite, notification-preference, and device-registration mutations behind application services and focused SQLite command repositories; onboarding and default-address changes remain transactional and service-zone fees are revalidated server-side.
   - Complete: extracted approved-professional catalog and availability mutations behind a clock-driven application service and transactional SQLite repository; application settings, public services, working days, and travel-zone projections update together.
   - Complete: extracted professional application submission and administrator export auditing into application services and focused SQLite repositories; all normal HTTP mutations now cross an application port instead of writing through the database facade directly.
   - Complete: extracted the client account, identity, booking-history, payment, ledger-audit, and notification read model behind an application query service and a dedicated SQLite read repository; HTTP delivery no longer depends on client read SQL in the database facade.
   - Complete: extracted professional application, dashboard/job, catalog, availability, and payout queries behind a clock-aware application read service and dedicated SQLite read repository; internal discovery and reassignment reuse the focused availability collaborator without exposing database-facade queries to HTTP.
   - Complete: extracted marketplace professionals, categories, zones, promotions, service-zone lookup, and booking identity policy behind a clock-aware application query service and dedicated SQLite repository; discovery dates are deterministic and public/client HTTP delivery no longer reads marketplace state through the database facade.
   - Complete: extracted the complete administrator read model—summary, settings, applications, professionals, bookings, payouts, revenue, audit logs, zones, disputes, quality flags, safety incidents, and broadcasts—behind an application query service and dedicated SQLite repository; the HTTP server now references the database facade only for lifecycle shutdown.
   - Complete: extracted overdue reassignment, booking reminders, notification job reads, and delivery recording into a dedicated background-job SQLite repository; reassignment preserves transactional domain-event enqueue and notification retry time now comes from the injected worker clock.
   - Complete: introduced one shared SQLite unit of work across every transactional repository, including commit, exception rollback, typed conflict abort, nested-transaction rejection, and an architecture rule that forbids raw transaction control outside the unit-of-work adapter.
   - Complete: reduced the database facade to connection/repository ownership and lifecycle, moved schema migration and deterministic reference seeding into dedicated SQLite bootstrap modules, and wired the composition root through explicit application stores; idempotent bootstrap contracts and architecture guards prevent the responsibilities from collapsing back together.
   - Complete: extracted authentication-session restore, persistence, revocation, clearing, subscription, and concurrent mutation ordering into a framework-independent client controller with storage/gateway ports; the React provider is now a thin adapter assembled by the client composition root, with deterministic race and failure contracts.
   - Complete: extracted booking-draft restoration, user isolation, request-ID generation, mutation sequencing, persistence, receipt lifecycle, and stale-load protection into a route-scoped client controller with storage and ID ports; deterministic contracts cover restart recovery, account switching, concurrent restoration, idempotency-key reuse, and storage failure.
   - Complete: extracted client account/onboarding restoration, cache refresh, profile and address commands, local ID/time/fee policy, language synchronization, stale-session protection, and mutation ordering into a framework-independent controller with cache, shared-contract gateway, and runtime ports; profile language changes now persist through the backend instead of reverting on remote refresh.
   - Complete: extracted discovery catalog loading, offline fallback policy, shared-contract mapping, local asset enrichment, refresh coalescing/retry, professional lookup, and availability queries into a framework-independent controller with an explicit gateway; the React context now only subscribes and forwards commands.
   - Complete: extracted client booking restoration/polling, booking projections, cancellation/rescheduling/review commands, favourites, and notification preferences into a session-aware controller with booking, preference, scheduler, and date-presentation ports; versioned restoration and coalesced polling prevent stale responses from replacing fresh user actions.
   - Complete: extracted professional dashboard/catalog restoration, polling, booking transitions, availability, session timing, catalogue mutations, and transient notifications into a session-aware controller with gateway, scheduler, runtime, and fallback ports; serialized commands and version guards prevent stale network results from replacing newer professional actions.
   - Complete: extracted professional registration restoration, safe draft caching, Fayda verification, application submission/approval, service ID generation, and onboarding mutations into a session-aware controller with storage, gateway, and runtime ports; raw FIN values are stripped from every persisted snapshot and stale account responses are ignored.
   - Complete: extracted device-language detection, persisted public-language restoration, optimistic selection, and ordered storage writes into a framework-independent controller with detector and storage ports; mutation versioning prevents delayed restoration from overwriting a newer user choice.
   - Complete: added config-gated Supabase Auth, session-refresh, logout, and PKCE password-recovery adapters behind the established client contracts; the backend resolves Supabase bearer tokens through an application port and synchronizes identity into the existing SQLite projection without bypassing commands or domain events.
   - Complete: applied and verified the tracked Supabase migrations in the development project, generated authoritative database types, moved the authorization helper outside the exposed schema, added an explicit server-only outbox policy, covered every foreign key, and cleared all Supabase security advisories.
   - Complete: extracted professional-document selection, validation, upload, metadata persistence, deletion, compensation, and reactive state into a framework-independent controller with dedicated picker, object-storage, repository, and runtime ports.
   - Complete: extracted administrator document queue, short-lived preview, review validation, and mutation state behind repository, preview, and viewer ports; Supabase administrator sign-in is selected through the composition root without coupling screens to the SDK.
   - Complete: moved the professional onboarding vertical slice—Fayda verification persistence, required-document enforcement, application submission/read/list/review, profile/service/hour/zone publication, administrator audit, and domain events—to atomic Supabase/Postgres commands behind narrow application ports. Provider mode now requires a server-only Supabase secret key; development mode retains deterministic SQLite adapters.
   - Complete: moved provider-mode marketplace discovery, zones, categories, promotions, collision-aware availability, client Fayda state, massage identity policy, payment-free booking requests, post-acceptance payment initiation, booking history, and payment-intent reads to server-only Postgres projections behind the existing ports.
   - Complete: moved provider-mode professional dashboards, catalog reads/updates, availability activation, job transitions, cash capture, escrow release, earnings, and payout-history reads to atomic server-only Postgres commands. Approved professionals can now safely activate themselves after approval.
   - Complete: moved provider-mode client rescheduling, cancellation/refund settlement, review submission, rating projection, and low-rating auto-hide/quality flags to atomic server-only Postgres commands.
   - Complete: moved provider-mode client onboarding/profile data, normalized addresses/default selection, favourites, notification preferences, device registrations, notification history, ledger audits, and retention-aware account deletion to server-only Postgres commands.
   - Complete: moved signed provider payment-event persistence, replay protection, capture ledger entries, payout queueing/earning claims, and payout settlement to atomic server-only Postgres commands.
   - Complete: moved provider-mode domain-event leasing, idempotent notification projection, retry/dead-letter recovery, audited replay, overdue reassignment, reminders, notification job claims, and attempt-level delivery persistence to server-only Postgres commands behind one worker adapter.
   - Complete: moved provider-mode SOS creation/idempotency, counterpart event emission, booking disputes, and audited safety/quality/dispute resolutions to atomic server-only Postgres commands.
   - Complete: moved the full provider-mode administrator projection and command surface—summary, filtered bookings, professionals, finance, payouts, audits, operational queues, catalog/settings/zones/promotions, broadcasts, suspension/restore, exports, and payout-aware refunds—to server-only Postgres adapters.

1. **Client booking persistence and history — in progress**
   - Restore bookings from the API after login or app restart.
   - Persist payment choice and female-only preference with each booking.
   - Keep cancelled bookings in history and display them safely.
   - Verify create, list, cancel, and restore behavior end to end.
   - Complete: provider-mode create, list, restore, payment-intent reads, rescheduling, cancellation settlement, and review submission now use Postgres.
   - Complete: provider-mode ledger audit, favourites, notification history, and client account/preferences reads and writes now use Postgres.

2. **Production authentication — ready for live-device acceptance**
   - Complete: backend phone OTP challenges, verification, expiry, attempt limits, and a provider adapter.
   - Complete: real password-reset tokens, delivery adapter, session revocation, and authentication smoke tests.
   - Complete: Supabase phone Auth is enabled with persistent native session restore/refresh/logout, authoritative profile-role lookup, generated schema types, and backend acceptance of validated bearer tokens; unconfigured Google sign-in is removed from launch UI.
   - Complete: client signup captures name, contact email, and Ethiopian phone, then creates and verifies the account only through SMS OTP. Existing clients sign in and recover access through SMS, with implicit account creation disabled on those routes.
   - Complete: professional registration creates the phone identity through SMS OTP, preserves the selected English/Amharic/Afaan Oromo language, and carries it through the six-step localized onboarding flow.
   - Complete: the hosted Supabase Send SMS hook is connected to SMSEthiopia, provider secrets remain server-side, and Auth users are synchronized into role-correct application profiles.
   - Remaining: exercise one whitelisted client number and one whitelisted professional number on a development build, recording successful delivery, OTP verification, profile creation, session restore, logout, and SMS recovery.

3. **Client data APIs — complete**
   - Persist addresses, favourites, notification preferences, and client onboarding data with an offline startup cache.
   - Add guarded booking rescheduling and post-completion rating/review APIs.
   - Remove gifting from launch scope because it is absent from the signed product brief.

4. **Professional registration and verification — in progress**
   - Complete: persist professional profiles, services, hours, travel zones, submission state, restoration, and catalog publication after approval.
   - Complete: Fayda provider adapter with server-recorded verification and last-four-only retention.
   - Complete: private Supabase upload bucket and owner/admin RLS for ID, selfie, portfolio, and certificate files.
   - Complete: certificate selection, government-ID selection, front-camera selfie capture, and portfolio selection use SDK 57 adapters behind one picker port. Private uploads use generated database types, kind-aware storage paths, a 10 MB/MIME allow-list, review status display, pending/rejected owner deletion, failed-record upload compensation, and table-plus-object immutability for approved evidence. Onboarding requires ID and selfie when secure storage is configured; the database enforces one active ID and selfie per professional.
   - Complete: administrator document review uses 60-second signed previews and an RLS-guarded database command; pending-only approve/reject transitions, reviewer attribution, rejection validation, and immutable audit insertion commit atomically, and direct unaudited table updates are blocked.
   - Complete: provider-mode onboarding is now Postgres-authoritative. Submission requires backend-recorded Fayda verification plus active government-ID and selfie evidence; approval additionally requires both documents to be approved and atomically publishes the profile configuration with an audit record and domain event.
   - Complete: public portfolio delivery exposes only administrator-approved portfolio records belonging to approved, visible professionals. Storage paths remain server-only; the API returns five-minute signed URLs, and the client loads and renders them only when a profile is opened.
   - Complete: post-approval service, price, schedule, travel-zone, and same-day booking edits persist through approved-professional APIs and republish to client discovery.
   - Remaining: exercise the complete upload, document review, application review, and public portfolio flow with provisioned Supabase professional and administrator accounts.

5. **Professional booking operations — complete**
   - Add API-backed job inbox/calendar data, accept/decline, availability, travel, check-in, and check-out operations.
   - Replace simulated API booking progress with state-checked backend updates and client polling.
   - Add authoritative session timing and idempotent professional earnings records with the 18% service commission.
   - Provider mode now uses Postgres for dashboard jobs, catalog self-service, availability activation, all guarded job transitions, status history, cash collection, balanced release entries, earnings, and payout history. SQLite remains only as the deterministic development adapter.

6. **Discovery and availability — complete**
   - Replace static professional data with a shared API-backed catalog across discovery, profiles, favourites, bookings, and checkout.
   - Add catalog search/category/zone/featured/availability filters, published professional metadata, and review rating summaries.
   - Add working-day and service-duration slot calculation, zone coverage enforcement, and conflict-safe booking/rescheduling checks.
   - Provider mode now reads approved visible professionals and authoritative slots from Postgres. Slot generation respects Addis Ababa local time, configured working hours, service duration, future-time checks, and interval overlap against active bookings.

7. **Payments, escrow, refunds, and payouts — in progress**
   - Implemented 22 September: Chapa-backed 50% deposit after acceptance, arrival before work starts, exact balance after check-out, and final receipt/earning release only after full verified payment. Admin sees lifecycle and installment history.
   - Complete: provider-neutral server adapter and deterministic signed sandbox for Telebirr, CBE Birr, card, and cash flows.
   - Complete: payment intents, HMAC webhook verification, replay protection, balanced escrow ledger entries, 18% commission release, cancellation refunds, and idempotent payout batches.
   - Complete: customers are not charged when requesting. Payment becomes available only after professional acceptance; declined or expired requests have nothing to refund.
   - Complete: mobile booking requests expose only payment status/reference data and never collect raw card or wallet credentials.
   - Complete: enforce free cancellation before travel, travel-fee forfeiture after journey start, and client no-show settlement with non-refundable commission and balanced ledger entries.
   - Complete: provider-mode authorization/capture/failure webhooks now persist in Postgres with payload-hash replay protection, optimistic versions, balanced capture entries, and ordered domain events. Payout batches atomically lock and claim earnings and settle idempotently in the same database.
   - Remaining: connect and certify Konjo's Chapa merchant methods; implement Chapa refund/payout execution and reconciliation for initialization timeouts and late captures. Internal refund ledger entries alone do not return customer funds.

8. **Notifications and reassignment — in progress**
   - Implemented 22 September: deposit, arrival and final-balance inbox/push messages; cold-start routing; Expo ticket-to-receipt polling; invalid-token deactivation; and sign-out unregistration.
   - Complete: secure device registration APIs, a mobile notification service adapter, notification history, and a provider-neutral push/SMS delivery adapter.
   - Complete: idempotent durable outbox records, attempt-level delivery audits, capped exponential retries, and deterministic failure/retry tests.
   - Complete: 24-hour reminder jobs and 15-minute reassignment with matching service, price, zone, working day, and collision-free slot checks.
   - Complete: provider mode now leases domain events and notification jobs with `SKIP LOCKED`, persists capped retries/dead letters and audited replay, and executes reminders/reassignment atomically in Postgres. Remote rollback tests cover leases, retries, delivery, reassignment, and reminder idempotency.
   - Remaining: connect Expo push credentials and Konjo's SMS provider, acquire native push tokens in the built app, and move scheduled work to the durable production queue in Step 12.

9. **Admin panel and administration APIs — in progress**
   - Complete: separately provisioned administrator credentials/sessions, strict role guards, a protected Expo web console, and session-safe web refreshes.
   - Complete: professional review/approval, operational summary, booking and payout oversight, CSV exports, and immutable administrator audit records.
   - Complete: audited application rejection plus professional suspend/restore, featured-listing, and female-only eligibility controls.
   - Complete: audited refunds with payout-lock protection, client disputes and resolution, zone/travel-fee controls, promotions, and audience-targeted broadcasts through the durable notification outbox.
   - Complete: the production Supabase model already supports out-of-band `admin` profiles; local public registration and OTP can never mint the role.
   - Complete: audited category and commission management, public category discovery, server-side booking search/filters, and dedicated booking/revenue/professional/payout CSV downloads.
   - Complete: connected Supabase and validated the administration/RLS policies with a clean security-advisor report.
   - Complete: provisioned Supabase administrators can sign in through the existing restricted console and review private professional documents without exposing elevated database credentials.
   - Complete: provider mode now reads every operations-console queue and export from Postgres and executes all catalog, merchandising, suspension, broadcast, export-audit, dispute/safety/quality, and refund mutations transactionally there. Refund rollback tests cover release reversal, retained-fee cleanup, payout locks, balanced ledgers, events, and audited retries.
   - Remaining: add provider-backed manual payout execution after payment provider credentials are available.

10. **Maps, location, and safety — in progress**
    - Complete: publish active service zones and travel fees to the app, render them dynamically, and enforce authoritative active-zone validation for onboarding, saved addresses, and booking.
    - Partial: the address-search port, use case, API routes and client form exist (a chosen candidate pins validated coordinates, fills the directions and picks the sub-city), but no provider is wired: Google Maps Platform is not used in Konjo, and no non-Google provider has been approved yet. The form hides the search box until a provider is configured; clients pin their location with the device GPS meanwhile.
    - Complete: require server-recorded client Fayda verification before a first massage booking, retaining only the last four digits.
    - Complete: show authoritative live booking status and session timers, and provide provider-mode two-sided SOS escalation with foreground location sharing, database-enforced one-open-incident idempotency, transactional counterpart notification, and audited Postgres resolution.
    - Complete: automatically hide a profile when its aggregate verified-booking rating falls below 3.0, then require an audited atomic Postgres decision to restore it only after all open flags are resolved or keep it hidden.
    - Complete: model administrator-verified female-only eligibility, expose it in discovery, enforce it during booking and reassignment, and prevent suspended professionals from discovery and operations.

11. **Localization, offline behavior, and quality — in progress**
    - Complete: added typed English/Amharic client dictionaries and wired the language preference through the full signed-in client journey: onboarding, addresses, navigation, home/discovery, professional profiles, bookings/favourites/profile/settings, booking/payment/confirmation, tracking/cancellation/SOS, rescheduling, rating, receipts, validation, loading, error, and accessibility copy.
    - Complete: added device-aware and user-selectable pre-login English/Amharic copy, native language declarations, persisted language selection, and Ethiopic font handling for public entry and authentication screens.
    - Remaining: complete native Amharic typography, wrapping, and layout review on target Android devices.
    - Complete: persist per-client booking drafts for seven days across native and web restarts, preserve them after network failures, and attach a stable server-enforced request ID so retries cannot duplicate bookings or payment intents.
    - Remaining: complete accessibility, slow-network, low/mid-range Android, and mobile-web testing.

12. **Production infrastructure and launch handover**
    - Complete: provider-mode core data and worker state now live in managed PostgreSQL behind explicit ports.
    - Complete: provider mode no longer relies on an application-process timer and exposes a constant-time, secret-authenticated internal trigger for a managed scheduler while retaining durable database leases and idempotent jobs.
    - Remaining: configure and exercise the hosted scheduler/queue against the internal worker endpoint.
    - Complete: applied the initial and hardening Supabase/Postgres migrations to the development project, generated database types, provisioned the private document bucket, and validated a clean security-advisor report.
    - Prepared locally: pgTAP structure and security tests plus repeatable public-endpoint preflight checks.
    - Complete: added a least-privilege GitHub Actions quality gate on pushes and pull requests with locked installation, Expo SDK dependency validation, zero-warning lint, client/backend type checks, architecture-boundary enforcement, automatic execution of all contract suites, end-to-end API smoke coverage, and a verified static web artifact.
    - Complete: added caller-safe request correlation IDs and configurable structured JSON logs for HTTP, lifecycle, and background-worker operations behind an application logging port.
    - Complete: separated process liveness from persistence readiness; `/ready` checks the active SQLite or Supabase adapter through an application port and returns 503 before an unhealthy instance receives traffic.
    - Remaining: add managed encryption/key management, HTTPS, hosted secrets, hosted log/metric aggregation and alerts, backups, and deployment configuration.
    - Complete: implemented retention-aware account deletion with transactional PII scrubbing, durable `AccountDeleted` emission, retryable private-object cleanup through the Storage API, contract coverage, live rollback-only validation, and an operator runbook.
    - Prepared locally: incident-response and production-launch runbooks cover credential, payment, privacy, worker, SOS, backup, monitoring, and release controls.
    - Remaining: assign production owners/contacts and exercise the incident, deletion-recovery, backup/restore, and rollback runbooks in staging with retained evidence.
    - Complete security review, Play Store release setup, API/schema docs, architecture diagram, admin guide, known-issues list, and handover walkthrough.

## External inputs needed later

Provider-backed steps require Konjo-owned sandbox or production accounts for Supabase, SMS/Fayda, Google, maps, push, Telebirr, CBE Birr, card payments, hosting, and app-store publishing. The code should expose adapters before credentials are added so local development and automated tests remain deterministic.
