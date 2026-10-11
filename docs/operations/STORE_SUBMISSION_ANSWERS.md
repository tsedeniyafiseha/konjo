# Store submission answers

Prepared 11 October 2026 from the Expo SDK 57 release source. Recheck these
answers against the exact final binary if a dependency, permission, payment
mode, or backend provider changes.

## Release identity

| Field | Value |
| --- | --- |
| App | Konjo: Beauty & Wellness |
| Version | 1.0.0 |
| iOS bundle ID | `com.tsedeniya.konjoclient` |
| Android package | `com.tsedeniya.konjoclient` |
| Category | Lifestyle (primary), Health & Fitness (secondary) |
| Price | Free |
| Privacy policy | `https://konjoet.com/privacy` |
| Privacy choices / deletion | `https://konjoet.com/delete-account` |
| Support / marketing | `https://konjoet.com/` |
| Payments in version 1 | Cash paid to the professional after an in-person service; no digital goods, in-app purchase, card, or wallet collection |
| Tracking / advertising | None |
| Intended audience | Adults, 18 and over |

The public privacy policy, terms, and deletion pages were verified live on 11
October 2026. Apple and Google use individual developer accounts, so no D-U-N-S
number is required. Enter the account owner's exact legal name, public developer
email/phone, and review contact; do not infer those fields from the repository.

## Apple App Privacy

Answer **Yes, we collect data from this app**. For every type below select
**linked to the user**, **not used for tracking**, and **App Functionality** as
the purpose unless the final App Store Connect form requires a more specific
additional purpose.

| Apple data type | Why it is collected |
| --- | --- |
| Name | Account, booking participant, and professional profile |
| Email Address | Client authentication, confirmation, recovery, and support |
| Phone Number | Professional authentication and confirmed-booking contact |
| Physical Address | At-home service delivery |
| Payment Info | Professional settlement account details; version 1 does not collect client card or wallet credentials |
| Other Financial Info | Professional earnings, settlement, and payout records |
| Precise Location | Address pinning, SOS, and professional trip sharing during an active booking |
| Photos or Videos | Professional identity documents, selfie, portfolio, and optional identity evidence |
| Customer Support | Support and safety requests |
| Other User Content | Reviews, report details, service notes, and booking instructions |
| User ID | Account authorization and ownership |
| Device ID | Push notification device registration |
| Purchase History | In-person service bookings, prices, and cash-payment status |

Select **No** for tracking and do not add advertising, third-party advertising,
developer advertising/marketing, or data-broker purposes. Konjo contains no ad
or analytics SDK. Supabase, Expo, SMS Ethiopia, and CARTO are service providers
used for app functionality. Revisit these answers before enabling Chapa or any
analytics SDK.

## Google Play Data safety

Top-level answers:

- Does the app collect or share required user data types? **Yes**.
- Is all collected data encrypted in transit? **Yes**.
- Can users request deletion? **Yes**.
- Account deletion URL: `https://konjoet.com/delete-account`.
- Data shared with other companies or organizations: **No**, provided the
  listed processors remain service providers acting only on Konjo's behalf.
  Client/professional disclosures are user-initiated and expected as part of a
  confirmed booking. Reassess this answer if a provider uses Konjo data for its
  own advertising, profiling, or unrelated purposes.

Declare these collected types:

| Google data type | Required? | Purpose |
| --- | --- | --- |
| Personal info — Name | Required for account use | App functionality, account management |
| Personal info — Email address | Required for client accounts; optional for professionals | App functionality, account management |
| Personal info — Phone number | Required for professionals; optional for email-only clients | App functionality, account management, fraud prevention/security |
| Personal info — Address | Required only when requesting an at-home booking | App functionality |
| Personal info — User IDs | Required for signed-in use | App functionality, account management, fraud prevention/security |
| Financial info — Payment info | Required for professionals who supply settlement details | App functionality |
| Financial info — Purchase history | Required when a user books or provides a service | App functionality, fraud prevention/security |
| Financial info — Other financial info | Required for professional earnings/payout records | App functionality |
| Location — Precise location | Optional permission; required only for address pinning, SOS with location, or active-trip sharing | App functionality, fraud prevention/security |
| Photos and videos | Required for professional verification; optional for other users unless identity evidence is requested | App functionality, fraud prevention/security |
| App activity — Other user-generated content | Optional until the user writes a review, report, support request, note, or instructions | App functionality, fraud prevention/security |
| Device or other IDs | Optional; collected when push notifications are enabled | App functionality |
| App info and performance — Diagnostics | Collected only when a technical request or error is sent to Konjo infrastructure | App functionality, fraud prevention/security |

