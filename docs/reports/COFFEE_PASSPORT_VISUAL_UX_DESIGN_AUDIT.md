# Coffee Passport — Visual / UX / Product Design Audit

Research + audit only. No code was changed to produce this document, no build/tests/git
were touched, and no design decision below has been implemented.

## 1. Executive Summary

Coffee Passport already has something most products at this stage don't: a genuine,
disciplined design intent, written down in `DESIGN.md` — "a digital cupping/grading ritual
made personal," explicitly rejecting the "beans-and-latte-art" and "coffee-brown-on-cream"
clichés that define almost every competing coffee app. That brief is good. The problem this
audit found is that **the implementation doesn't fully deliver on its own brief**, for two
concrete, fixable reasons (a color-token conflict between two files, and a likely font
Cyrillic-subset gap — see §11–12), and that the product's information architecture hasn't
yet been organized around its four very different audiences (guest, enthusiast, roaster,
café), which external research independently confirms is the single highest-leverage design
problem to solve (§7–9).

There is no shared Button/Card component system, but border-radius and color usage have
stayed disciplined by convention rather than enforcement — a lucky accident worth turning
into a real system rather than a reason to worry. The core Passport screen already follows
its own brief closely (label/value rows, not a card grid; one Q-score seal, not badge
spam). The blind-tasting reveal already uses real, purposeful motion. These are strong
foundations. What's missing is: fidelity to the existing design system (fix the token
conflict before anything else), a resolved position on photography/imagery (currently
zero), a structured progressive-disclosure system so one Passport record can serve a
beginner and a Q-grader without compromise, and a community mechanic that avoids the
gamification traps (Untappd-style rating inflation, hollow badges) that comparable products
have already fallen into.

## 2. Current UI Inventory

**Routes (33 page routes, from `Glob app/**/page.tsx`):**

- **Guest:** `/` (landing), `/scan` (QR/manual code entry), `/passport/[lotId]` (the
  Passport), `/passport/[lotId]/taste` (blind tasting flow), `/journey` (personal history),
  `/journey/cuppings` (cupping journal), `/coffee-kitchen` + `/coffee-kitchen/recipes` +
  `/coffee-kitchen/[coffeeId]` + `/coffee-kitchen/equipment` (home brewing hub), `/recipes` +
  `/top-recipes` (community recipes), `/loyalty`, `/map`, `/shop/[shopId]`, `/coffee/[id]`
  (legacy).
- **Roaster:** `/dashboard/roaster` (catalog), `/dashboard/roaster/new` (creation wizard),
  `/dashboard/roaster/[lotId]/edit` (full edit + roast/taste profile), `/dashboard/roaster/equipment`.
- **Café:** `/dashboard/cafe` (hub), `/dashboard/cafe/add-lot`, `/dashboard/cafe/[lotId]/edit`
  (read-only Canonical Lot + Signature Recipe), plus equipment/team/staff/analytics/loyalty/
  map-profile sub-pages.
- **Admin/Auth:** `/admin` (legacy CRM), `/dashboard/admin` (+`/events`), `/dashboard/barista`,
  `/auth/login`.

No bottom-tab navigation exists anywhere — every surface is a single-column page under a
top nav or hamburger drawer.

**Design tokens** — see §11/§12 for the full breakdown; summary: a `DESIGN.md` design brief
exists (named palette: `ink`/`parchment`/`bark`/`gold`/`moss`/`rating`/`scorch`, each with one
disciplined meaning), implemented in fonts correctly (Fraunces/Inter/IBM Plex Mono via
`next/font/google`, wired through CSS variables) but implemented in **color inconsistently**
— `tailwind.config.ts` and `app/globals.css`'s `@theme` block define the same token names
with different hex values, and one of the two files is missing `moss`/`scorch` entirely
despite both being used across at least six components.

