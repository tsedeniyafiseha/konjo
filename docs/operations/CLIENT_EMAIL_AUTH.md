# Client email authentication and delivery

## Current status

Last reviewed: 2026-10-07

Client email authentication is implemented, but it is **not yet approved for
production launch**. The remaining blockers are recorded below so that a
configured dashboard is not mistaken for proven delivery.

| Control | Status | Evidence / next action |
| --- | --- | --- |
| Email + password registration | Implemented | `ClientEmailAuthScreen` calls the Supabase client auth gateway. |
| Email + password login | Implemented | Supabase `signInWithPassword` is wired through the client composition root. |
| Forgot/reset password | Implemented | Supabase recovery links return to `/client-email?mode=reset`. |
| Supabase email provider | Enabled | New-user signups and the Email provider are enabled. |
| Native redirect allow-list | Configured | `konjoclient://**` and `konjoclient://client-email**` are allowed. |
| Local web redirects | Configured | `http://localhost:8081/**` and the client email route are allowed. |
| Custom SMTP | Enabled | Resend SMTP is stored by Supabase and uses `Konjo <info@konjoet.com>`. |
| Sending-domain verification | **Verified** | Resend reported `konjoet.com` as Verified on 2026-10-07. |
| Mandatory email confirmation | **Enabled** | Supabase **Confirm email** was enabled and persisted after save on 2026-10-07. |
| Live email delivery | **Confirmed** | A Supabase recovery message was received through Resend on 2026-10-07. |
| Native callback handling | Implemented | SDK 57 native-intent routing normalizes callbacks; recovery codes are exchanged immediately before the password form is enabled. |
| Live registration and recovery completion | **Not completed** | Complete the acceptance test below with a fresh address and a newly requested link opened on the same phone. |

## Configuration completed on 2026-10-07

1. Audited the existing client authentication implementation. Registration,
   login, confirmation callbacks, password-reset requests, recovery callbacks,
   session persistence, and role validation were already present.
2. Confirmed the app is configured to use Supabase Auth rather than the local
   API auth fallback.
3. Confirmed that Supabase allows new signups, has the Email provider enabled,
   and has the native and local-development callback URLs allow-listed.
4. Signed in to Resend with the existing account email. A `konjoet.com`
   mailbox is not required to administer Resend.
5. Added `konjoet.com` as the Resend sending domain.
6. Added the Resend-generated DNS records in DirectAdmin:
   - DKIM TXT record at `resend._domainkey.konjoet.com`.
   - SPF routing CNAME from `rsend.konjoet.com` to
     `rsend-euw1.forge.rmta.net`.
   - Sending CNAME from `send.konjoet.com` to `send.forge.rmta.net`.
7. Confirmed all three records resolve through public DNS. DirectAdmin's
   existing website, mailbox MX, root SPF, and DMARC records were not removed
   or replaced.
8. Created a Resend key named `Supabase Auth` with **Sending access**. The
   credential is stored only in Supabase's encrypted SMTP configuration; it is
   not stored in this repository or an Expo-public variable.
9. Enabled Supabase custom SMTP with:
   - Sender: `Konjo <info@konjoet.com>` (an existing monitored mailbox).
   - Host: `smtp.resend.com`.
   - Port: `465`.
   - Username: `resend`.
   - Password: the restricted Resend key stored by Supabase.
10. Added the local native confirmation callback setting:
    `EXPO_PUBLIC_EMAIL_CONFIRM_REDIRECT_URL=konjoclient://client-email?mode=confirm`.
11. Confirmed receipt of a live Supabase password-recovery email through the
    configured Resend SMTP connection.
12. Enabled Supabase **Confirm email** and verified that the setting remained
    enabled after saving.
13. Added Expo Router SDK 57 native-intent handling for `konjoclient://`
    confirmation and recovery callbacks. Supabase callback errors returned in
    URL fragments are normalized into safe route parameters; access and refresh
    tokens are never copied into route state.
14. Changed password recovery to exchange Supabase's five-minute, single-use
    PKCE authorization code immediately when the recovery screen opens. The new
    password form is enabled only after that exchange succeeds, preventing the
    code from expiring while the user chooses a password.

