---
name: Ethiopian Beauty & Home Wellness
colors:
  surface: '#f0fcf8'
  surface-dim: '#d0ddd9'
  surface-bright: '#f0fcf8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eaf6f3'
  surface-container: '#e4f1ed'
  surface-container-high: '#deebe7'
  surface-container-highest: '#d9e5e2'
  on-surface: '#131e1c'
  on-surface-variant: '#404947'
  inverse-surface: '#273330'
  inverse-on-surface: '#e7f3f0'
  outline: '#707977'
  outline-variant: '#bfc8c6'
  surface-tint: '#306761'
  primary: '#00342f'
  on-primary: '#ffffff'
  primary-container: '#0f4c46'
  on-primary-container: '#84bbb3'
  inverse-primary: '#99d1c9'
  secondary: '#7e5700'
  on-secondary: '#ffffff'
  secondary-container: '#ffbe48'
  on-secondary-container: '#714e00'
  tertiary: '#4b2213'
  on-tertiary: '#ffffff'
  tertiary-container: '#663727'
  on-tertiary-container: '#e3a18c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#b5ede5'
  primary-fixed-dim: '#99d1c9'
  on-primary-fixed: '#00201d'
  on-primary-fixed-variant: '#144f49'
  secondary-fixed: '#ffdeac'
  secondary-fixed-dim: '#fcbb45'
  on-secondary-fixed: '#281900'
  on-secondary-fixed-variant: '#604100'
  tertiary-fixed: '#ffdbd0'
  tertiary-fixed-dim: '#fbb6a0'
  on-tertiary-fixed: '#341004'
  on-tertiary-fixed-variant: '#6a3a2a'
  background: '#f0fcf8'
  on-background: '#131e1c'
  surface-variant: '#d9e5e2'
typography:
  display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '600'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  price-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.02em
  price-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system embodies a serene, editorial, and trustworthy atmosphere tailored for on-demand personal grooming and home wellness appointments across Addis Ababa. It reflects contemporary Ethiopian sophistication: calm, discreet, and reliable. 

The aesthetic is built on high-fidelity photography (traditional and contemporary hair braiding, spa treatments, barbers, and skincare) framed by expansive off-white surfaces, hairline structural borders, and deep forest hues. Visual noise is aggressively eliminated to instill immediate calm and trust. 

Key style characteristics:
- **Quiet Luxury & Restraint:** Content and services are foregrounded over interface chrome.
- **Localized Cultural Confidence:** Integrates Ethiopian operational paradigms (localized zones such as Bole, Kazanchis, and Old Airport; dual Amharic/English numeral acceptance; Fayda ID verification trust chips; ETB currency integration) without ornamental clichés.
- **Sentence-Case Humility:** Strictly sentence-case typography across every level. No uppercase shouting or aggressive high-frequency badge colors.

## Colors

The palette relies on a dedicated hierarchy to enforce clarity, hygiene, and calm:

- **Primary Deep Green (`#0F4C46`):** The grounding anchor. Used for high-priority interactive touchpoints, primary appointment actions, primary tab active states, and dominant focal headers.
- **Secondary Saffron (`#E0A32E`):** A strict accent reserved solely for three informational roles: star review scores, verified practitioner markers (e.g., Fayda identity badge fills), and ETB transaction currency sums. It must never be applied to primary CTA surfaces or full-width button fills.
- **Neutral Ink (`#16211F`):** The primary reading color for titles, typography, and primary icons, delivering optimal legibility without the stark harshness of absolute `#000000`.
- **Canvas & Surface System:**
  - Page Background: `#F4F5F3` (a warm, muted linen tone that prevents glare and eye fatigue).
  - Surface Card: `#FFFFFF` (crisp white for distinct visual separation).
  - Hairline Border: `#E1E6E3` (subtle framing boundary for cards, input strokes, and list separators).
  - Muted Copy / Secondary Text: `#5E6C68`.

## Typography

Typography is set exclusively in **Inter** to maintain neutral elegance and maximum rendering clarity on varied mobile displays. 

Implementation Rules:
- **Baseline:** Standard body copy is set to `16px` (`body-md`) with a `24px` line height for effortless readability during discovery.
- **Strict Casing:** All labels, buttons, form headers, and navigation chips must be set in sentence case (e.g., "Confirm appointment", "Book home session"). Never use all-caps tracking.
- **Price Figures:** Use dedicated price styles (`price-lg`, `price-md`) in conjunction with the Saffron accent (`#E0A32E`) or primary ink (`#16211F`), formatted with ISO standard notation: `ETB 1,200`.

