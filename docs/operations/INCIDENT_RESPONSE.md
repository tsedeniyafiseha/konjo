# Incident response runbook

This runbook covers authentication or secret exposure, payment webhook abuse,
personal-data or private-storage exposure, background-worker backlog, and SOS
delivery failure. Konjo must assign named primary and backup responders,
security/privacy counsel, provider escalation contacts, and an executive
decision maker before production launch.

## Severity

| Severity | Examples | Initial response target |
| --- | --- | --- |
| SEV-1 | Active personal-data exposure, compromised production secret, forged payments, or unavailable SOS path | Immediate paging and containment |
| SEV-2 | Worker backlog affecting time-sensitive bookings, degraded payment callbacks, or suspected limited exposure | Page the on-call owner and begin triage |
| SEV-3 | Contained defect with no known security, safety, or financial impact | Track and repair through normal operations |

Targets are operational objectives, not legal notification deadlines. Counsel
must approve jurisdiction-specific user, regulator, and partner notifications.

## Response sequence

1. **Declare and record.** Assign an incident commander and scribe, record UTC
   timestamps, affected environment, discovery source, and a correlation ID.
2. **Preserve evidence.** Retain relevant structured logs, provider event IDs,
   audit rows, deployment identifiers, and configuration history. Never copy
   secrets or personal document contents into the incident channel.
3. **Contain.** Disable the narrowest affected credential, endpoint, provider,
   worker, or deployment. Keep SOS available through an approved fallback when
   possible.
4. **Assess scope.** Identify affected users, records, objects, payments, event
   versions, and the earliest/latest known timestamps. Treat unknown scope as
   potentially affected until disproved.
5. **Eradicate and recover.** Patch the cause, rotate exposed credentials,
   restore from a verified source when required, replay idempotent work, and
   monitor error and backlog rates.
6. **Communicate.** Use approved templates and counsel-reviewed timing for
   customers, professionals, regulators, banks/payment partners, and Supabase.
7. **Close and learn.** Record root cause, control failures, impact, corrective
   owners/dates, and evidence that each action was verified.

## Scenario controls

### Authentication or secret exposure

- Revoke or rotate the affected Supabase, worker, notification, payment, or
  administrator credential; redeploy consumers using the new value.
- Revoke affected sessions and inspect authorization failures, administrator
  audits, and unusual request/correlation IDs.
- Never move a backend secret into an `EXPO_PUBLIC_` variable to restore
  service.

### Payment webhook compromise

- Disable the affected provider webhook or rotate its signing secret.
- Compare provider event IDs and payload hashes with stored payment events and
  balanced ledger groups; do not edit ledger rows manually.
- Reconcile captured, released, refunded, and payout-claimed amounts before
  reenabling callbacks.

### Personal-data or private-storage exposure

- Block the affected bucket policy, signed-URL path, account, or secret.
- Determine which object paths and metadata were accessible and whether URLs
  were issued or downloaded.
- Use [ACCOUNT_DELETION.md](./ACCOUNT_DELETION.md) for deletion recovery; never
  manipulate `storage.objects` directly with SQL.

### Worker backlog

- Check scheduler authentication, worker response/error logs, lease expiry,
  pending counts, and dead letters.
- Restore the scheduler, then drain idempotently. Do not run overlapping ad-hoc
  loops or reset successful events.
- Prioritize SOS, booking assignment, payment, and time-sensitive notification
  work according to customer impact.

### SOS outage

- Treat inability to create or route an SOS as SEV-1.
- Publish the approved emergency fallback to affected users and support staff.
- Verify API creation, counterpart notification projection, delivery-provider
  status, and the administrator safety queue independently.

## Required pre-launch exercise

Run a tabletop covering one leaked server secret and one failed SOS/worker
delivery. Record responders, decisions, timestamps, recovery evidence, missing
access, and follow-up owners. Repeat after material architecture or provider
changes and on the cadence approved by Konjo's security owner.
