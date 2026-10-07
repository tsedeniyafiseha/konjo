# Konjo TestFlight release-candidate plan

Updated: 7 October 2026

## Current internal build

- App Store name: **Konjo: Beauty & Wellness**
- Bundle ID: `com.tsedeniya.konjoclient`
- Version/build: `1.0.0 (1)`
- EAS build: `e5be1e18-3e2b-4efd-9c33-3d23f5d8b195`
- TestFlight group: `Team (Expo)`
- Internal testers: `konjoserve@gmail.com`, `tsedeniyafisehaw@gmail.com`
- Environment: preview only
- Professional registration code: `247124`

Build 1 uses the preview Render API, mock professional OTP, and sandbox
payment. It must not be submitted to App Review.

## Install

Each tester must install Apple's TestFlight app, open the invitation email on
the iPhone, accept the invitation, and install Konjo build 1. Record the iPhone
model and iOS version below before testing.

| Tester | Device / iOS | Invitation accepted | Build installed |
| --- | --- | --- | --- |
| Account Holder |  | [ ] | [ ] |
| Admin |  | [ ] | [ ] |

## Test accounts

Use different identities for the client and professional. Do not reuse an
email or phone number that belongs to an existing role.

| Role | Test identity | Result |
| --- | --- | --- |
| Client | Record the new email in the private test log | [ ] |
| Professional | Record the Ethiopian phone number in the private test log | [ ] |
| Admin | Existing authorized administrator | [ ] |

Never commit passwords, email-link tokens, payment credentials, identity
documents, or exact home locations to this repository.

## Pass sequence

Run the sequence in order. Stop on a blocker and attach a TestFlight screenshot
with a short description of what was expected.

### 1. Installation and first launch

- [ ] Cold launch succeeds without Metro, Expo Go, or a development computer.
- [ ] Splash and all welcome screens render correctly.
- [ ] The second welcome screen uses the approved welcoming image and overlay.
- [ ] Role selection works.
- [ ] English and Amharic layouts remain readable on the smallest test iPhone.
- [ ] Privacy and terms sheets scroll smoothly and accept on the first attempt.

### 2. Client authentication

- [ ] Create a new client with an unused email address.
- [ ] Confirmation email arrives from the Konjo sending domain.
- [ ] Opening the newest confirmation link on the same iPhone returns to Konjo.
- [ ] Sign-in succeeds after confirmation.
- [ ] Wrong password, malformed email, existing email, and unavailable service
      each show understandable user-facing messages.
- [ ] Password-reset email arrives; the newest link opens Konjo and accepts a
      new password once.
- [ ] Expired or reused links show the recovery fallback instead of a raw error.
- [ ] Sign-out and sign-in with the new password both work.

### 3. Professional registration

- [ ] Enter a valid Ethiopian mobile number not used by another Konjo role.
- [ ] Use preview verification code `247124` within five minutes.
- [ ] All name, contact, password, profile, payout and service fields remain
      visible above the keyboard and the form scrolls to the focused field.
- [ ] Camera and photo-library permissions have clear context.
- [ ] Portfolio and verification uploads complete.
- [ ] Terms/privacy acceptance works on the first completed read.
- [ ] The submitted application appears in the administrator review queue.
- [ ] Approve the professional and confirm the professional sees the new state.

### 4. Marketplace and booking

- [ ] The approved professional appears to the client with the correct profile,
      services, prices, portfolio and Addis Ababa zone.
- [ ] Search/category filtering works and an empty result is understandable.
- [ ] Client saves an Addis Ababa address and the map pin matches the selection.
- [ ] Client chooses service, date/time, location and payment method.
- [ ] Booking request appears for the professional.
- [ ] Professional accepts; both sides receive the expected state update.
- [ ] Preview checkout completes without collecting real payment credentials.
- [ ] Duplicate taps and reopening the app do not duplicate the booking/payment.

### 5. Live trip and completion

- [ ] Professional taps **I'm on my way** and sees the disclosure before
      background location begins.
- [ ] Client sees the professional move on the Addis Ababa map.
- [ ] Tracking continues with the professional app backgrounded and phone
      locked, within iOS permission limits.
- [ ] **I've arrived** stops active travel sharing.
- [ ] Completion, final payment state, receipt and review all work.
- [ ] Location is no longer shared after arrival, completion, cancellation,
      sign-out or account deletion.

### 6. Notifications, safety and lifecycle

- [ ] Booking notifications arrive with Konjo open, backgrounded and closed.
- [ ] Tapping a notification opens the correct booking.
- [ ] Reschedule and cancellation paths update both users.
- [ ] Report, block and SOS flows show the correct confirmation and admin data.
- [ ] Client and professional account deletion complete from inside the app.
- [ ] Slow network, airplane mode and Render cold start show recoverable errors.
- [ ] No secrets, raw provider messages, stack traces, or developer controls are
      visible in the release build.

## Defect rule

Record each issue with build number, role, device/iOS, exact steps, screenshot,
expected result and actual result. Fixes require a new build number and a
repeat of the affected flow plus the installation/authentication smoke tests.

## Exit criteria for the production release candidate

- [ ] Both testers have installed the same build.
- [ ] The complete two-account booking journey passes on physical iPhones.
- [ ] Email confirmation and password recovery pass using delivered email.
- [ ] Closed-app push and background location have physical-device evidence.
- [ ] No open crash, authentication, payment, privacy, deletion or safety defect.
- [ ] Production API, real SMS, Chapa, refunds and payouts are operational.
- [ ] App Store metadata and privacy answers match the final archive.
- [ ] The final production build is retested; only that exact build is selected
      for App Review.