**Components** — no shared `<Button>`/`<Card>` primitive exists anywhere in the codebase
(zero matches for an exported reusable button/card component). Every button/card/form field
is hand-rolled per file. Despite that, a repo-wide grep shows real, convention-driven
consistency: `rounded-md` (112 files) and `rounded-full` (46 files) are essentially the only
two radii in use; `rounded-lg`/`xl`/`3xl` appear zero times. Status badges consistently use
one `border + bg/10 + text` pill pattern with the `moss`/`scorch`/`gold` semantic convention
enforced by comments (e.g. "gold is reserved for 'official' (roaster) content per
DESIGN.md").

**The Passport itself** (`components/coffee/LotPassport.tsx`) matches its own brief closely:
roaster name (small caps, muted) → coffee name (Fraunces, large, tight leading) → centered
Q-score seal (`QGrade.tsx`, rotated, gold-on-parchment) → explanatory line → labeled
origin/flavor sections as `<dl>` label/value rows, not a card grid, exactly as `DESIGN.md`
specifies. **Zero imagery or illustration anywhere in this component** — pure text+data,
a deliberate choice per the brief, but one still worth re-examining now (§15).

**Icons** are emoji throughout (🗺️🏆🧳🍳💳 in `Navbar.tsx`, 🔒 in `BlindTastingLock.tsx`) —
there is no custom iconography or illustration system at all in the product.

**Motion**: real, purposeful CSS keyframe animation exists for the reveal moment
(`reveal-rise`, `reveal-fade`), respects `prefers-reduced-motion` globally, and matches the
brief's stated philosophy ("the seal does a small stamp-down... no ambient effects"). This
is a genuine, already-working strength — see §19.

**Loading/empty states**: no spinners or skeletons found anywhere audited (Passport, roaster
dashboard, journey). The pattern is a `mounted`/`synced` boolean gate that renders nothing
until ready — functionally correct (confirmed in the prior technical audit), but visually
it is an unstyled blank gap, not a designed moment.

**Mobile**: no bottom navigation or bottom sheets anywhere; `Navbar.tsx` collapses to a
hamburger below `md:` opening a right-side slide-in drawer. Forms are hand-built per-page
with no shared input component, so tap-target consistency depends on each author copying
the right className rather than a system guarantee.

## 3. Current Visual Language

The intended visual language (per `DESIGN.md`) is coherent and specific: a cupping-form/
grading-stamp vernacular — kraft sample bags, paper tags, wax-seal stamps — rendered in a
warm near-black/parchment/gold/moss/rating/scorch palette where every color has exactly one
job (gold = Q-score + primary CTA only; moss = origin/fresh-crop; rating = personal
score, deliberately distinct from gold so "official grade" vs. "your opinion" stays visually
legible; scorch = the one warning color). Typography pairs a warm serif (Fraunces) for
display against clean Inter body text, with IBM Plex Mono reserved specifically for "numbers
that mean something precise" — Q-score, altitude, ratings, roast dates, lot codes. This is a
genuinely distinctive, well-reasoned system — not generic, not a template. The risk is
entirely in fidelity of implementation (§11–12), not in the underlying idea.

## 4. UX / Ergonomics Audit

**First impression** (grounded in actual code, not speculation): a screenshot of this
product with no logo reads as "a considered specialty-coffee product," not a generic SaaS
dashboard — the warm palette intent, seal motif, and label/value layout are specific to this
domain. That impression is currently *at risk*, not guaranteed, because of the token
conflict and possible font-subset gap (§11–12): if the wrong values win at build time, the
warm, considered palette collapses into a flatter, cooler one, and if Fraunces/IBM Plex Mono
silently fall back to system fonts for Cyrillic text (nearly all real UI copy is Russian),
the typographic hierarchy the whole plan depends on may not be visible at all in production.
**This is the single highest-priority fix, and it is not a design decision — it's a
production-fidelity bug that undermines a design decision already made.**

**Visual hierarchy** is strong on the Passport itself (a genuine primary/secondary structure:
name → seal → sections) but weakens on dashboard-heavy screens. The roaster lot-edit page
stacks `LotBuilderForm` + `RoastProfileForm` + `BenchmarkRecipeForm` + `CanonicalLotChain` +
`CanonicalLotStatusControl` in one long scroll, each authored independently with no shared
"this is primary, this is secondary" system — every section risks reading as equal weight.

**Density**: appropriate on the Passport (calm, single-column, generous vertical rhythm per
brief); too flat/undifferentiated on the multi-form dashboard pages, where density comes
from stacking independently-designed sections rather than a deliberate information
hierarchy.

**Cognitive load**: the core risk, validated independently by both the codebase audit and
external consumer research (§9), is that a single fixed-depth Passport page cannot serve a
casual guest and a Q-grader at once without either intimidating one or under-serving the
other. This is not yet solved by progressive disclosure in the current implementation — the
Passport shows one level of detail to everyone.

## 5. Mobile Audit

Coffee Passport's most important guest interaction (scan → passport → blind taste → reveal)
is fundamentally a one-handed, often standing-at-a-café-table mobile interaction, but the
current navigation model (hamburger + slide-in drawer, no bottom nav, no bottom sheets) is a
desktop-derived pattern applied to a mobile-first product. External research (§9, Track 1)
confirms bottom navigation remains the ergonomically correct default for exactly this kind of
thumb-driven, single-handed flow (≈75% of phone use is single-thumb).

**What should get larger**: the primary tasting-input controls (flavor/intensity selection)
and the reveal CTA — currently sized like desktop form controls in places (`LotBuilderForm`'s
hand-rolled fields), not touch-optimized.

**What should become a bottom sheet**: the "Где вы пробуете этот лот сегодня?" (location/
shop-selection) step currently gates the whole page — a bottom sheet would let the guest see
the Passport is loading/ready behind it rather than blocking with a full-page state.

**What should be persistent**: nothing currently is, and nothing necessarily needs to be —
but if a bottom nav were introduced for the guest-facing app shell (scan / journey / community
/ profile), it should be persistent only on guest-facing routes, never on roaster/café
dashboard routes (those are desktop/tablet-primary, back-office tools — forcing bottom nav
there for "consistency" would be a mistake per the café/barista research in §9, which
demands near-zero-friction, few-second interactions, not a consistent shell).

**What should disappear on mobile**: nothing structurally wrong was found here — the
hamburger drawer is a reasonable secondary-nav pattern for a page-based app; it just
shouldn't be the primary way a guest moves through the core scan→taste→reveal loop, which
should read as a guided flow, not page navigation.

## 6. Apple-like Principles

Apple's current (2025-26) direction — Liquid Glass, calm surfaces, "explain what's driving
the score" transparency patterns in Health, restrained color, large confident typography —
maps onto Coffee Passport well in *principle* but should not be copied in *material*. The
specific Apple pattern worth adopting directly: the new Health app's Readiness Score doesn't
just show a number, it surfaces *which factors* are driving it (tap to see contributing
inputs). This is precisely the right model for a taste-match score between a guest's blind
perception and the roaster's declared profile — show which specific attributes (acidity,
body, named flavor notes) matched or diverged, not a bare percentage.

