# Google Play release assets

Prepared 11 October 2026 for the Konjo `1.0.0` closed-test release.

## Ready locally

| Asset | Requirement | Status |
| --- | --- | --- |
| `app-icon-512.png` | PNG, 512 × 512, no more than 1 MB | Ready |
| `feature-graphic-1024x500.png` | PNG, 1024 × 500, no more than 15 MB | Ready |
| `screenshots/*.png` | Four genuine release-build phone screenshots, PNG, 1080 × 1920 | Ready |
| `Konjo-1.0.0-6.aab` | Signed Play Store Android App Bundle | Ready locally; intentionally ignored by Git |

The feature graphic was produced with the built-in image-generation workflow
from Konjo's existing `welcoming.png` photography and official app icon. It has
no slogan, pricing claim, device frame, or unsupported product claim.

## Signed bundle identity

- EAS build ID: `7b0b6603-9283-40a6-af23-309f5b2332c6`
- Expo project: `@tsedeniya/konjo-client`
- Package: `com.tsedeniya.konjoclient`
- Version: `1.0.0`
- Version code: `6`
- Build profile: `production`
- Git commit: `f7b5e6582e428837c086542d95352f33109a8441`
- SHA-256: `72292d2954d078df2f4e716fcd579c377aa9960c3729cbb33a33cec30534e2a5`
- Archive verification: `unzip -tq` passed with no errors on 11 October 2026.

## Release screenshots

The screenshots were captured from a local Android release build on 11 October
2026. They contain no entered account data or credentials and were cropped from
the emulator's 1080 × 2400 display to Play-compatible 1080 × 1920 portrait
images without altering the rendered app content:

1. `screenshots/01-beauty-comes-to-you.png`
2. `screenshots/02-choose-client-or-professional.png`
3. `screenshots/03-client-entry.png`
4. `screenshots/04-client-sign-in.png`

The same release validation found and fixed an Android horizontal-scroll layout
issue that collapsed onboarding page 2. The fixed build was recompiled and
visually verified: `welcoming.png` fills the page, `welcome-overlay.svg` remains
in place, and the title, description, location types and action button render.

## Still required

Upload the prepared icon, feature graphic, and screenshots to Google Play;
save the listing; upload the verified AAB to Closed testing; and resolve any
bundle-specific declarations. Do not start the rollout or send changes for
review until the owner confirms the final Play Console action.

Do not upload or publish the listing until the owner approves the visual assets
and the release screenshots have passed the physical-device test matrix.
