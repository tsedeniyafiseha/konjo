# Authentication acceptance checks

## Clients

- New accounts use email and password; no Ethiopian phone number is required.
- Confirm the email using the latest link, in the browser that started registration (PKCE).
- Log in with the registered authentication email and password.
- Forgot password sends an email link. Open it, choose a new password, then log in again.
- An old phone-only client can still choose “Previously registered with phone?” for password login. A contact email in a profile is not automatically a verified authentication email; email recovery only works after an email has been linked to that account. Do not create a duplicate account to work around this.
- Check invalid/expired confirmation links, password mismatch, and password-policy errors.

## Professionals

- Language → Log in / Create account.
- Sign-up sets a password and sends an SMS. Verification precedes application details.
- Login uses the existing phone and password. Local, leading-zero, and +251 phone formats are accepted.
- Recovery: registered phone → latest SMS code → new password → saved application or approved app.
- If saving a password fails, correct it and retry on the password form. The verified SMS code must not be consumed a second time.
- Client credentials must not become a professional account; an account-role mismatch is not an incorrect SMS code.
- Submitted applications remain under review until an admin decides. Approval alone unlocks professional app routes.

## Configuration and live verification

- Supabase email and phone authentication must be enabled.
- Add the web app's callback origin/path and native app deep link to Supabase's allowed redirect URLs. Web resets must return to the web app, not a native-only scheme.
- Test real email and SMS delivery with accounts and destinations you control. Never share passwords, OTPs, or reset links in chat.
- The local frontend and backend are connected to the same Supabase project (`KONJO_AUTH_MODE=provider`). Run `npm run supabase:check` and, with the backend running, `npm run supabase:integration-check` to verify credentials, readiness, the admin review queries, and unauthenticated access protection. These checks do not change applications or prove authenticated admin UI login.
- Local scheduled jobs are disabled (`KONJO_IN_PROCESS_JOBS=false`) to avoid processing live bookings or notifications while testing. The isolated API smoke test explicitly uses development authentication and a temporary database.
- Keep backend credentials and the private worker token in the ignored `.env` file. Do not expose service-role keys through any EXPO_PUBLIC variable.
- Browser form checks, mocked-provider contracts, and local API smoke tests do not prove real delivery or successful live account recovery.