## Layout & Spacing

The layout utilizes a mobile-first, single-column fluid card container that transitions cleanly into a constrained 480px column for tablets or desktop viewports, simulating native mobile device intimacy.

Rhythm Guidelines:
- **Outer Margins:** Fixed at `1rem` (16px) on mobile viewports to preserve critical horizontal real estate for salon visual portfolios.
- **Gutters & Gaps:** Horizontal item grids (service carousels, time slot selectors) use a strict `0.75rem` (12px) or `1rem` (16px) gap.
- **Vertical Hierarchy:** Section titles precede content blocks with `space-sm` (8px), while distinct modules (e.g., "Select therapist" followed by "Select time") are partitioned by `space-xl` (32px).
- **Sticky Actions:** Confirmation footers are anchored to the bottom with safe-area padding and a persistent 16px internal padding.

## Elevation & Depth

Visual depth avoids intense, black dropshadows in favor of low-contrast hairline boundaries paired with diffused, organic illumination:

- **Border Hierarchy:** Surfaces rely fundamentally on a `1px` continuous border in Hairline Grey (`#E1E6E3`). 
- **Ambient Elevation (Card Rest State):** Cards resting on `#F4F5F3` use `box-shadow: 0 1px 3px rgba(22, 33, 31, 0.03), 0 4px 12px rgba(22, 33, 31, 0.04)`.
- **Floating Controls (Bottom Sheets & Modals):** Pinned booking drawers and elevated maps use an ambient lift: `box-shadow: 0 -4px 24px rgba(22, 33, 31, 0.08)`.
- **Selected State:** Selected booking slots or wellness packages increase border width to `1.5px` using Primary Deep Green (`#0F4C46`), eliminating harsh shadow pops.

## Shapes

The design system enforces a precise, tailored radius hierarchy keyed off a standard **12px (`0.75rem`)** profile:

- **Primary Cards & Modals:** `rounded-lg` (12px) for booking cards, provider profile thumbnails, and interactive panels.
- **Buttons & Text Fields:** 12px corner radius, matching the card contours for structural consistency.
- **Pills & Indicator Chips:** Full pills (`rounded-full` / 9999px) are permitted only for status markers (e.g., "Home visit", "Salon visit", Fayda verified badges).

## Components

### Buttons
- **Primary Action:** Solid Deep Green (`#0F4C46`) background, pure white (`#FFFFFF`) text, 12px border radius, 48px height, `label-md` weight. Never set in Saffron.
- **Secondary / Outline:** White (`#FFFFFF`) background, `#E1E6E3` hairline border, `#16211F` text. Active state subtly shifts background to `#F4F5F3`.
- **Destructive / Cancellation:** Ghost variant with muted crimson text (`#9E2A2B`), no background, sentence-case.

### Chips & Badges
- **Fayda Verified Chip:** `#FFFFFF` background, `#E1E6E3` border, containing an `#E0A32E` verified seal icon followed by "Fayda verified" in `label-sm` (`#16211F`).
- **Location Selector Chip:** Pill-shaped, light neutral fill (`#FFFFFF`), displaying the Addis Ababa sub-city (e.g., "Bole Atlas", "CMC", "Sarbet").
- **Rating Chip:** Transparent or light card fill, showing an `#E0A32E` star followed by rating (e.g., "4.9") in `#16211F`.

### Input Fields
- **Container:** Height 48px, background `#FFFFFF`, border `1px solid #E1E6E3`, radius 12px, padding `0 16px`.
- **State Changes:** On focus, border transitions to `1.5px solid #0F4C46` with zero outer ring or halo. Placeholder copy in `#5E6C68`.

### Booking & Specialist Cards
- **Structure:** `#FFFFFF` card surface, `1px solid #E1E6E3`, 12px border radius, 12px internal padding.
- **Layout:** Left-aligned 72x72px rounded (8px) practitioner image, followed by name (`headline-sm`), service specialty (`body-sm`), Fayda chip, and bottom alignment featuring the rate (`price-md` in `#0F4C46` or `#E0A32E` for highlights) and localized travel zone tag.

### Date & Time Slots
- **Rest:** `#FFFFFF` surface, `1px solid #E1E6E3`, 12px radius, centered time format (e.g., "10:30 am").
- **Selected:** `#0F4C46` solid background, `#FFFFFF` text, border color `#0F4C46`.
- **Unavailable:** Muted background (`#F4F5F3`), text `#5E6C68` at 50% opacity, border none.