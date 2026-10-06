# Account deletion runbook

Konjo treats account deletion as a durable workflow. The database removes or
anonymizes personal data in the same transaction that records an
`AccountDeleted` domain event. The background worker then removes private
professional files through the Supabase Storage API.

## Data-handling behavior

- Accounts with no booking history are deleted from Supabase Auth. Cascading
  foreign keys remove their application profile data.
- Accounts with booking history are disabled and pseudonymized so booking,
  payment, ledger, payout, and audit records can retain their economic and
  integrity relationships.
- Client addresses, favourites, device registrations, notification payloads,
  identity-verification rows, document metadata, profile contact fields,
  booking delivery coordinates/details, free-text reviews, dispute details,
  and SOS coordinates are removed or scrubbed.
- Professional public/application fields and service notes are anonymized; the
  profile is hidden and unavailable.
- Private professional objects under the account's stable user-ID prefix are
  removed asynchronously from the `professional-documents` bucket.

Retention periods for the remaining pseudonymized financial and audit records
must be approved by Konjo's Ethiopian legal/privacy counsel before launch. Do
not invent or shorten those periods during an incident.

## Normal operation

1. `DELETE /v1/me` authenticates the caller and invokes the account command.
2. `delete_konjo_account` performs the database cleanup and inserts one pending
   `AccountDeleted` envelope atomically.
3. The managed scheduler invokes `POST /v1/internal/jobs/run` with
   `X-Konjo-Worker-Token`.
4. The account-deletion projector lists and deletes the user's private objects
   with the Supabase Storage API. It never deletes `storage.objects` rows with
   SQL.
5. A successful handler completes the event. Transient failures follow the
   standard lease, retry/backoff, and dead-letter policy.

## Verification checklist

- The API returned success and subsequent authentication is rejected.
- The profile is absent or contains only the deletion tombstone fields.
- Personal delivery, contact, identity, review, dispute, and SOS data is gone.
- Required booking and financial records remain internally consistent.
- Exactly one `AccountDeleted` event exists for the account.
- The event is completed, and all four professional document prefixes
  (`government_id`, `selfie`, `portfolio`, `certificate`) are empty.
- Logs contain the request/correlation ID but no token, document path, or
  deleted personal data.

## Failed private-file cleanup

1. Find the failed `AccountDeleted` envelope through
   `GET /v1/admin/domain-events/dead-letters`.
2. Confirm Supabase Storage availability and that the backend secret still has
   access to the private bucket. Rotate a suspected secret before retrying.
3. Replay only that failed event with
   `POST /v1/admin/domain-events/dead-letters/:eventId/replay`. The replay is
   administrator-authenticated and audited.
4. Run the worker, verify that the event completes, and confirm that the four
   account folders are empty.
5. If deletion still fails, preserve the event and logs, open a privacy
   incident, and follow [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md). Do not
   mark the request complete manually.

## Release evidence

Before production launch, retain evidence of one staging hard-deletion test,
one staging retained-history anonymization test, one forced Storage failure and
audited replay, and confirmation that no Storage objects remain. Use synthetic
accounts only.
