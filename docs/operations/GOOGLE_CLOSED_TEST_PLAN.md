# Google Play closed-test plan

Prepared: 11 October 2026

## Decision

Run the closed test **before** applying for production access. Konjo's new
Personal developer account must have at least 12 testers opted in continuously
for at least 14 days before the Production application becomes available.
Google's current requirement is documented at:
`https://support.google.com/googleplay/android-developer/answer/14151465`.

The 14-day clock does not replace store review. It is a prerequisite for the
later production-access application. Google Play currently keeps Closed testing
locked until the final Store Listing task is complete.

## Prepared release

- Track: Closed testing
- Release name: `Konjo 1.0.0 (6) – closed test`
- Package: `com.tsedeniya.konjoclient`
- Version: `1.0.0`
- Version code: `6`
- AAB: `store-assets/google-play/Konjo-1.0.0-6.aab`
- EAS build ID: `7b0b6603-9283-40a6-af23-309f5b2332c6`
- Verified SHA-256:
  `72292d2954d078df2f4e716fcd579c377aa9960c3729cbb33a33cec30534e2a5`

Release notes:

> Initial closed test of Konjo's Addis Ababa beauty and wellness marketplace.
> Test client registration and recovery, professional sign-in, discovery,
> cash booking, booking status, notifications, active-trip sharing, reviews,
> report/block controls, and account deletion. Online payments are not enabled
> in this release.

## Before starting the clock

1. Upload the prepared Play icon and feature graphic.
2. Upload the four verified release-build phone screenshots in
   `store-assets/google-play/screenshots/`.
3. Complete the Store Listing and confirm the dashboard shows 11 of 11.
4. Upload the verified build-6 AAB to a Closed testing track.
5. Complete any Location Permissions or foreground-service declaration Google
   requests for that bundle, including the short background-location video.
6. Add tester Google-account email addresses. Recruit at least 15 testers so a
   few dropouts do not put the test below the required 12.
7. Confirm every tester can open the opt-in URL and install from Google Play.

Local preparation completed on 11 October 2026:

- Icon and feature graphic validated at the required dimensions.
- Four genuine Android release-build screenshots prepared at 1080 × 1920.
- The onboarding page-2 Android layout defect found during screenshot capture
  was fixed, rebuilt, and visually verified in the release variant.
- TypeScript typecheck, Expo lint, and the local Android release build passed.

## Tester instructions

Send each tester the Play opt-in link and this message:

> Please opt in with the same Google account used by the Play Store on your
> Android phone. Install Konjo from the Play test page and remain opted in for
> the full 14 days. Please test the assigned checklist, keep the app installed,
> and report the phone model, Android version, steps, expected result, actual
> result, and a screenshot for any problem. Do not enter real card or wallet
> details; this release is cash-only.

Suggested test coverage:

1. Client registration, confirmation, login and password recovery.
2. Professional reviewer-account login without OTP or manual approval.
3. Browse and search services and professional profiles.
4. Create, accept and cancel cash bookings.
5. Test the professional "I'm on my way" disclosure and location permissions.
6. Verify the client active-trip view and the "I've arrived" stop condition.
7. Verify push notifications with the app foregrounded and closed.
8. Submit a review, report content, block a professional and verify restoration.
9. Delete a client and professional account.

## Evidence to retain

- Screenshot of the track's release status and version code.
- Tester list and the date each tester opted in.
- Daily dashboard screenshot showing the opted-in tester count.
- Feedback and defect log, including changes made during the test.
- Physical-device results for the two-account journey.
- The date Google marks the 12-testers/14-days requirement complete.

Do not ask for Production access until the dashboard itself confirms the
requirement is satisfied. Do not remove testers, change the test group, or ask
testers to opt out during the qualifying period.
