# Design Plan — Coffee Passport

## Grounding
Subject: a digital cupping/grading ritual made personal. Specialty coffee already has its
own visual world — cupping score sheets, kraft sample bags, grading stamps, paper tags tied
to burlap. That vernacular is the design material here, not a generic "coffee shop" mood
(no beans-and-latte-art clichés, no coffee-brown-on-cream template).

## Signature element
The **Q-score seal**: a circular stamp (like a wax seal / inspector's stamp on a cupping
form), rendered in gold monospace numerals on a hairline-ringed circle, slightly rotated.
It appears once per passport, is never reused as decoration elsewhere, and it's the one
place gold appears at full saturation. Everything else stays quiet so this reads as an
event, not a badge.

## Palette (named, not default)
- `ink` #1C1410 — roasted-bean near-black; primary text and dark surfaces
- `parchment` #F6F1E7 — cupping-form paper; primary light background
- `bark` (ink-500) #4A3728 — secondary text, muted labels
- `gold` #B8863B — the seal accent; used ONLY for Q-score + primary CTA, nowhere else
- `moss` #5C6B4F — origin/fresh-crop tags, quiet secondary accent (not gold, not red)
- `rating` #A0522D — personal-rating accent, deliberately distinct from `gold` so the
  Q-score vs. user-rating distinction (the core product idea) is visually reinforced

This deliberately avoids the near-universal "warm cream + terracotta" AI-default — parchment
reads as paper/form rather than a lifestyle-brand cream, and gold/moss/rating triangulate
the app's three-quality-signals concept instead of one blanket accent.

## Type
- Display: **Fraunces** (variable, warm ink-trap serif with real character at large sizes) —
  used with restraint, only for hero headline, coffee names, and section titles.
- Body: **Inter** — clean, high-legibility UI text.
- Utility/mono: **IBM Plex Mono** — all *numbers that mean something precise* (Q-score,
  altitude, ratings, roast dates, lot codes) render in mono. This is deliberate: it makes
  the measured/graded data visually distinct from prose, echoing a lab or cupping form.

## Layout concept
Mobile-first, single-column, generous vertical rhythm. The passport page is structured like
a physical passport/cupping form: a header block (roaster + coffee name), a stamped seal
(Q-score), then labeled data rows (not a card grid) — because passports and grading sheets
are read top-to-bottom as a form, not scanned as tiles.

```
┌────────────────────────┐
│  ETHIOPIA GUJI          │ <- Fraunces, large
│  XO COFFEE              │ <- bark, small caps
│                         │
│      ( 87.0 )           │ <- gold seal, mono, rotated -2deg
│    Q-SCORE · SPECIALTY  │
│                         │
│  Origin ─────────────── │ <- hairline rule, eyebrow label
│  🇪🇹 Ethiopia · Guji     │
│                         │
│  Coffee details ─────── │
│  Producer     ...       │ <- label/value rows, mono values
│  Variety      ...       │
│  ...                    │
│                         │
│  Flavor profile ─────── │
│  🍑 🌸 🍋 🍯 chips        │
│                         │
│  Your experience ────── │
│  [ I TRIED THIS COFFEE ]│ <- gold primary button
└────────────────────────┘
```

## Motion
Minimal, purposeful only: the seal does a small stamp-down scale+fade on first render of the
passport page (once, ~250ms), and rating stars fill with a quick sequential pop. No ambient
or scroll-triggered effects — the content is inherently calm and shouldn't compete with it.

## Self-critique
Cut: initial idea had a rotating "coffee bean" loading spinner — too decorative, removed.
Cut: numbered 01/02/03 section markers — the sections aren't a sequence, so dropped in favor
of plain labeled dividers. Kept the seal as the one bold risk; everything else stays disciplined.