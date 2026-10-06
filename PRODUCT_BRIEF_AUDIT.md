# Konjo product-brief implementation audit

Authoritative source: `premium-mobile-app-design/project/scraps/brief-text.txt` (September 2026 draft v1). This audit distinguishes locally verified behavior from provider-ready code and external launch dependencies.

## Client app

| Requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| Android and mobile web surfaces | Implemented locally | Expo Router app builds as a static web export; native device QA remains. |
| Phone signup with SMS OTP | Provider-ready | OTP expiry, attempts, throttling, sessions, and delivery adapter are smoke-tested; SMS credentials and production Auth remain external. |
| English and Amharic | In progress | Typed shared dictionaries cover the full signed-in client journey, including onboarding, discovery/profiles, settings, booking/payment, tracking/SOS, rescheduling, rating, and receipts. Pre-login client language selection and native Amharic typography/layout QA remain. |
| Browse by category and zone | Implemented | Provider mode now reads approved visible profiles, services, categories, travel zones, and filters from Postgres; deterministic SQLite remains the development adapter. |
| Professional photos, services, prices, ratings, reviews, availability | Partial | Services, prices, rating aggregates, and availability are API-backed. Administrator-approved portfolio images on approved visible profiles are delivered on demand through five-minute signed URLs; live-account validation remains. |
| Book date, time, address, zone fee | Implemented | Provider-mode quotes and request commits use Postgres working hours, Addis Ababa local time, duration-aware overlap checks, coverage, zone fees, commission snapshots, and atomic booking/event writes. Requests collect no money. Geocoding remains external. |
| Telebirr, CBE Birr and cards through Chapa; historical cash | Integration pending | New online bookings collect a 50% Chapa deposit after acceptance and the exact balance after check-out. Verified capture gates travel, receipt and earning release. Merchant certification, provider refund/payout transport and reconciliation remain launch gates. |
| Status, reschedule, cancel | Implemented | Provider-mode status transitions, rescheduling, free pre-travel cancellation, post-journey travel-fee forfeiture, and client no-show settlement are Postgres-authoritative and transaction-tested. |
| Rating/review, favourites, history, receipts | Implemented | Provider-mode completed-booking review guards, duplicate prevention, rating projection, low-rating auto-hide, favourites, booking history, ledger-backed receipts, and restoration use Postgres. |

## Professional app

| Requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| ID, selfie, portfolio, certificates | Partial | Fayda last-four verification, private bucket/RLS, onboarding ID selection, front-camera selfie capture, portfolio/certificate upload, owner list/delete, and audited administrator review with 60-second previews are implemented. Provider-mode identity, submission, review, publication state, audit, and domain events are Postgres-authoritative and atomic; approved portfolio media uses server-gated five-minute signed URLs. Live provisioned-account validation remains. |
| Services, prices, hours, home zones | Implemented | Provider-mode registration and post-approval edits persist in Postgres, enforce managed active zones, preserve historical booked services, and republish atomically to discovery. |
| Accept/decline with push | Provider-ready | Provider-mode transitions, leased event processing, idempotent notification projection, and delivery retries are Postgres-authoritative; native token acquisition and push credentials remain. |
| Calendar, check-in/out, visible timer | Implemented | Provider-mode dashboard, transitions, authoritative timestamps, settlement, and both-side timers exist. |
| Earnings and weekly payouts | Provider-ready | Provider-mode earnings, commission, payout batching, atomic earning claims, locking, and idempotent settlement use Postgres; production payout transport and admin execution remain. |
| Ratings and availability | Implemented | Provider-mode rating aggregation, low-rating auto-hide, and approved-visible-only availability activation are Postgres-authoritative. |

## Admin panel

| Requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| Approve/reject/suspend professionals | Implemented | Provider mode uses atomic server-only Postgres commands for application decisions, merchandising, female-only eligibility, suspension, quality-aware restoration, and immutable audits. |
| Categories, zones, fees, commission | Implemented | Provider-mode controls and audits are atomic in Postgres; commission is snapshotted onto new bookings so later changes cannot rewrite existing economics. |
| Booking dashboard and search | Implemented | The web console reads Postgres and filters by booking ID, client, professional, service, status, local service date, or professional. |
| Disputes and refunds | Accounting implemented | Unaccepted requests have no payment. Dispute and installment-refund accounting is atomic in Postgres. Chapa refund execution and confirmation are not connected yet. |
| Manual payouts | Provider-ready | Payout records and sandbox settlement exist; admin/provider-backed execution remains. |
| Featured listings and promo codes | Implemented | Provider-mode featured profiles, eligibility, and promotions are Postgres-authoritative and audited. |
| Push/SMS broadcasts | Provider-ready | Audience broadcasts enter the durable outbox; provider credentials remain. |
| CSV bookings, revenue, professionals | Implemented | Authenticated booking, revenue, professional, and payout CSV downloads use Postgres projections and write export audits there. |
| Audit log | Implemented | Provider-mode privileged mutations and exports write immutable Postgres audit records exposed through the server-only admin projection. |

## Core lifecycle, trust, and launch operations

| Requirement | Status | Evidence / remaining work |
| --- | --- | --- |
| 15-minute reassignment | Implemented | Provider-mode overdue claims, prior-assignee exclusion, service/price/zone/eligibility checks, collision-aware availability, assignment versioning, and `BookingReassigned` emission are transaction-tested in Postgres. True nearest-provider ordering awaits validated coordinates. |
| Escrow and commission | Implemented | Provider-mode balanced capture, release, cancellation/refund groups, earnings, and payout claims are transaction-tested in Postgres. Each booking snapshots commission so later changes do not rewrite existing economics. |
| First-massage client ID | Implemented | Provider-mode Fayda state and massage-booking enforcement are Postgres-authoritative; only the last four digits and verification time persist. |
| Female-therapist-only option | Implemented locally | The preference persists; only professionals explicitly verified by an administrator are eligible during booking creation and reassignment. |
| SOS with location | Implemented | Provider mode locks the active booking, database-enforces one open incident per reporter, stores optional foreground coordinates, emits the counterpart notification event transactionally, and audits admin resolution in Postgres. Production emergency escalation contacts/runbook remain. |
| Ratings below 3.0 auto-hide | Implemented | Provider-mode review submission atomically updates rating counts and triggers profile hiding plus a quality flag below 3.0; audited Postgres resolution restores visibility only when no open flags remain. |
| Female-only booking safety | Implemented locally | Only professionals explicitly verified by an administrator are eligible for female-only booking creation and reassignment. |
| Encryption, HTTPS, incidents, deletion | Partial | Retention-aware deletion now hard-deletes history-free accounts, scrubs booked-account PII while retaining pseudonymized economic records, and durably removes private media through a retryable Storage-API projector. Live rollback-only database validation and deletion/incident runbooks are complete. Legal retention approval, managed encryption, HTTPS/key management, named responders, and staged operational exercises remain. |
| Slow 4G, mid-range Android, accessibility | In progress | Web/type/lint/smoke checks pass; physical-device, throttled-network, and full accessibility test matrices remain. |
| Staging, stores, handover | In progress | CI now verifies locked dependencies, Expo compatibility, lint/types, architecture, all contract suites, the end-to-end API, and a deployable web export. Deletion, incident-response, and launch runbooks are prepared; hosting/CD, monitoring, backup/restore and incident exercises, Play Store release, and walkthrough remain. |

## Current priority order

1. Exercise Supabase Auth recovery and the complete document/portfolio flow with provisioned accounts.
2. Finish native typography/device/accessibility QA.
3. Connect maps, payments, SMS, push, Fayda, payout, and hosting credentials.
4. Configure the hosted scheduler against the authenticated durable worker trigger, connect the structured operational logs to hosted monitoring/alerts, then add backups, deployment/CD, and incident-response evidence.
5. Complete staging, Play Store release, and handover evidence.
