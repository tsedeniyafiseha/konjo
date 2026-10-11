# Apple App Review readiness

Audit date: 11 October 2026

This document records the App Store decision for Konjo and the evidence that
must exist before submission. It cannot guarantee approval: Apple makes the
review decision and may ask for additional evidence.

## Payment decision

**Do not add Apple In-App Purchase, StoreKit, RevenueCat, or Apple Pay for the
current Konjo booking flow. Version 1 is cash-only: the client pays the
professional after the physical service. The Chapa integration remains disabled
until merchant activation, refunds and payout transport have been certified.**

Konjo sells an at-home beauty, grooming or wellness appointment performed by a
professional in the physical world. Apple App Review Guideline 3.1.3(e) says
that physical goods or services consumed outside the app must use a payment
method other than In-App Purchase. Apple Pay and traditional card entry are
examples, not a requirement to support both.

Apple Pay is not a practical launch dependency:

- Apple does not list Ethiopia among Apple Pay's supported countries or
  regions.
- Chapa's published payment-method list includes Ethiopian wallets, bank
  transfer and cards, but does not list Apple Pay.
- Adding Apple Pay would require provider support, a merchant identifier,
  certificates, a native entitlement and real-device testing. It would expand
  the review surface without replacing any current launch blocker.
- Apple Card is a consumer credit card used through Apple Pay. It is not an
  App Store integration and is not required for review.

The boundary must remain explicit. If Konjo later sells a digital feature used
inside the app—such as paid profile boosts, premium discovery placement,
digital credits or app-only functionality—that item will need a fresh review
against Guideline 3.1 and will usually require In-App Purchase. A prepaid bundle
that pays only for real-world appointments is different, but its exact design
must be reviewed before implementation.

## What the repository already gets right

| Review area | Repository evidence | Status |
| --- | --- | --- |
| Physical-service payment | Production and preview use `cash_only`; accepting a cash booking creates the cash-due record automatically and completion records collection. | Correct for version 1; Chapa is not exposed. |
| No digital-purchase SDK | `package.json` has no StoreKit, RevenueCat or React Native IAP dependency. | Correct for current product. |
| Payment credentials | The app and public legal pages state that version 1 is cash-only and collects no client card or wallet credentials. | Aligned with the release configuration. |
| Account deletion | Client and professional settings call `DELETE /v1/me`; Supabase migrations scrub PII and enqueue private asset cleanup. | Implemented; retest in the release build. |
| Company-owned authentication | Clients use Konjo email/password through Supabase; professionals use Konjo phone/OTP. There is no Google/Facebook/social login. | Sign in with Apple is not required under Guideline 4.8 while this remains true. |
| Location disclosure | `app.json` explains address pinning and professional background sharing; the sharing window is tied to “I'm on my way” through arrival/end. | Good design; needs physical-iPhone evidence. |
| User safety | In-app profile/review reporting, account-level server blocking, booking enforcement, SOS wording and an auditable administrator moderation queue exist. | Migration `202610080001_content_moderation_and_blocking.sql` and API commit `bd19123` were deployed on 9 October 2026. Complete the release-build two-account test for final evidence. |
| Privacy/legal pages | `website/privacy.html`, `website/terms.html` and `website/delete-account.html` exist with Konjo contact information. | Public URLs returned HTTP 200; obtain formal legal approval. |
| Release guardrails | Production uses the Supabase Edge API, real SMS, HTTPS-only origins, and cash-only payments. EAS production rejects a missing/non-HTTPS API URL or enabled mock professional OTP. | Deployed; continue monitoring during review. |

Repository quality evidence was restored on 9 October 2026. GitHub Quality
runs 6 and 7 completed successfully; the latest run used Node 24-compatible
GitHub actions on a pinned Ubuntu 24.04 runner with no annotations. The
production-compatible API now runs on Supabase Edge Functions. Health/readiness,
public catalogue, authenticated user/admin routes, the Vault-backed Cron call
and private website-submission storage were verified live. EAS preview and
production point to that endpoint. Version `1.0.0 (3)` was built from commit
`84ba45c` and uploaded successfully to App Store Connect; the cash-flow/legal
corrections made on 11 October require replacement build `4` before review.

## Submission blockers

Do not submit to App Review until every P0 item below has dated evidence.

### P0 — required before the first TestFlight release candidate