Where Apple's actual visual material (glass, translucency, cool neutral surfaces) should
**not** be copied: Coffee Passport's material world, per its own brief, is warm — kraft
paper, cupping forms, wax seals — which is the opposite of Apple's cool, glassy, tech-forward
surface language. Reconciling "Apple-like clarity" with "specialty coffee culture" means
borrowing Apple's *information discipline* (one clear hierarchy, restrained color used only
for meaning, generous whitespace, transparent scoring) while keeping the *material palette*
warm and paper-like, not cool and glass-like. Concretely: adopt progressive disclosure,
score-transparency, and typographic confidence from Apple's playbook; do not adopt frosted
glass surfaces, blue system-accent colors, or SF Pro-style neutral sans-only typography — the
existing Fraunces/Inter/IBM Plex Mono system already does the "confident, disciplined type"
job in a way that's more specific to this brand than Apple's own type system would be.

## 7. Competitor Research

Full findings with citations were gathered across three categories; the most actionable
findings are summarized here (see the research transcript that fed this document for full
detail and every source link).

**Coffee/tasting apps:** Vivino (5-star simplicity over 100-point expert scales; a recent
redesign is being criticized for burying users' own notes in favor of algorithmic
recommendations — a cautionary tale about not crowding out a user's personal record).
Untappd (a Nearby/Global feed solves cold-start community for users with no social graph
yet; extensive badge/gamification system, but independently criticized for producing hollow,
performative check-in behavior and unrealistic rating inflation). Beanconqueror (proof that
a genuinely data-dense, prosumer tool can stay approachable if density is user-customizable
rather than fixed — directly relevant to the roaster dashboard). Filtru (adopted Apple's
Liquid Glass immediately; redesigned its bean journal as a visual "shelf" metaphor; added
accessibility fonts and improved VoiceOver — a bar most coffee apps don't clear). **Cropster
Cup** (professional cupping software) made the single most scientifically-grounded design
decision found in this whole research pass: they deliberately removed color from the cupping
UI because color measurably biases tasters' perception and scoring — directly actionable for
Coffee Passport's pre-reveal blind-tasting screen (§9, §15). **Angels' Cup** is the closest
existing market analog to Coffee Passport's entire core loop (blind sample → guess → reveal
→ compare against both the roaster's official notes and 30,000+ other tasters, a three-way
comparison) — this should be studied directly as prior art, and its three-way comparison
(self/roaster/crowd) is one step beyond what Coffee Passport currently does (self/roaster
only).

**Direct naming/positioning competitors found:** Starbucks already markets a "Traceability
Tool" explicitly described as turning "each bag of coffee beans into a digital passport" —
nearly identical framing to this product's own name and pitch, at enormous scale. A startup
literally named "Hanko: Coffee Passport" is in private testing with a public launch planned
for later 2026, building "roaster stories, tasting notes, and barista profiles." Both are
worth monitoring; neither currently has (per this research) the guest-facing blind-tasting +
community mechanic this product already has.

**Premium consumer apps:** Apple Health/Fitness (score-transparency pattern, see §6). Apple
Music (personalization done well; control relocation done carelessly — a caution about
testing before moving frequently-used controls). Airbnb (a coherent, illustrated icon
language gave a warmth that flat glyphs lack — directly relevant since Coffee Passport
currently has *zero* custom iconography, only emoji). Notion ("warm minimalism" — data-dense
structures surfaced through calm, low-chrome, text-first UI — a good model for presenting the
canonical-lot data model to non-experts). Linear (extreme typographic and color discipline;
a technically rigorous, perceptually-uniform color-token architecture (LCH-based) worth
studying if Coffee Passport wants to fix its token-conflict problem properly rather than
patch it — see §11). Arc (adaptive accent color per content, hide-until-needed chrome —
interesting ideas, though the product itself was discontinued, a reminder that clever
interaction design alone doesn't guarantee survival). Stripe (numerals treated as first-class
typographic citizens — tabular figures, consistent decimals — directly relevant to Coffee
Passport's own IBM Plex Mono "numbers that mean something" philosophy, which is already the
right instinct and should be pushed further, not abandoned).

**Specialty coffee brands:** Onyx Coffee Lab (documentary origin photography paired with
terse, pipe-delimited flavor tags — long-form human story above, compact structured data
below — a strong template for how the Passport's origin section could evolve if photography
is ever added). La Cabra (a lightweight taxonomy layer — "Highlight/Rare/Seasonal/Profile" —
above the raw traceability data, helping users triage without reading everything; directly
adoptable as a badge system distinct from the sensory data). Blue Bottle (a useful negative
example: even a design-forward specialty brand lets its transactional app default to plain
utility while its storytelling lives on the marketing site — a caution to keep Coffee
Passport's café/menu-management screens visually distinct in tone from its origin-story/
tasting screens, not homogenized for "consistency"). Trade Coffee/Bean Box (progressive
preference-refinement loops — quiz or swipe-based onboarding feeding improving
recommendations over time — a pattern Coffee Passport's guest history could eventually feed
into, though this is a future opportunity, not a current gap).

## 8. Specialty Coffee Consumer Research

The consistent finding across app-store reviews, forums, and industry analysis is a real
tension between **pretension and dumbing-down**: coffee tasting language sits in an
uncomfortable gap where even professional vocabulary can read as arbitrary to casual
drinkers, but oversimplifying alienates the enthusiast/expert audience who are the most
engaged users. This is not a hypothetical — it shows up concretely in the closest
comparable products: Beanconqueror's real complaints are about interaction-level friction
(a save button hidden by the keyboard, low-contrast icons), not about its data density being
rejected — density is accepted *if execution is excellent*. Vivino's complaints cluster on
monetization pressure and community note quality degrading into "poetry" when there's no
structure — a caution for any open-ended community notes field. Untappd's sharpest criticism
is that badge/streak gamification produces hollow, performative behavior and inflated
ratings — a specific trap to avoid when designing Coffee Passport's community layer, whose
built-in advantage is that the blind-guess-vs-reveal mechanic has a natural honesty check
(you can't fake matching the roaster's profile) that open star ratings don't have.

**Segmented needs (kept distinct per the brief, not blended into one persona):**

- **Beginner/casual guest**: fast comprehension, no vocabulary gatekeeping, permission to be
  "wrong." Needs a simple, low-jargon tasting input (closer to a slider or a few plain
  choices than an open flavor wheel), and a reveal that frames any mismatch as delightful,
  never as failure. The farm story (a place, a name, a photo) should dominate over technical
  specs for this group — that's what converts a scan into an emotional moment.
- **Enthusiast**: a middle layer — enough structure to build a personal palate history over
  time, without full green-coffee technical depth. This is the audience for the community
  comparison layer and a lighter structured-tagging tasting input.
- **Specialty expert/Q-grader**: full technical transparency — Q-score breakdown by
  attribute, roast curve detail, verifiable chain-of-custody, and — importantly, since this
  audience will specifically scrutinize provenance rigor — explicit sourcing/verification
  metadata (who entered this data, is it self-reported or lab-verified) rather than folding
  everything into the pretty story.
- **Roaster**: minimize duplicate data entry (a named, quantified pain point in adjacent
  roaster-tooling research), and show tangible payoff for the effort of entering data —
  aggregated guest tasting accuracy against their declared profile is the one thing that
  makes ongoing entry feel worth it. Also wants their verified data visually distinguished
  from unmoderated guest content.
- **Café/barista**: the most time-constrained group by far. Whatever a barista does in this
  product (add a lot to menu, confirm a batch, hand over a QR) must be a near-zero-friction,
  few-second action — no forms, no multi-step wizards resembling the roaster's data-entry
  depth.

**Cross-cutting implication**: every audience segment and every trend researched converges
independently on the same architectural answer — **progressive disclosure by role/intent,
not one fixed-depth Passport page** — which resolves the "too nerdy vs. too dumbed-down"
tension seen repeatedly in comparable products, while the blind-guess-then-reveal mechanic
already has real market validation (Angels' Cup) alongside a documented gamification pitfall
(Untappd) to deliberately avoid.

## 9. 2025–2026 Design Trends

Filtered specifically for fit, not listed generically:

| Trend | Fits Coffee Passport? | Where |
|---|---|---|
| Editorial UI (large type, storytelling layout) | **Strong fit** | Passport hero, origin narrative, reveal comparison |
| "Quiet luxury" (restraint, muted color, pacing) | Fits for enthusiast/expert/roaster surfaces; **avoid overdoing for casual guests** (reads as cold/intimidating to exactly the audience that already feels alienated by coffee pretension) | Roaster lot pages, Q-grade displays |
| Glassmorphism/Liquid Glass | **Use sparingly**, not structurally — legibility risk over the photography-rich, warm-paper material world this product wants | A single modal/overlay at most, never the default card surface |
| Bento-box grids | Fits data-dense fact sections | Passport "facts" section below the hero, roaster/café dashboards. **Avoid on the tasting/reveal flow** — that wants linear narrative, not a grid |
| Oversized typography | **Strong fit** for the hero moment (farm name, country, altitude) | Passport hero. Avoid on data needing precision scanning (Q-score breakdowns) |
| Micro-interactions/subtle motion | **Strong fit for the reveal specifically** — this is the one moment in the product that's an emotional payoff, not an informational read | Reveal card flip / match-highlight. Avoid on informational scrolling |
| Narrative-driven data visualization | Fits roast curves and "how your palate compares" | Guest gets one simplified annotated takeaway; roaster gets the full chart — role-based, not one-size |
| Visual storytelling / immersive origin pages | **The category-defining opportunity** — QR→story is already a working, proven pattern in this exact category (Starbucks, Kahawa 1893) | This is where design investment should concentrate most |
| Neumorphism/soft UI | **Avoid** — reads as generic fintech/consumer-tech, clashes with editorial/craft positioning, known contrast/accessibility problems |  |
| Dark mode/adaptive theming | Support technically (café/barista low-light use, late-night roaster use); **don't make it the flagship identity** — the warm/paper material reads better in light |  |
| AI-native/generative UI | **Avoid as a visible, branded feature** — no consumer research signal asks for this; fine only if entirely invisible (e.g. auto-summarizing raw cupping notes into plain language, never announcing itself as "AI") |  |
| Progressive disclosure/contextual UI | **The single most load-bearing pattern for this product** — the direct answer to the four-audience problem | Should be the core organizing principle of the whole Passport, not a feature |
| Bottom navigation | Fits the guest mobile flow | Guest-facing app shell only, never roaster/café back-office |
| Personalized/role-based dashboards | Fits roaster/café tools | Avoid dashboard-y card grids on the guest-facing Passport — that audience needs one focused artifact |

## 10. Information Architecture

Current state: nearly everything is visible at once on every dashboard-heavy screen (the
roaster lot-edit page stacks five independently-built sections; the Passport itself is
better-organized but still single-depth). Recommended reorganization, consistent across
Guest/Roaster/Café:

**PRIMARY** (always visible, zero taps): for Guest — the origin story + Q-score + the
tasting-in-progress state; for Roaster — the lot's current status + catalog visibility +
whether their declared profile has active reference data; for Café — whether a lot is
currently orderable and its stale/discontinuing state.

**SECONDARY** (one tap / one scroll section): for Guest — the flavor comparison detail after
reveal, community aggregate; for Roaster — the full roast-profile/taste-profile editing
forms; for Café — Signature Recipe management.

**ADVANCED** (deliberately behind progressive disclosure): for Guest — full technical sheet
(moisture, density, defect count, exact roast curve, full chain-of-custody); for Roaster —
version history of reference profiles, raw roast-batch log; for Café — analytics detail.

This is not a new architecture invented for this document — it is the same conclusion
independently reached by the codebase audit (visual hierarchy breaking down on stacked
dashboard screens), the trend research (progressive disclosure as the dominant 2025-26
pattern), and the consumer research (the pretension-vs-dumbing-down tension across all five
user segments).

## 11. Color Analysis

**Before any new direction is considered, the existing system has a fidelity bug that must
be resolved**: `tailwind.config.ts` and `app/globals.css`'s `@theme` block define the same
token names (`ink`, `parchment`, `gold`) with materially different hex values (e.g.
`ink-900`: `#1C1410` warm near-black in the config vs. `#1a1a1a` neutral near-black in
globals.css; `gold-500`: `#96692A` vs. `#aa840a`), and `globals.css` is missing `moss` and
`scorch` entirely despite both being used across at least six live components. Whichever
source is actually winning at build time may not be the intentional, warmer palette
`DESIGN.md` describes. This is a build/config question outside this audit's no-code-changes
scope, but it is the single highest-priority item to resolve before any visual work begins —
otherwise a redesign could be built and reviewed against tokens that aren't the ones
production actually renders.

With that fixed, the existing direction (named in `DESIGN.md` as the cupping-form/grading-
stamp palette) is strong and doesn't need replacing — but for completeness, here are the
alternative directions considered and why the existing one wins:

**Direction A — Warm specialty/coffee/natural (current direction).** `ink` #1C1410,
`parchment` #F6F1E7, `bark` #4A3728, `gold` #B8863B (Q-score/CTA only), `moss` #5C6B4F
(origin tags), `rating` #A0522D (personal score), `scorch` #9A3B34 (warning only). This
avoids the "warm cream + terracotta AI-default" trap by giving each accent exactly one job
rather than one blanket brand color — genuinely differentiated, not generic. **Recommended:
keep, fix the fidelity bug, don't replace.**

**Direction B — Apple-like neutral/graphite/white.** Cooler grays, high-contrast black/white,
minimal accent. Would deliver "clarity" but at the direct cost of the specialty-coffee
material world (§6) — this is the wrong trade for a product whose entire differentiation is
craft/origin storytelling, not tech-productivity clarity. **Not recommended** as a primary
direction; its *information discipline* (not its palette) should still be borrowed (§6).

**Direction C — Premium dark/wine/burgundy.** Would read closer to Vivino's category (wine)
than to coffee's own visual vernacular, and risks confusing the product's category signal.
Also works against the paper/cupping-form material metaphor central to the current brief.
**Not recommended.**

**Direction D — Editorial/cream/ink/accent.** This is essentially a variant of Direction A
already — the current palette IS editorial (Onyx Coffee Lab's own visual research, §7, shows
a near-identical warm-neutral-plus-restrained-accent approach winning industry design
awards). **This confirms Direction A rather than replacing it.**

**Recommendation: Direction A, unchanged in concept, fixed in implementation.** The
research found no evidence that a different color direction would out-perform the current
one — the actual gap is fidelity (§11) and application discipline expanding into new UI
(photography treatment, data visualization color for roast curves/community comparisons),
not the palette itself.

## 12. Typography

Current system (Fraunces display / Inter body / IBM Plex Mono for precise numbers) is a
well-reasoned three-way pairing, not a random "make it look nice" choice — it deliberately
makes measured data visually distinct from prose, echoing a lab/cupping-form aesthetic. This
does not need replacing.

**One likely production bug found and worth flagging prominently**: all three
`next/font/google` calls in `app/layout.tsx` specify `subsets: ['latin']` only; none request
`'cyrillic'`. Nearly all real UI copy in this app is Russian. If the requested Google Fonts
files don't bundle Cyrillic glyphs under a Latin-only subset request, every Cyrillic
character falls back silently to the browser's system font — meaning the typographic
hierarchy this whole design plan depends on (Fraunces for coffee names, IBM Plex Mono for
Q-scores) may not be rendering at all for the product's actual real-world content. This needs
verification before any typography decision is finalized, and is a candidate for the very
first fix in any implementation pass, alongside the color-token conflict (§11).

No font pairing change is recommended. One serif for display + one clean sans for body + one
mono for precise data is the right shape for this product; Apple-style pure system
typography (§6) was considered and rejected — it would erase the one thing (Fraunces) that
currently signals "this is not a generic tech product" most strongly.

## 13. Component System

No shared Button/Card/Input primitive exists (confirmed via exhaustive grep — zero exported
reusable components of this kind found). This is real technical/design debt, but the damage
observed today is smaller than it could be, because border-radius (`rounded-md`/
`rounded-full`, two-tier system) and the semantic-color badge convention have both stayed
consistent purely through developer discipline and repeated comments referencing
`DESIGN.md`, not through an enforcing system. This is fragile — it has worked so far because
a small number of contributors have kept the brief in mind, but it will not scale safely
without an actual component library. **Recommendation for the eventual implementation
phase (not this audit): formalize the existing, already-good conventions into real
components (Button, Card, Badge, Input) rather than inventing new ones — the visual language
already agreed on is right, it just needs to be encoded so it can't drift.**

## 14. Product Personality

Three candidate personalities, evaluated against the research above:

**1. Apple × Specialty.** Calm, restrained, transparent-scoring, progressive disclosure,
large confident typography — but rendered in Coffee Passport's own warm palette and Fraunces
serif rather than Apple's cool/glass material. Mood: considered, trustworthy, quietly
premium. Best for: enthusiast and roaster/café surfaces where clarity and information
discipline matter most.

**2. Editorial × Coffee Culture.** Magazine-style origin storytelling (Onyx Coffee Lab's
direction), large photography (if adopted), pull-quote tasting notes, generous whitespace,
warm palette at full expression. Mood: warm, human, story-first. Best for: the Passport hero
and the guest-facing reveal/community experience, where emotional connection matters more
than data density.

**3. Premium Data × Specialty.** The cupping-form/lab-report aesthetic already described in
`DESIGN.md` pushed further — mono numerals everywhere data is precise, a real Q-score/
provenance "instrument panel" feel for the expert/Q-grader audience specifically. Mood:
rigorous, verifiable, trustworthy to a technical audience. Best for: the expert/Q-grader
"advanced" layer (§10) and roaster tooling.

**Recommendation: these three are not mutually exclusive — they map directly onto the
progressive-disclosure layers already recommended in §10.** Personality 2 (Editorial) should
dominate the PRIMARY layer everyone sees first (the story, the seal, the hero). Personality 1
(Apple × Specialty) should govern the SECONDARY layer's interaction discipline (clarity,
transparency, restraint) across all three audiences. Personality 3 (Premium Data) should be
reserved specifically for the ADVANCED layer the Q-grader/roaster audience opts into. This
avoids picking one personality that serves one audience well and the others poorly — which
is exactly the trap the consumer research (§8) warns against.

## 15. Passport Experience

Current structure (hero → seal → origin → flavor profile, per `DESIGN.md` and
`LotPassport.tsx`) is fundamentally right and should not be rebuilt from scratch. What should
change:

**Visually primary**: coffee name + origin place-name + the Q-score seal — this is already
correct.

**Should become secondary (currently equal-weight or over-exposed)**: full technical
provenance detail (moisture, density, defect count, exact lot chain) — move behind
progressive disclosure for the guest default view; keep it one tap away for the enthusiast/
expert layers (§10, §14).

**Should be reconsidered, not assumed settled**: the current zero-imagery policy. It was a
deliberate choice in `DESIGN.md`, and it protects against a real failure mode (inconsistent
photo quality from different roasters undermining a controlled visual system). But the
competitor research (§7 — Onyx Coffee Lab, La Cabra) and the trend research (§9 — visual
storytelling, immersive origin pages) both independently converge on documentary
origin/producer photography as one of the highest-leverage tools for emotional connection in
this exact category. The recommendation is not "add photos" outright, but to treat this as
an open, deliberately-flagged decision for the next design phase: if photography is added,
it should supplement — never replace — the label/value data structure, and should be
optional per-roaster (with a graceful, still-considered fallback for lots with no photo,
rather than forcing every roaster to supply one).

**New addition worth designing deliberately**: the pre-reveal blind-tasting screen should
follow Cropster Cup's validated principle and stay achromatic/near-neutral — no color-coded
flavor categories before reveal, since color measurably biases perception. Color returns
after reveal, for the comparison view specifically, where — per the Apple Health "Readiness
Score" pattern (§6) — a match/mismatch should show which specific attributes drove it, not
just a bare score.

## 16. Scoring

| Dimension | Score /10 | Why |
|---|---|---|
| First impression | 7 | Reads as considered specialty product in code/intent; at risk in production if the token/font bugs (§11-12) are live |
| Modernity | 6 | Sound underlying system, but no shared component library and unstyled loading states read as unfinished |
| Premium feeling | 7 | The seal motif and disciplined single-purpose color usage are genuinely premium ideas |
| Specialty authenticity | 8 | `DESIGN.md`'s cupping-form vernacular is more authentic to the category than any competitor's app reviewed |
| Apple-like clarity | 5 | Information discipline exists on the Passport but not yet on dashboard screens; no progressive disclosure implemented yet |
| UX simplicity | 5 | Passport is simple; roaster dashboard stacks five sections with no hierarchy |
| Information hierarchy | 6 | Strong on Passport, weak on dashboards |
| Mobile ergonomics | 5 | No bottom nav for a fundamentally mobile core loop; hand-rolled forms with inconsistent tap targets |
| Visual consistency | 6 | No enforced component system, but accidentally consistent radius/color conventions so far |
| Typography | 6 (pending verification) | Excellent system on paper; real risk it isn't rendering correctly for Cyrillic content |
| Color | 6 (pending fix) | Excellent, disciplined direction; undermined by an unresolved token conflict |
| Data visualization | 4 | Roast curve exists but no comparison/community visualization yet; no narrative-dashboard treatment |
| Storytelling | 4 | Zero imagery, zero custom iconography — the "from bean to cup, one transparent dialogue" philosophy is not yet visually expressed beyond text |
| Emotional connection | 4 | The reveal moment's motion is a real strength; everything before it is fairly clinical/text-only |
| Community feeling | 4 | Functionally present (per prior technical audits) but not yet visually distinct as a "community" moment — no cold-start feed pattern, no distinct visual treatment from personal data |
| Roaster usability | 6 | Functionally complete (per prior audits) but visually undifferentiated hierarchy across a long form-stack |
| Café usability | 6 | Same — functionally correct, no visual speed/simplicity treatment for the time-constrained barista use case |
| Guest usability | 6 | Core loop works; no progressive disclosure yet means the same view serves everyone identically |
| Accessibility | 6 | Reduced-motion respected globally (real positive); Q-score seal is `aria-hidden` with no text alternative (real gap); emoji-as-icon-system is a mixed bag for screen readers |
| **Overall product design** | **6** | A strong, specific foundation with real fidelity bugs and an unrealized storytelling/imagery/progressive-disclosure layer — closer to "needs focused execution" than "needs a new direction" |

## 17. Market Gap

The clearest gap found across all research: **no competitor combines rigorous origin
traceability with a genuinely social, honesty-checked blind-tasting mechanic.** Enterprise
traceability platforms (TrusTrace, Sourcemap, Bext360/Farmer Connect) are B2B/compliance-
first with thin, map-and-certificate consumer UIs — no tasting or community layer at all.
Consumer tasting/logging apps (Vivino, Untappd, Beanconqueror) have no provenance/
traceability depth. Angels' Cup has the blind-tasting-and-compare mechanic but no ongoing
per-lot traceability system tied to a QR-scannable physical product. Coffee Passport already
occupies the intersection of these three categories that research found no direct competitor
fully occupying — origin depth (roaster/green-lot/canonical-lot chain) + blind-tasting
honesty mechanic + community comparison, tied to a scan-a-real-bag moment. The design
opportunity is to make that intersection *visible* — right now the product's screens don't
yet visually signal "this is the only thing that does all three," because the storytelling/
imagery layer (§15) and the community-distinctiveness layer (§16) are underdeveloped
relative to the functional depth already built.

## 18. Recommended Design Directions

1. **Fix fidelity before evolving direction.** Resolve the color-token conflict (§11) and
   verify the Cyrillic font-subset question (§12) before any new visual work — otherwise a
   new design gets evaluated against tokens/fonts that may not match what production
   actually renders.
2. **Keep Direction A (warm specialty/cupping-form palette) and the existing type system.**
   Research found no stronger alternative; the existing direction is already
   well-differentiated and industry-validated in spirit (Onyx Coffee Lab, La Cabra).
3. **Adopt progressive disclosure as the core organizing principle**, not a feature — PRIMARY/
   SECONDARY/ADVANCED layers per audience (§10), directly resolving the pretension-vs-
   dumbing-down tension every piece of consumer research surfaced.
4. **Concentrate new design effort on storytelling and the reveal moment specifically** —
   this is both the category-defining trend opportunity (§9) and the place where the
   product's actual differentiation (origin depth + honesty-checked tasting) can become
   visible and felt, not just functionally present.
5. **Resolve the imagery question deliberately, not by default.** Either commit to
   optional, high-quality documentary photography per lot (Onyx/La Cabra direction) with a
   considered no-photo fallback, or explicitly keep the pure-text/data approach and invest
   instead in stronger illustrated iconography (Airbnb-style custom icon language) to replace
   the current emoji-as-icon-system — but don't leave this undecided by default, since it's
   currently the single biggest gap between the product's stated philosophy and its visible
   execution.

## 19. Things to Preserve

- The named, single-purpose color system and its underlying discipline (`DESIGN.md`'s
  gold/moss/rating/scorch separation) — this is genuinely better than what most competitors
  do, and should not be replaced with a generic palette.
- The Fraunces/Inter/IBM Plex Mono typographic pairing and its "numbers that mean something
  render in mono" rule.
- The Passport's label/value, form-like structure (not a card grid) — it's the right
  metaphor for this content and already distinct from the generic coffee-app look.
- The existing reveal-moment motion (`reveal-rise`/`reveal-fade`) and its
  `prefers-reduced-motion` discipline — genuinely well-executed already.
- The accidental-but-real consistency in border-radius and badge treatment — worth
  formalizing into real components rather than discarding.
- The blind-guess-then-reveal-then-compare core mechanic itself — validated by market
  precedent (Angels' Cup) and by the honesty-check advantage it has over open star ratings.

## 20. Things to Change

- The color-token source-of-truth conflict between `tailwind.config.ts` and
  `app/globals.css` (technical fix, highest priority).
- Verify/fix Cyrillic font-subset coverage for Fraunces/Inter/IBM Plex Mono.
- Introduce progressive disclosure (PRIMARY/SECONDARY/ADVANCED) across Guest/Roaster/Café,
  replacing the current single-depth screens.
- Replace unstyled blank-gap loading states with a designed loading treatment (even a simple
  one) on at least the Passport and dashboard entry points.
- Decide and commit to a position on photography/imagery (§15, §18.5) rather than leaving it
  as an unexamined default.
- Replace emoji-as-icon-system with either a deliberate decision to keep emoji (fine, if
  chosen consciously) or a small custom icon set, at minimum for the most-used navigation
  icons.
- Formalize the existing accidental Button/Card/Badge conventions into real shared
  components before the app grows further.
- Design the community layer to visually foreground the accuracy/honesty mechanic (guess vs.
  roaster vs. crowd) rather than open ratings or badge-collection mechanics, to avoid the
  Untappd-style hollow-gamification trap.
- Give the reveal comparison score visual "why" transparency (which attributes matched/
  diverged), not a bare match percentage.
- Add a text alternative for the Q-score seal (currently `aria-hidden` with no fallback) —
  a real accessibility gap on the product's single most distinctive visual element.

## 21. Final Recommendation

Coffee Passport does not need a new design direction — it needs **focused execution on the
direction it already chose**, starting with two concrete production-fidelity fixes (color
tokens, font subsets), followed by organizing the existing, already-good visual language
around progressive disclosure for its four distinct audiences, and then concentrating new
design investment specifically on the storytelling/reveal layer where the product's real
differentiation (origin depth + an honesty-checked blind-tasting mechanic that no competitor
combines) can actually become visible and felt. The recommended personality is not a single
pick from Apple × Specialty / Editorial × Coffee Culture / Premium Data × Specialty, but a
layered combination of all three mapped onto the same progressive-disclosure structure
already recommended for information architecture — editorial storytelling first, Apple-like
clarity and transparency throughout the interaction layer, and premium-data rigor reserved
for the expert/roaster layer that actually wants it.