Data is retained while the account is active. Account deletion removes or
scrubs personal profile, address, device, location, review/report, and private
document data. Pseudonymized booking, financial, and audit records may be kept
when required for legal, accounting, fraud-prevention, or security reasons.

## Google background-location declaration

Use only this core feature in the declaration:

> Konjo lets an assigned beauty or wellness professional share live trip
> progress with the client while travelling to a confirmed at-home appointment.
> Sharing begins only after the professional taps “I'm on my way,” reads the
> prominent disclosure, and grants location permission. The client sees the
> professional's progress on the booking map while Konjo is backgrounded or the
> phone is locked. Sharing stops when the professional arrives, the booking is
> cancelled or completed, or the professional signs out. Location is not used
> for advertising.

The required Android video must be 30 seconds or less and show, in order:

1. The assigned professional opens an accepted booking and taps “I'm on my
   way.”
2. The full prominent in-app disclosure is readable.
3. The Android foreground and background location prompts are shown.
4. Konjo is backgrounded and its visible location-sharing notification is
   shown.
5. The client device shows the professional moving on the active booking map.
6. The professional taps “I've arrived” and sharing stops.

The store description already names trip tracking as a user-facing feature.
Do not submit an iOS recording for this Google declaration.

## Apple review notes

Replace the three `OWNER INPUT` values before submission:

> Konjo is a marketplace for in-person beauty, grooming and wellness services
> delivered at the client's address in Addis Ababa, Ethiopia. Version 1 accepts
> only cash paid directly to the professional after the physical service. The
> app does not sell digital content and does not collect client card or wallet
> credentials.
>
> Client account: `appreview.client@konjoet.com` / password in the account
> owner's secure credential record. Professional account: OWNER INPUT PHONE /
> password in the account owner's secure credential record. Both accounts are
> pre-approved and must work without email confirmation, SMS delivery, manual
> approval, or a real payment during review.
>
> To test location, sign in as the professional, open the assigned accepted
> booking, and tap “I'm on my way.” Read the in-app disclosure and continue to
> the system permission. The client account can then see the professional's
> live trip progress. Sharing stops when the professional taps “I've arrived,”
> the booking ends, or the professional signs out. A demonstration video is
> attached.
>
> To test payment, choose Cash. Confirming the cash method creates no charge;
> cash is due directly to the professional after the service.
>
> Review contact: OWNER INPUT NAME, `info@konjoet.com`, OWNER INPUT PHONE.

## App access for Google review

Choose **All or some functionality is restricted** and provide both stable
accounts from the Apple notes. Explain that the professional account is
already approved and that no OTP or manual approval is required. Include the
same location and cash instructions.

## Content declarations

- Ads: **No**.
- News: **No**.
- Health app / medical advice: **No**; wellness appointments are not diagnosis
  or treatment.
- Financial features: **No**; cash status and professional earnings records do
  not make Konjo a banking, lending, trading, or cryptocurrency app.
- Social / dating: **No**.
- User-generated content: **Yes**, limited to professional portfolios, reviews,
  booking notes, and reports. Report, block, moderation, and support controls
  are implemented.
- Target audience: adults 18+; do not include children in Google target age
  groups and do not select Apple's Kids Category.
- Content rights: Konjo owns or has permission for submitted listing assets;
  users grant the necessary rights for their own portfolio/review content under
  the Terms.
- Encryption export compliance: `ITSAppUsesNonExemptEncryption` is `false`;
  the app uses standard operating-system/HTTPS encryption and no proprietary
  non-exempt cryptography.

## Human evidence still required

These cannot be truthfully completed from source code alone:

1. The individual account owner's exact legal/contact details and public
   developer phone.
2. A stable approved professional review account and password.
3. Release-build testing on physical iPhone and Android devices for email
   confirmation/recovery, push, camera/photos, background location, booking,
   cash completion, report/block, and account deletion.
4. The Android background-location video and final screenshots from the exact
   release candidate.
5. Apple age-rating answers, DSA trader status, agreements, App Privacy
   publication, and final App Review submission in the account owner's UI.
6. Google personal developer-account verification, the USD 25 registration
   action, real-Android-device verification, the required 12-tester/14-day
   closed test, Play declarations, production-access application, and rollout.

Do not mark the release ready to submit until these evidence items are dated
and attached to the exact build selected in each store.
