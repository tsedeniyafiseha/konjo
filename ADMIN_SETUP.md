# Konjo administrator setup

The operations console is available at `/admin-login` and is intentionally absent from public role selection.

## Local development

Set backend-only development credentials in the ignored environment file:

```bash
KONJO_ADMIN_EMAIL=admin@konjo.local
KONJO_ADMIN_PASSWORD=use-a-unique-development-password
```

Start the backend and Expo web app with `EXPO_PUBLIC_API_BASE_URL` pointing to the backend. The first matching login bootstraps a hashed local administrator record. The plaintext password is never stored in SQLite or returned by an API.

## Production

Do not expose an administrator registration endpoint. Provision the administrator through the managed identity system, set the corresponding `public.profiles.account_role` to `admin` through a service-role migration or audited operator process, and require the organization's chosen MFA policy. Supabase RLS uses `public.is_admin()` for privileged reads and writes.

When `EXPO_PUBLIC_AUTH_PROVIDER=supabase`, the restricted login screen authenticates directly with Supabase and passes the resulting access token to the existing backend, which resolves the authoritative `admin` profile role. The private-document queue creates 60-second signed previews. Approve/reject decisions run through `review_professional_document`; RLS checks the administrator, a private trigger enforces pending-only transitions, and the decision plus administrator audit record commit in one transaction. The public RPC is security-invoker, anonymous execution and direct table-level updates are denied, and the private elevated trigger is not callable through the API.

The current console includes application and private-document review, automatic profile-hiding quality flags, SOS incident response, operational metrics, bookings, audited refunds, disputes, zones and the platform-wide travel fee cap (the maximum a professional may charge when accepting a booking), promotions, audience broadcasts, manual professional payouts (a ready-to-pay list with each professional's registered Telebirr, CBE Birr or bank details, "Prepare payout", then "Mark as paid" with the transfer reference; every step is audited), CSV exports, and audit history. Refunds are blocked after the related earning enters a payout batch. Live payout execution remains provider-dependent and is tracked in [PROJECT_ROADMAP.md](./PROJECT_ROADMAP.md).