1. **Apple signing — completed 7 October 2026.** The signed-in Apple ID
   `tsedeniyafisehaw@gmail.com` is an App Store Connect Admin for team
   `54SD6P7N7S`, but the Apple Developer portal currently reports **Access
   Unavailable**. This is expected because the membership is enrolled as an
   Individual: additional App Store Connect users cannot become Apple Developer
   Program team members or receive Certificates, Identifiers & Profiles access.
   The Account Holder completed the one-time EAS setup herself without sharing
   her password or two-factor code. Verified in EAS: Distribution Certificate
   valid through 7 October 2027, active App Store provisioning profile valid
   through 7 October 2027, APNs push key, and an App Store Connect API key with
   the least-privilege `APP_MANAGER` role. The App Store Connect Admin can now
   perform builds and submissions without knowing the Account Holder password.
2. **App Store Connect record — completed 7 October 2026.** The iOS app record
   is named **Konjo: Beauty & Wellness**, uses bundle ID
   `com.tsedeniya.konjoclient`, SKU `konjo-client-ios-2026`, and Apple ID
   `6820140076`. The exact name `Konjo` was unavailable in App Store Connect;
   the on-device app name remains `Konjo`. The Apple ID is configured in the
   `testflight` and `production` EAS Submit profiles.
   Version `1.0.0 (3)`, EAS build
   `a60c14ac-0f7b-4c4f-88d4-adb395d371e9`, was uploaded successfully through
   EAS submission `51b0d134-ba8d-45a8-b700-60540fe84478`. It uses Supabase,
   real SMS and cash-only payments. A replacement build is required for the
   11 October cash-workflow and legal-copy corrections.
   `konjoserve@gmail.com` and `tsedeniyafisehaw@gmail.com` were invited as
   internal testers on 7 October 2026.
3. **Production backend — completed 9 October 2026.** Supabase Edge Functions,
   Postgres, private Storage and Vault-backed Cron now own the production API.
   Mock OTP and sandbox checkout are off. Keep the Supabase project reachable
   for the full review window and monitor Edge/Cron failures.
4. **Build replacement release candidate `1.0.0 (4)`.** Build 3 is uploaded,
   but build 4 must include automatic cash-due setup, the unblocked professional
   travel flow, cash-only settings, and synchronized legal copy.
5. **Keep online payments disabled for version 1.** Chapa merchant activation,
   provider refunds and payout transport are post-launch work. They are not App
   Review dependencies while no online method is shown or accepted.
6. **Professional OTP configuration is complete; evidence remains.** The SMS
   Ethiopia key and signed Supabase hook are active and mock OTP is off in EAS.
   Prove signup, resend, invalid-code, expired-code and recovery cases on a
   physical iPhone before submission.
7. **Complete client email auth evidence.** On a release build, prove signup,
   email confirmation, login, nonexistent-user errors, password-reset deep
   link, expired link and reused link.
8. **Test APNs delivery.** The Apple push credential is configured in EAS;
   prove closed-app delivery and cold-start navigation on a physical iPhone.
9. **Run a release-candidate journey on two accounts.** A client and approved
   professional must complete request, acceptance, background travel, arrival,
   checkout, cash receipt, review, report/block and account deletion.

### P0 — App Store Connect submission data

1. Complete the App Privacy questionnaire from the release archive and the
   live provider configuration. The likely declarations are:
   - Contact Info: name, email address and phone number — app functionality.
   - Precise Location — app functionality; not tracking; shared with the
     booking participant only during the documented travel window.
   - User Content: professional portfolio/identity photos, reviews and support
     content — app functionality, fraud prevention and support as applicable.
   - Identifiers: user ID and device/push identifier — app functionality.
   - Purchases: purchase history — app functionality.
   - Payment Info: clients do not provide electronic payment credentials in
     version 1. Professional settlement-account details are still collected;
     declare financial information conservatively until that field is removed.
   - Other Financial Info: professional earnings and payout history — app
     functionality.
   - Tracking: No, unless the final archive or a future SDK introduces
     cross-company advertising or tracking.
2. Upload real screenshots showing the release UI, not mock data or developer
   controls. Include the client home/discovery, booking/payment summary, live
   tracking and professional dashboard.
3. Set the privacy-policy URL, support URL, marketing URL, category, age rating,
   copyright, description, subtitle, keywords and release option.
