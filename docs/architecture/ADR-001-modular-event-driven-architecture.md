# ADR-001: Modular event-driven architecture

- Status: accepted
- Date: 2026-09-17

## Context

Konjo must support multiple infrastructure implementations: SQLite and Supabase/Postgres persistence, development and production identity providers, multiple payment providers, push and SMS delivery, and Expo native/web clients. The original foundation placed HTTP routing, orchestration, domain policy, persistence, provider selection, and scheduled work in a small number of modules. It also implemented a reliable notification outbox, but not a general domain-event boundary.

## Decision

Konjo will remain a modular monolith while adopting ports and adapters plus transactional domain events.

The dependency direction is:

```text
HTTP / queue / Expo UI adapters
              |
              v
     application commands and queries
              |
              v
       domain models and policies
              |
              v
 ports: repositories, unit of work, gateways, clock, IDs, event outbox
              ^
              |
 SQLite / Supabase / payment / identity / notification adapters
```

Concrete implementations are created only in a composition root. Application and domain code must not import Node HTTP, SQLite, Expo, Supabase, environment configuration, or provider SDKs.

## Transaction and event rules

1. An aggregate mutation and its domain events are persisted in the same database transaction.
2. External network calls never run inside that transaction.
3. A durable worker claims outbox records with a lease, invokes an idempotent consumer, and records success or a retry.
4. Every event includes `eventId`, `eventType`, `schemaVersion`, `aggregateType`, `aggregateId`, `aggregateVersion`, `occurredAt`, `correlationId`, `causationId`, and `payload`.
5. Consumers use an inbox or an equivalent unique constraint so duplicate delivery is safe.
6. Retry exhaustion moves an event to a dead-letter state with enough information for audited replay.
7. Domain invariants remain synchronous. Only reactions and external side effects are asynchronous.
8. Event payloads contain identifiers and required snapshots, not secrets, raw payment credentials, or full Fayda identifiers.
9. Booking requests and payments are separate commands: `BookingRequested` reserves the request without money movement, `BookingAccepted` unlocks payment, and `PaymentAuthorizationRequested` is emitted only when the client starts payment afterward.

## Initial event catalog

- Booking: `BookingRequested`, `BookingAccepted`, `BookingDeclined`, `ProfessionalTravelStarted`, `VisitStarted`, `BookingCompleted`, `BookingCancelled`, `BookingReassigned`, `BookingRescheduled`
- Payment: `PaymentAuthorizationRequested`, `PaymentAuthorized`, `PaymentCaptured`, `PaymentFailed`, `PaymentRefunded`
- Trust and safety: `ReviewSubmitted`, `ProfessionalRatingThresholdCrossed`, `SafetyIncidentOpened`
- Professional operations: `ProfessionalApproved`, `ProfessionalSuspended`, `PayoutQueued`, `PayoutPaid`

Notification jobs are integration work derived from these events. They are not the source domain event.

## Current enforcement

- `backend/src/bootstrap/composition-root.ts` is the only backend composition root.
- `backend/src/application` contains framework-independent commands, workers, projectors, and ports.
- `backend/src/domain` contains event contracts and pure booking-time policy.
- `backend/src/adapters/sqlite` contains booking lifecycle, availability, review, payment callback/settlement/refund, payout, trust-and-safety, notification-outbox, domain-event-outbox, and dead-letter recovery repositories that share one SQLite connection where transaction atomicity is required.
- `backend/scripts/check-architecture.ts` rejects imports that reverse the dependency direction.
- Failed event replay is administrator-only. The recovery repository changes a failed event back to pending, resets its attempt/lease state, and writes `domain_event.replayed` to the administrator audit log in one transaction.
- `GET /v1/admin/domain-events/dead-letters` lists failed envelopes; `POST /v1/admin/domain-events/dead-letters/:eventId/replay` schedules a failed envelope for a fresh delivery attempt.

## Implementation sequence

1. Establish ports, a composition root, adapter contracts, and executable dependency rules.
2. Extract command/query handlers from the HTTP module.
3. Split persistence into repositories and a unit of work while retaining SQLite behavior.
4. Add the generic domain-event outbox and idempotent dispatcher.
5. Migrate notifications first, then payments, reminders, reassignment, reviews, safety, and payouts.
6. Implement Supabase/Postgres repositories and workers against the same contract suites.
7. Move client orchestration from React contexts into application controllers backed by gateway and storage ports.

## Completion criteria

- Provider replacement changes composition only.
- Application/domain modules have no infrastructure imports.
- SQLite and Supabase adapters pass the same repository contracts.
- Event tests cover atomic persistence, duplicates, ordering, retries, lease recovery, dead letters, and replay.
- HTTP and Expo UI adapters contain transport/view concerns but no business policy.
