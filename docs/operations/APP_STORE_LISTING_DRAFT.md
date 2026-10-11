# Konjo App Store listing draft

Updated: 11 October 2026

Sync status: the fields represented by `store.config.json` were validated and
synced to App Store Connect on 7 October 2026. This did not submit the app for
review and did not publish the app.

This is working copy for App Store Connect. Recheck it against the final tested
archive and approved business/legal wording before publishing.

## Identity

- App Store name: `Konjo: Beauty & Wellness`
- Installed name: `Konjo`
- Bundle ID: `com.tsedeniya.konjoclient`
- SKU: `konjo-client-ios-2026`
- Primary language: English (U.S.)
- Primary category: Lifestyle
- Secondary category: Health & Fitness
- Copyright: `© 2026 Konjo`

## Product-page copy

Subtitle (30 characters maximum):

> Beauty and wellness at home

Promotional text:

> Discover trusted beauty, grooming and wellness professionals and book care
> at home across Addis Ababa.

Description:

> Konjo brings trusted beauty, grooming and wellness professionals to your
> home in Addis Ababa.
>
> Discover approved professionals, explore services and portfolios, choose a
> convenient time, and follow every booking from request through completion.
>
> With Konjo you can:
> • Browse beauty, hair, nails, grooming, makeup, massage and wellness services.
> • Review professional profiles, services, prices and availability.
> • Save an Addis Ababa service address and request an appointment.
> • See clear booking prices and pay the professional in cash after the service.
> • Follow an assigned professional's trip after they choose “I'm on my way.”
> • Manage bookings, reviews, safety reports and account privacy in one place.
>
> Professionals can apply, submit their services and portfolio, manage booking
> requests, share trip progress for an active appointment and track their work.
>
> Konjo is designed for people aged 18 and over. Availability currently depends
> on supported service zones and approved professionals in Addis Ababa.

Keywords (keep under Apple's 100-byte limit):

> beauty,grooming,wellness,hair,nails,makeup,massage,home service,Addis Ababa

## URLs

- Marketing URL: `https://konjoet.com/`
- Support URL: `https://konjoet.com/`
- Privacy policy: `https://konjoet.com/privacy`
- Account deletion / privacy choices: `https://konjoet.com/delete-account`

Verify every URL publicly from a signed-out browser immediately before
submission.

## TestFlight information

Beta description:

> Test Konjo's complete at-home beauty and wellness booking experience in
> Addis Ababa. Please test client email registration and recovery, professional
> registration, administrator approval, cash booking, live trip
> tracking, notifications, cancellation, reviews, safety tools and account
> deletion.

What to test for iOS build `1.0.0 (7)`:

> This is the production release candidate using the Supabase Edge API and
> cash-only payment. Use the supplied pre-approved professional review account;
> professional SMS registration is not part of this review path. Do not enter
> card or wallet credentials.
> Test with one client and one professional on separate phones.
> Report the role, device/iOS version, exact steps, expected result and actual
> result with each TestFlight screenshot.

Feedback email: `info@konjoet.com`

## App Review notes draft

> Konjo is a marketplace for physical, in-person beauty, grooming and wellness
> services delivered at the client's address in Addis Ababa, Ethiopia. Version
> 1 accepts cash paid directly to the professional after the physical service.
> Konjo does not sell digital content or app functionality.
>
> Client review account: appreview.client@konjoet.com / [password stored in the
> account owner's macOS Keychain as “Konjo App Review Client”]
> Professional review account: [production review phone] / [password or stable
> reviewer OTP procedure]
>
> Both accounts are preapproved and require no manual action. To test live
> location, sign in as the professional, open the assigned booking and tap
> “I'm on my way.” After the disclosure, grant location access. The client can
> then view the professional's trip. Sharing stops at arrival, booking end,
> cancellation, sign-out or account deletion.
>
> Payment testing: choose Cash. No card, wallet or real charge is required for
> review.
>
> Support: info@konjoet.com

Never paste the historical mock OTP or sandbox-payment instructions into the
final App Review notes. Replace the remaining bracketed values using production
review accounts immediately before submission.

## Screenshot set

Capture from the final production build, with no personal or test secrets:

1. Client discovery/home.
2. Professional profile and services.
3. Booking date/time and address.
4. Booking/payment summary.
5. Live trip map.
6. Professional booking dashboard.

Use the exact device sizes requested by App Store Connect at upload time.

## Privacy-answer source of truth

Expected declarations, subject to the final archive/provider audit:

- Contact Info: name, email, phone number, physical address.
- Financial Info: cash-payment status plus professional settlement-account
  details retained for approved future adjustments; version 1 collects no
  client card or wallet credentials.
- Precise Location: booking address and active professional trip location.
- User Content: portfolio/identity photos, reviews, reports and support data.
- Identifiers: user ID and device/push identifier.
- Purchases: booking and payment history.
- Tracking: No, unless the final SDK/provider audit finds cross-company
  advertising or tracking behavior.

Complete every purpose/linkage answer from actual production behavior and
publish the privacy responses only after a final legal/provider review.