4. Complete the EU Digital Services Act trader declaration. Konjo is operating
   a commercial marketplace, so the owner should review the trader requirements
   and provide the verified business contact information if distributing in
   the EU. Apple still requires a trader-status declaration even when the app
   is not offered in the EU.
5. Provide stable review accounts and instructions. Do not require the reviewer
   to wait for a manual professional approval, find an SMS sent to a private
   phone, or create a real payment. Preconfigure deterministic reviewer access
   that uses the same production authorization rules.
6. Confirm all required Apple agreements are current. If the app itself is
   free and has no IAP, Konjo does not need to add IAP products for cash paid
   after physical services.

## Test sequence

Follow this order; a simulator alone cannot validate Konjo.

1. Run static checks from the exact release commit: typecheck, lint, backend
   check, architecture checks and contract tests.
2. Build and launch the native iOS project locally in Xcode/simulator for
   crashes, layout, deep links and permission-copy inspection. Background
   location and push are not considered proven here.
3. Install a development or internal build on a physical iPhone. Test camera,
   photo selection, deep links, “Always” location, background/locked-device
   travel, notifications, maps and the cash completion path.
4. Create the production EAS build and upload it to TestFlight. Run the full
   two-account release-candidate journey against the production-configured
   review backend.
5. Start with internal TestFlight testers. Use external TestFlight only after
   the beta information and review access are ready.
6. Inspect the archive's Xcode privacy report and resolve every privacy-manifest
   or required-reason API warning before selecting the build for review.
7. Submit the same tested build; do not rebuild between final TestFlight
   acceptance and App Review unless the new build repeats the full test pass.

Expo SDK 57 requires iOS 16.4 or later and Xcode 26.4 or later. Background
location needs a development/native build and the `location` background mode;
Expo Go cannot validate it.

## App Review notes — ready-to-paste draft

Replace every bracketed value before submission:

> Konjo is a marketplace for in-person beauty, grooming and wellness services
> delivered at the client's address in Addis Ababa, Ethiopia. Payments in this
> app are exclusively for physical services performed outside the app. Konjo
> accepts cash paid directly to the professional after the physical service and
> does not sell digital content or app functionality.
>
> Client review account: appreview.client@konjoet.com / [password stored in the
> account owner's macOS Keychain as “Konjo App Review Client”]. Professional review account:
> [phone] / [verification method or fixed review code]. Both accounts are
> preconfigured and require no manual approval.
>
> To test live location, sign in as the professional, open the assigned booking
> and tap “I'm on my way.” After the in-app disclosure, grant location access.
> The client account can then see the professional's location. Sharing is used
> only for the active trip and stops when the professional taps “I've arrived,”
> when the booking ends, or on sign-out. A demonstration video is attached.
>
> To test payment selection, choose Cash. No card, wallet or real charge is
> required for review.
> Support contact: [name, email, phone].

Never submit the current preview mock-code or sandbox-payment instructions as
if they were the production behavior. If App Review needs a safe payment test,
make that path explicit, stable and restricted to the supplied review account.

## Final go/no-go evidence

- [x] The Account Holder completed the one-time Apple signing and APNs setup
  in EAS; no Apple password or two-factor code was shared.
- [x] App record exists and build `1.0.0 (3)` was uploaded successfully for
  bundle ID `com.tsedeniya.konjoclient`.
- [ ] Production API and worker remain reachable for the entire review window.
- [x] Version 1 is cash-only; Chapa is disabled and is not a review dependency.
- [ ] SMS, email confirmation/recovery, APNs and deep links pass on iPhone.
- [ ] Background location starts and stops exactly as disclosed.
- [ ] Account deletion removes/scrubs the documented data and private assets.
- [ ] Report/block/support handling is tested with an operations owner.
- [ ] Privacy answers match the archive's Xcode privacy report and providers.
- [ ] Review accounts, payment instructions, notes and video are verified by a
  person who did not build the app.
- [ ] Internal TestFlight sign-off names the exact build number and commit.

## Official references

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple Pay supported countries and regions](https://support.apple.com/en-us/102775)
- [Apple account-deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/)
- [Apple app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [Apple third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/)
- [Apple DSA trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements)
- [Apple TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/)
- [Expo SDK 57 location](https://docs.expo.dev/versions/v57.0.0/sdk/location/)
- [Expo SDK 57 Apple authentication](https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/)
- [Chapa payment methods](https://developer.chapa.co/payment-methods)
