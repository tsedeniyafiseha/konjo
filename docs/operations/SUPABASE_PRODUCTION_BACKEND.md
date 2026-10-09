# Supabase production backend

Updated: 9 October 2026

Konjo no longer needs Render for the mobile API. Preview and production EAS
environments now use:

```text
https://uikwhmkkfidckcejllrk.supabase.co/functions/v1/api
```

## Production ownership

| Capability | Production owner |
| --- | --- |
| Client email/password, confirmation and recovery | Supabase Auth + Resend SMTP |
| Professional phone OTP | Supabase Auth Send SMS Hook + SMS Ethiopia |
| Application API | Supabase Edge Function `api` |
| Marketplace, bookings, tracking, payments and audit data | Supabase Postgres |
| Identity, portfolio and website-application files | Private Supabase Storage buckets |
| Booking reminders, reassignment and outbox delivery | Supabase Cron + Edge worker route |
| Push delivery | Expo Push Service, with FCM/APNs credentials managed through EAS |
| Payment checkout | Chapa; still in test mode until merchant activation |

Firebase is retained only for Android FCM delivery. It is not the application
database, authentication service or API host. AWS is not part of this design.

## Verified live on 9 October 2026

- `api` was deployed without the Node SQLite runtime dependency.
- `/health`, `/ready`, `/v1/zones` and `/v1/categories` returned HTTP 200.
- Authenticated `/v1/me`, admin summary and pending-application reads returned
  HTTP 200 using Supabase Auth.
- Supabase Cron `konjo-background-jobs` runs every minute. Its database run
  succeeded and the resulting Edge request returned HTTP 200.
- The worker credential was rotated and stored independently in Edge secrets
  and Supabase Vault.
- Chapa credentials and backend signing secrets are in Edge secrets.
- The SMS Ethiopia API key is in Edge secrets and the signed Supabase Send SMS
  Hook is enabled at `/functions/v1/send-sms`.
- A synthetic contact message and professional application passed through the
  live Edge API into Postgres/private Storage; the test rows and objects were
  then removed.
- EAS `preview` and `production` use the Supabase Edge URL. Preview mock OTP is
  disabled, so any newly built preview uses real SMS delivery.
- Supabase Auth Site URL is `https://konjoet.com`; the allow-list contains the
  Konjo native scheme and `https://konjoet.com/**`. Email confirmation is on,
  the password minimum is 10 characters, and custom Resend SMTP is enabled.

## Secrets and access

Never put service-role, SMS, Chapa, worker, webhook or Auth-hook signing secrets
in an `EXPO_PUBLIC_*` variable. Edge secrets contain the provider values;
Supabase Vault contains only the Cron worker token needed by the database job.
The repository contains names and setup instructions, not secret values.

The `api` function sets `verify_jwt = false` at the Edge gateway because it also
serves public catalogue/readiness routes and signed provider webhooks. The HTTP
application authenticates and authorizes every protected route using the
Supabase access token.

## Cost and provider status

Supabase Free has quotas; it is not an unlimited production SLA. The project
does not need a paid Render service after this cutover. SMS Ethiopia delivery
uses the account balance—the dashboard showed ETB 10 at connection time, so do
not assume a permanent “free 100” allowance. Each real OTP test can consume
provider credit.

Chapa remains in Test Mode. Do not submit the current online-payment flow to
App Review as a live payment flow until merchant activation, live webhooks,
refund execution and payout transport have been proven. A new native build is
also required for the EAS environment changes; existing APK/TestFlight binaries
keep the environment values embedded when they were built.

## Website cutover

The production website is hosted on the existing LiteSpeed host, not Render.
`website/site.js` now posts contact and professional-application forms directly
to the Supabase Edge API. Deploy the updated static file to the website host;
until then the live host still answers those relative POST paths with HTML and
does not persist the forms.

## Migrations

- `202610090001_supabase_edge_worker_cron.sql`
- `202610090002_website_submissions.sql`

The live database contained older timestamp-named migration records that do not
match the repository's normalized filenames. The two migrations above were
applied directly, verified, and recorded as applied without rewriting unrelated
history.