No existing email account, DNS record, or Resend key was deleted. No SMTP
secret was committed to Git or written to application source.

## Resend domain verification

Resend reported `konjoet.com` as **Verified** on 2026-10-07. The three required
records are present on Konjo's authoritative nameserver and resolve publicly.
Do not duplicate, rename, or replace them.

Keep **Enable Sending** on and **Enable Receiving** off. Supabase only needs
outbound authentication email. If verification ever regresses, compare the
failed record displayed by Resend with DirectAdmin and the commands below.

The authoritative verification command used on 2026-10-07 was:

```sh
dig +short @ns5.private-nameserver.net TXT resend._domainkey.konjoet.com
dig +short @ns5.private-nameserver.net CNAME rsend.konjoet.com
dig +short @ns5.private-nameserver.net CNAME send.konjoet.com
```

All three returned the expected Resend values.

## Production go-live gates

Do not mark client email authentication production-ready until every item is
complete and evidence is recorded:

- [x] Resend reports `konjoet.com` as **Verified**, not Pending.
- [x] Supabase SMTP remains enabled after a dashboard reload.
- [x] A live Supabase recovery message was delivered through Resend to a
  controlled mailbox.
- [x] In Supabase **Authentication → Sign In / Providers**, **Confirm email**
  is enabled so a person cannot register someone else's address.
- [ ] Create a new client with a unique controlled email address. Confirm that
  registration shows the check-email state and does not open the client app
  before confirmation.
- [ ] Open the latest confirmation link on the same device/browser that began
  registration. Confirm that it returns to the Konjo client route, creates a
  `client` profile, and opens the client app.
- [ ] Sign out and sign back in with the confirmed email and password.
- [ ] Request a password reset, open the latest recovery link on the same
  device/browser, choose a new password, and confirm that only the new password
  works afterward.
- [ ] Verify expired, reused, and older confirmation/recovery links fail with a
  safe user-facing message.
- [ ] Check spam placement and the From/Reply-To presentation in at least Gmail
  and one non-Gmail mailbox.
- [ ] Configure the same public Supabase values and native callback URLs in the
  EAS `preview` and `production` environments. Never put the Resend key in EAS
  or in an `EXPO_PUBLIC_*` variable.
- [ ] Replace the local Supabase Site URL with the final HTTPS web origin when
  the production web app is available, and allow-list its exact client-email
  callback route.
- [ ] Review Supabase email rate limits and Resend quotas against expected
  registration and recovery volume.
- [ ] Disable Resend link tracking for the authentication sending domain so it
  cannot rewrite Supabase's single-use confirmation and recovery URLs.
- [ ] Enable Supabase CAPTCHA/attack protection before opening public signup,
  and confirm the mobile UI handles its challenge flow.
- [ ] Enable Supabase leaked-password protection and require MFA for accounts
  that administer Supabase and Resend.

## Acceptance test procedure

Use only an email address controlled by the tester. Do not paste passwords,
confirmation links, recovery links, or SMTP credentials into tickets or chat.

1. Register a new client with a unique email and a password of at least ten
   characters.
2. Verify receipt in Resend and the mailbox, then open the latest confirmation
   link on the device that initiated registration.
3. Confirm the authenticated account has `account_role = client` and that a
   duplicate signup cannot create a second profile for the same identity.
4. Sign out, sign in, and request password recovery.
5. Open only the latest reset message, set a new password, and verify the app
   signs the recovery session out before returning to login.
6. Confirm the old password and reused recovery link no longer work.

## Failure and rollback guidance

- If Resend verification or delivery fails, leave **Confirm email** off only
  for controlled internal testing. For a public launch, disable new signups
  rather than accepting unverified client email addresses.
- If an SMTP credential is exposed, create a replacement restricted key,
  update Supabase first, verify delivery, and then revoke the old key.
- A password-reset request must always return a generic response so it does not
  reveal whether an account exists.
- Keep `info@konjoet.com` monitored. If a no-reply sender is introduced later,
  configure an explicit monitored Reply-To address in the provider/template
  setup.
