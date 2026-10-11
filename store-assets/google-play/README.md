# Google Play release assets

Prepared 11 October 2026 for the Konjo `1.0.0` closed-test release.

## Ready locally

| Asset | Requirement | Status |
| --- | --- | --- |
| `app-icon-512.png` | PNG, 512 × 512, no more than 1 MB | Ready |
| `feature-graphic-1024x500.png` | PNG, 1024 × 500, no more than 15 MB | Ready |
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

## Still required

Capture at least two portrait phone screenshots from the exact release
candidate with no personal data, secrets, mock-only controls, or placeholder
content. Four screenshots at 1080 px or greater on each side are preferred for
Google Play promotional eligibility. Recommended sequence:

1. Client discovery/home.
2. Professional profile and services.
3. Booking date/time and address.
4. Cash booking summary.
5. Active trip map.
6. Professional booking dashboard.

Do not upload or publish the listing until the owner approves the visual assets
and the release screenshots have passed the physical-device test matrix.
