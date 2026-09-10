# Coffee Passport — Contextual Taste UX

Design/UX documentation only. No backend, RLS, data model, or architecture was changed to
produce this document. Where existing code was inspected, exact file:line evidence is cited.
Browser: **NOT RUN** (per standing instruction) — compensated by a full source-level trace of
every blind-tasting/reveal/community component actually in production today.

## 1. Executive Summary

Coffee Passport already has the right *mechanism* (blind guess → save → reveal → compare to
the roaster's declared profile) and, per the prior Visual/UX audit, the right *material
language* (cupping-form palette, Fraunces/Inter/IBM Plex Mono, the Q-score seal). What it
does not yet have is the right *meaning* attached to that mechanism. Tracing the actual
current code (not assuming) found something specific and fixable: **there is no literal
"correct/incorrect" wording anywhere in the app today** — but the reveal screen
(`TasteComparison.tsx`) presents a per-axis numeric diff table (`+2`, `-1`, "совпадение")
that functions as an implicit score even without saying so, and it compares only four
abstract numbers (acidity/sweetness/body/bitterness) — the guest's actual chosen words
("клубника," "цитрус") are captured by the app but **never shown or compared anywhere**.
That gap is the real root cause of any "exam" feeling: a bare number inherently reads as
graded; a comparison of the specific words two people used does not.

This document does not propose new architecture. It reframes an existing, working mechanism
around one new fundamental principle — **taste is contextual** — and specifies exactly where,
in words and layout, that principle should become visible: in the reveal screen's structure,
in a moment of explicit philosophy after the first reveal, in a "One Lot — Many Cups" history
view (which, importantly, **already exists in skeleton form** — see §3), and in how the
community layer aggregates other guests' perceptions instead of just listing them.

**Scope discipline, honored throughout**: no Supabase table, RLS policy, or Canonical Lot
relationship needs to change for any of this. Every "Future Data Requirement" in §15 is
called out explicitly as *not yet implemented* and *optional*. This block is documentation +
concept design; no code was changed (see the final report at the end of this document for the
explicit statement and reasoning).

## 2. Core Philosophy

**«Coffee Passport не ищет единственно правильный вкус. Он показывает историю того, как
один кофе раскрывается в разных условиях.»**

This sentence is the product's second foundational principle, alongside the existing "от
зерна до чашки — один прозрачный диалог." Where the first principle is about *transparency of
origin* (where the coffee came from, who made it, how), this one is about *transparency of
perception* (why the same coffee can taste different to different people, in different
places, at different times — and why that's information, not noise).

The philosophy has three consequences that must show up in the product, not just in a design
doc:

1. **The reveal is not a test result.** It's a comparison of two honest, valid readings —
   the guest's and the roaster's — neither of which is "the truth" the other should have
   matched.
2. **Difference is data, not failure.** A guest who tasted red apple where the roaster
   declared citrus hasn't made an error; they've generated one more real data point about how
   this lot actually shows up in the world.
3. **One lot is not one flavor.** The same Canonical Lot, tasted at different times, brew
   methods, and cafés, will legitimately taste different — and the product's job is to make
   that visible as a story, not smooth it over into one averaged "official" flavor.

This does not weaken the Q-score, the roaster's declared reference profile, or provenance
data — those remain real, factual, and worth showing prominently (§14 of the prior Visual/UX
audit already established this). What changes is only what the *comparison* between a guest's
perception and that reference is understood to mean.

## 3. Current UI Assessment

Traced directly from source, not assumed:

- **`app/(site)/passport/[lotId]/taste/page.tsx`** runs a 4-step flow — location → drink →
  taste → barista — with taste asked *before* barista/brew-method detail is even collected,
  specifically so the guest's read isn't primed by knowing the recipe first. This is already
  a contextual-taste-aware design decision, just not yet named or explained as one.
- **`components/coffee/TastingForm.tsx`** (the "taste" step) is a real structured sensory
  form: a 1-5 star rating (the only required field), four flavor sliders (acidity/sweetness/
  body/bitterness), a fixed descriptor picker (`SensoryTagPicker`, 10 categories with
  sub-descriptor drill-down — e.g. "Ягодность" → Малина/Черника/Клубника/etc.), an optional
  defects accordion, and three free-text fields ("что понравилось," "что не понравилось,"
  "заметки"). This is already a rich, specific perception-capture instrument — good raw
  material, currently under-used at reveal time (see below).
- **`components/coffee/BlindTastingLock.tsx`** already frames the pre-reveal state well:
  "Доверьтесь своим рецепторам!" — trust your own senses — with only origin/provenance facts
  visible (never flavor data) until the guest submits their own read. No exam language here
  either.
- **`components/coffee/TasteComparison.tsx`** — the actual reveal/comparison screen, and
  where the philosophy currently breaks down. It header-labels itself "Ваши ощущения vs
  Задумка обжарщика" (your feelings vs. the roaster's intent — already reasonably good
  framing), but then:
  - Shows the guest's personal 1-5 star rating directly beside the roaster's 1-100 Q-Score,
    two structurally different, non-comparable numbers placed adjacently — this invites a
    guest to read "am I close to the official grade," which is exactly the comparison the
    philosophy wants to avoid.
  - Below that, a radar chart overlays "Вы" vs. "Обжарщик" across the same 4 abstract axes,
    followed by a table with a **"Разница" (difference) column showing literal `+N`/`-N`
    values and the word "совпадение"** for exact matches. This is a scored diff table in
    every way except the word "score" — color-coded by sign, structured like a spreadsheet
    comparison. **This is the single component most responsible for any "exam" feeling.**
  - **Critical, previously-undocumented gap**: the guest's actual chosen descriptor words
    (`sensoryTags`/`subDescriptors` — "клубника," "цитрус," etc., collected in step 3 above)
    are captured but **never shown, never compared against `Lot.descriptors`, anywhere in
    this component**. Only the four abstract numeric axes are compared. This means the exact
    interaction described in the brief ("клубника · красное яблоко · шоколад" vs "клубника ·
    цитрус · карамель," with "совпало: клубника") **does not exist today** — it's a real,
    buildable gap, not an architecture change (both fields already exist on the data model),
    just currently disconnected UI.
- **`components/coffee/FarmerRevealCard.tsx`** — a correction to the prior Visual/UX audit's
  "zero imagery" finding: this component contains a genuine custom inline SVG illustration
  (a woodcut-style engraving of a coffee branch in a seal), not a photograph, but real
  illustration work exists here. It's about the farmer/origin reveal specifically, entirely
  separate from the taste-comparison content.
- **`components/coffee/CommunityTastingsCard.tsx`** — a flat, unaggregated list of other
  guests' individual entries (rating, brew method, the same 4 axes as plain text, optional
  liked/disliked notes). No "most common perception," no grouping by brew method, no
  descriptor-tag display. Real content, zero synthesis — a missed opportunity given the
  philosophy's third consequence (§2.3).
- **`app/(site)/journey/page.tsx` + `components/coffee/CoffeeJourney.tsx`** — genuinely
  important finding: **"One Lot — Many Cups" already exists**, just not surfaced from the
  right place. `CoffeeJourney` groups the guest's own tastings Roaster → Lot → individual
  records, letting them expand a specific lot and see every shop/date they tasted it at, with
  a link into a `LotPassportModal` showing all records together. It is two taps deep from the
  main journey page (not reachable directly from the Passport itself), and each row shows
  only shop + relative date — brew method and descriptors only appear once you drill into a
  detail modal. It is framed as a directory ("кофейни и даты"), not a narrative. This needs
  *promotion and reframing*, not invention.

## 4. UX Problems

Classified per the requested severity model — see §Final Report for the consolidated list.
Summary of the mechanism:

- **A — Critical**: the diff-table/radar-overlay structure in `TasteComparison.tsx` functions
  as an implicit score despite no literal exam wording, and the actual descriptor words a
  guest chose are never surfaced or compared — the two things together mean the current
  reveal cannot deliver the philosophy no matter how much surrounding copy is added, because
  its *structure* (a scored table of abstract numbers) contradicts the *meaning* being
  claimed.
- **A — Critical**: personal rating (1-5) and Q-Score (1-100) shown adjacently with no
  explanation of what each measures invites a "how close was I to the right grade" reading.
- **B — Important**: no explanatory/educational layer exists anywhere in the reveal — no
  "this is not an exam" framing, no "possible influences" list, no context (brew
  method/shop/time) shown alongside the comparison itself.
- **B — Important**: Community layer has real data but zero aggregation, so it can't yet
  deliver "12 people tasted this — here's what's common, here's how it varies by method."
- **B — Important**: "One Lot — Many Cups" exists but is undiscoverable from the one place a
  guest would look for it (the Passport / right after a reveal).
- **C — Polish**: visual treatment of the diff table and radar chart (color choice, layout)
  once the underlying structure changes.

## 5. Contextual Taste Model

Three distinct entities, deliberately never merged into one blob of "tasting data":

### A. Coffee Profile
What is known about the coffee itself — Coffee, Green Lot, Canonical Lot, origin, region,
producer, variety, altitude, processing, harvest, Q-grade, roaster, roast intent, roast
profile, the official/reference taste profile, roaster-declared descriptors. This is already
well-represented on the Passport (§4-5 of the prior Visual/UX audit) and does not change here
— it stays factual, roaster-owned, and structurally separate from perception data.

### B. Your Perception
What a specific person actually felt, at a specific moment: aroma, acidity, sweetness, body,
flavor descriptors, aftertaste, intensity, personal notes, the blind guess, the post-reveal
read. **This must never be silently treated as an objective property of the coffee** — it is
"how this coffee opened up for you, right then." All existing `TastingRecord` fields
(`guestFlavorProfile`, `sensoryTags`, `subDescriptors`, `rating`, `liked`/`disliked`/`note`)
already belong to this category and already exist in the schema — no new fields needed for
this layer.

### C. Context
The conditions under which a specific perception occurred: coffee shop, date/time, brew
method, recipe, water, grinder, grind, dose, yield, extraction, temperature, barista, mood/
state, food/drink beforehand, sensory interference, free-form notes. Some of this already
exists on `TastingRecord` today (`coffeeShopId`, `brewingMethod`, `baristaId`, `createdAt`);
most of the deeper context list (grind, dose/yield, water, extraction time, mood/state,
prior food/drink, ambient interference) does **not** exist in the schema yet — see §15.
**Principle, non-negotiable**: Context is always optional and always progressive-disclosure.
A guest who taps four sliders and hits save has completed a full, valid tasting; nothing
below never requires the deeper context fields to exist.

## 6. Blind Tasting UX

The existing 4-step flow (location → drink → taste → barista, in that order, taste-before-
recipe-detail) is already correctly sequenced for contextual-taste purposes and should not be
reordered. What changes is framing and scope, not steps:

- **Keep** the existing `TastingForm` sensory instrument (stars, 4 sliders, descriptor
  picker, free text) as the Guest-level input — it is already appropriately light for a
  casual guest (only the star rating is required; everything else is already optional).
- **Add** one short line above the descriptor picker, shown only the first few times a guest
  does a blind tasting (dismissible/one-time-per-milestone, not repeated forever): *"Опишите
  так, как чувствуете вы — здесь нет правильного ответа."* (See §14 for full microcopy.)
  This is a one-line reframe at the exact moment a guest might otherwise feel they're being
  tested, costing zero new screens or steps.
- **Do not add** a "why are you tasting this" mood/state/context form at this stage for
  Guest-density users — that belongs entirely in the optional, later-accessible Enthusiast/
  Professional layer (§10), never gating the core save action.

## 7. Reveal UX

Four candidate structures were evaluated against the brief's own instruction to choose by UX
clarity, not visual appeal:

- **Variant A (My Perception ↔ Coffee Profile)** — mixing full origin/provenance facts with
  taste perception in one combined view. **Rejected**: this re-merges the two entities §5
  deliberately keeps separate, and risks recreating exactly the "everything at once" density
  problem the prior Visual/UX audit already flagged on dashboard-heavy screens.
- **Variant B (My Cup ↔ Reference Profile)** — narrower, taste-specific, which is what
  `TasteComparison.tsx` already does today. Necessary as the underlying data pairing, but on
  its own — as today's radar+diff-table proves — it degenerates into a scored comparison
  unless it's presented as difference, not as two parallel scored columns.
- **Variant C (Overlap / Difference)** — **recommended as the primary reveal presentation.**
  This is structurally the same underlying data as Variant B, but visually organized around
  *shared* and *different* as two calm, non-hierarchical groups, exactly matching the brief's
  own worked example ("Совпало: клубница. Отличается: красное яблоко/цитрус,
  шоколад/карамель.") There is no "your column" vs. "correct column" — there is a shared set
  and a set of two different, equally valid words sitting next to each other. This is the
  one structure that cannot be read as a scored test, because nothing in it is ordered by
  correctness.
- **Variant D (Timeline / Story of the Cup)** — **recommended as the secondary, complementary
  view**, not the primary reveal moment. A first reveal is not the right moment to show a
  guest a whole history they don't have yet (they've tasted this lot exactly once). Variant D
  is the right structure for §8/§9 (One Lot — Many Cups / Taste History), reached from the
  Passport once a lot has more than one tasting attached to it — including other guests'.

**Recommended reveal structure** (built from data already captured, no new fields required):

1. Shared words first — "Совпало" — descriptor words present in both the guest's picks
   (`sensoryTags`/`subDescriptors`) and the roaster's `Lot.descriptors`.
2. Different words next — "По-разному" — the guest's remaining picks paired loosely with the
   roaster's remaining declared descriptors, shown as two lists side by side with no
   "winner," e.g. "красное яблоко ↔ цитрус."
3. The four numeric axes (acidity/sweetness/body/bitterness) move from the current scored
   diff table into a much quieter secondary visualization — kept, because the data is
   genuinely useful for an Enthusiast/Professional user, but no longer the first or dominant
   thing shown, and never labeled with a raw "+N"/"-N" diff — see §13 for the specific visual
   treatment recommended (a paired dot/range mark, not a spreadsheet cell).
4. One explanatory line beneath, always present: *"Это не экзамен на правильный вкус."*
   followed by the longer explanation from §14.
5. The personal-rating-vs-Q-Score adjacency is removed: the guest's own rating stays with
   their perception; the Q-Score stays where it already lives on the Passport itself
   (`QGrade.tsx`/the seal), not duplicated next to a personal number it isn't comparable to.

## 8. One Lot — Many Cups

This does not need to be invented — it needs to be **promoted**. `CoffeeJourney` already
groups a guest's own tastings by Roaster → Lot → individual attempts, with shop/date per
attempt and a link into a combined `LotPassportModal`. The concrete changes recommended:

- **Surface it directly from the Passport itself**, not only from `/journey` two taps deep.
  Once a guest has revealed their own tasting of a lot, the Passport should show a compact
  "Другие встречи с этим лотом" (other meetings with this lot) module — their own past
  attempts at this exact lot, if any, plus (see §9) an aggregate signal from other guests.
- **Enrich each row** with brew method and a one-line descriptor summary, not just shop +
  date — the row itself should already hint at "this is a different story," e.g. "XO Coffee ·
  эспрессо · утро · ягоды, сладость" rather than just "XO Coffee · 3 дня назад."
- **Reframe the label** from a directory ("кофейни и даты дегустаций") to a narrative frame —
  "История вкуса" (Taste History) is the recommended name (see §14), read as an ongoing story
  the guest is building with this specific coffee, not a log table.

## 9. Community UX

Real, existing community data (`checkins_community_view`, opt-in only, already anonymized —
confirmed architecture from prior blocks) currently renders as a flat list
(`CommunityTastingsCard.tsx`). Recommended aggregation, built only from fields that already
exist (`sensoryTags`, `brewingMethod`, the 4 axes) — no new backend fields required, only new
client-side aggregation logic:

- **"N человек попробовали этот лот"** as a simple count header.
- **"Что чувствуют чаще всего"** — the most frequently picked descriptor words across all
  opted-in community tastings for this lot, shown as the same descriptor-chip visual language
  already used elsewhere (not a bar chart, not a percentage table).
- **"Восприятие меняется по способу приготовления"** — only shown once there is real data
  supporting it (e.g. at least a handful of tastings across at least two distinct brew
  methods) — grouping descriptor frequency by `brewingMethod`. **If the data doesn't support
  this yet for a given lot, the section simply doesn't render** — nothing is ever
  extrapolated or invented from thin data, matching the brief's explicit instruction.
- The individual flat list (existing today) stays, underneath the aggregate — some guests
  will still want to read specific people's specific notes, and that's valuable too; the
  aggregate is additive, not a replacement.

## 10. Progressive Disclosure

Consistent with the already-established "ONE BRAND — THREE DENSITIES" principle
(Guest=LOW, Café=MEDIUM, Roaster=HIGH) from the prior Visual/UX audit, applied specifically
to contextual taste:

- **Guest (default, always)**: star rating, 4 sliders, descriptor picker, free text — exactly
  what exists today, unchanged. Reveal shows shared/different words + the one explanatory
  line. No context form beyond shop/brew method/barista, which already exist in the flow.
- **Enthusiast (one tap deeper, opt-in)**: the quieter secondary 4-axis visualization from
  §7.3, the "possible influences" list (§11) when a real difference exists, the promoted
  "Taste History" for this lot (§8), and the community aggregate (§9).
- **Professional / Roaster / Q-grader (a distinct, explicitly-entered deep-data layer)**:
  full technical detail already established elsewhere (Q-score breakdown, roast curve,
  reference-profile version history) plus — if ever implemented — the deeper context fields
  from §15 (grind, dose/yield, water, extraction), always optional and never required to
  complete a tasting at any density level.

## 11. Reasons for Difference — Known Fact vs. Possible Influence

The brief is explicit and correct: the system must never assert a specific cause for a
specific guest's specific deviation, because it has no way to know which factor actually
applied. The UX model therefore strictly separates two kinds of statement:

- **Known fact** — anything the system actually recorded: brew method, shop, date/time,
  barista (if selected). These render as plain factual context, no hedging language needed
  ("Приготовлено: эспрессо, XO Coffee, вчера вечером").
- **Possible influence** — a generic, non-diagnostic list shown only when a real, non-trivial
  difference exists between perception and reference, always introduced with hedged language
  ("могли повлиять," never "повлияло"): water, grind, extraction, brewing method, equipment
  condition, bean freshness, food or drink beforehand, ambient smells, mood, fatigue, stress,
  individual perception differences. This list is the **same generic list every time** — it
  is never personalized into a claim about what specifically happened to this specific guest,
  because the product cannot know that. See §14 for exact copy.

## 12. Information Architecture

| Screen | Coffee Profile | Your Perception | Context | Comparison |
|---|---|---|---|---|
| Passport (pre-tasting) | Full, visible | — | — | — |
| Blind tasting input | Only non-spoiler facts (existing `BlindTastingLock` behavior, unchanged) | Captured here | Shop/method/barista captured here | — |
| Reveal (first view) | — | Guest's own picks shown | Brief, factual ("as recorded") | Shared/Different words (§7), one explanatory line |
| Reveal (Enthusiast depth) | — | — | "Possible influences" list (§11) | Quiet secondary numeric view |
| Taste History (§8) | — | Every past attempt at this lot | Per-attempt brew method/shop/time | Implicit — the pattern across attempts IS the comparison |
| Community (§9) | — | Aggregate across guests | Grouped by brew method | Most-common-perception summary |

## 13. Mobile UX

Every recommendation above is designed mobile-first, consistent with the prior audit's
finding that the core loop is fundamentally a one-handed, café-table interaction:

- The shared/different word lists (§7) stack vertically on mobile as two clearly-labeled
  chip groups — no side-by-side columns that would force horizontal scrolling or tiny text.
- The quiet secondary numeric visualization (Enthusiast depth) should be a simple paired-dot-
  on-a-line-per-axis (guest's value and reference value as two small marks on one short
  horizontal scale per axis), not a radar chart — a radar chart is genuinely hard to read
  accurately on a small screen and inherently looks like a "score shape," which fights the
  philosophy directly.
- "Taste History" (§8) is a vertical scroll of compact cards, one per attempt, each a single
  tap target — never a table, never requiring horizontal scroll.
- The philosophy statement (§14/§16) appears as a full-width text block with generous
  padding, not a tooltip or small-print line — it should feel like reading a short editorial
  paragraph, not dismissing a disclaimer.

## 14. Visual Direction

Nothing here replaces the direction already established in the prior Visual/UX audit
(warm cupping-form palette, Fraunces/Inter/IBM Plex Mono, disciplined single-purpose color).
This section is only about how the contextual-taste principle specifically should render:

- **Typography**: the shared/different word groups use the same descriptor-chip visual
  language already established elsewhere in the product (consistency, not a new pattern).
  The philosophy statement itself should be set in Fraunces at a deliberately generous size —
  it is editorial content, not a caption.
- **Color**: per the Cropster Cup finding from the prior audit's competitor research (§7 of
  that document), color must **not** be used to imply correctness on the comparison screen —
  no green-for-match/red-for-miss coding. "Shared" and "Different" should be distinguished by
  typographic weight/grouping and spatial position, not hue. The existing `rating` (personal)
  and `gold` (official) colors stay reserved exactly as `DESIGN.md` already specifies —
  neither should ever mean "correct" or "incorrect."
- **Cards**: the reveal screen's shared/different presentation is a natural fit for the
  editorial, label/value card language already used on the Passport — not a new card type.
- **Timeline**: "Taste History" (§8) should read as a vertical timeline of compact moments —
  each attempt a small card with a date, a place, a brew method, and a short descriptor line
  — closer to a diary page than a data table, consistent with the "history, not spreadsheet"
  instruction in the brief.
- **Charts**: the paired-dot-on-a-line treatment (§13) replaces the radar chart for the
  primary reveal view. The existing radar chart component doesn't need to be deleted — it can
  remain available at the Professional/Roaster depth layer where a fuller multi-axis
  comparison is genuinely useful and that audience already reads charts fluently.
- **Motion**: the existing reveal animation (`reveal-rise`/`reveal-fade`) stays; the
  shared/different word groups can use the same restrained, purposeful animation style
  (words appearing in sequence, not sliding/bouncing) — consistent with the "no ambient
  effects" rule already established.
- **Icons/imagery**: no change recommended here beyond what the prior audit already flagged
  (the emoji-vs-custom-icon question remains open and is not specific to this block).

## 15. Microcopy

Real, human, non-academic Russian copy — not placeholders:

**Blind tasting, one-time reframe (shown the first few times, dismissible):**
> «Опишите так, как чувствуете вы — здесь нет правильного ответа.»

**Reveal — the always-present explanatory line:**
> «Это не экзамен на правильный вкус.»

**Reveal — the fuller explanation (Enthusiast depth, or first reveal ever):**
> «Один и тот же кофе может ощущаться по-разному даже в одной кофейне. На чашку влияют не
> только зерно и рецепт, но и вода, помол, экстракция, оборудование, техника приготовления —
> и ваше собственное состояние в этот момент.»

**Section labels for the reveal (Variant C — Overlap/Difference):**
> «Совпало» / «По-разному»

Avoid "правильно/неправильно/верно/угадал" entirely — confirmed nowhere in the current
codebase either, so this is a rule to *keep*, not a fix.

**"Possible influences" list intro (hedged, never asserted as fact):**
> «На восприятие могли повлиять:»
> — вода · помол · экстракция · способ приготовления · состояние оборудования · свежесть
> зерна · еда или напиток перед кофе · запахи вокруг · настроение · усталость · индивидуальные
> особенности восприятия

**"Taste History" section name and intro:**
> «История вкуса»
> «Как этот кофе раскрывался для вас — и для других — со временем.»

**"One Lot — Many Cups" module on the Passport (once more than one attempt exists):**
> «Другие встречи с этим лотом»

**Community aggregate:**
> «N человек попробовали этот лот»
> «Что чувствуют чаще всего»
> «Восприятие меняется по способу приготовления»

**The philosophy statement itself, full form (see §16 for exact placement):**
> «Coffee Passport не ищет единственно правильный вкус. Он показывает историю того, как один
> кофе раскрывается в разных условиях.»

**Mobile-shortened derivative** (used only in secondary/repeated placements, never replacing
the full quote at its primary placement):
> «Не один правильный вкус — история его раскрытия.»

## 16. Where the Philosophy Statement Lives

1. **Primary placement — the first reveal a guest ever completes, product-wide.** Shown once,
   full-width, full quote, set in Fraunces, styled as a short editorial paragraph
   immediately after the shared/different comparison and its explanatory line. This is the
   single highest-leverage moment: it lands exactly when a guest might otherwise be forming
   the "did I get it right" impression, and reframes it before that impression sets.
2. **A dedicated editorial/About section** — not buried in a footer link, but a real,
   reachable page (e.g. from the landing page and from account/settings) titled something
   like "Как мы понимаем вкус" (How we think about taste), where the full philosophy is
   presented as genuine editorial content, not a legal disclaimer.
3. **"Taste History" section intro** (§8/§15) — the mobile-shortened derivative, since this
   is literally the feature that visualizes the philosophy in action; the full quote already
   lives at its primary placement (#1), so repeating it verbatim here would dilute it through
   over-exposure.
4. **After the first reveal only** at full length; subsequent reveals show just the shorter
   always-present line ("Это не экзамен на правильный вкус.") so the experience doesn't feel
   like being lectured on every single tasting — the full philosophy earns its place once,
   memorably, then recedes into a light, recurring reminder.
5. **Never** in a footer, never as small print, never styled as a disclaimer/warning.

## 17. Future Data Requirements

Documented conceptually only — nothing here should be implemented without a separate,
explicit decision. All are optional, Enthusiast/Professional-layer only, never required to
complete a Guest-density tasting.

| Field | Why | Where used | Required? |
|---|---|---|---|
| Grind size | Lets a returning enthusiast correlate their own perception shifts with a recipe variable they control | Context layer, Taste History detail | Optional |
| Dose/yield (or a link to a saved `BrewingRecipe`) | Same as above — `BrewingRecipe` already captures this for recipes; `TastingRecord` has no link to a specific recipe today | Context layer | Optional |
| Water (brand/TDS/temperature at brew) | Same rationale; already exists on `BrewingRecipe`, not on `TastingRecord` | Context layer | Optional |
| Extraction time | Same rationale | Context layer | Optional |
| Explicit time-of-day / session tag | `createdAt` exists but no derived or explicit "morning/evening" tag exists — useful for the "espresso, morning" style Taste History row shown in the brief's own example | Taste History display | Optional (could be derived from `createdAt` without a new field, worth evaluating before adding a new column) |
| Mood/state | Purely subjective, guest-entered context | Context layer (Enthusiast+) | Optional, low priority — real risk of feeling like an overreaching personal-data ask if surfaced too early |
| Food/drink before coffee | Same rationale as mood/state | Context layer (Enthusiast+) | Optional, low priority |
| Ambient sensory interference (smoke, perfume, etc.) | Same rationale | Context layer (Enthusiast+) | Optional, low priority |

Notably **not** on this list, because it does *not* require a new field: comparing the
guest's existing `sensoryTags`/`subDescriptors` against the roaster's existing
`Lot.descriptors` (§7's shared/different structure) — both fields already exist today; this
is a UI/aggregation gap, not a data-model gap, and should be prioritized well ahead of
anything in the table above.

## 18. Design Principles

1. Taste is a reading, not an answer — never structure UI so a personal perception looks
   like it's being graded.
2. Difference is data. Never hide it, never apologize for it, never explain it away as user
   error.
3. Compare words to words before numbers to numbers — descriptor overlap is more human and
   less clinical than a diff table of abstract axes.
4. Known fact and possible influence are never the same sentence. Hedge explicitly whenever
   the system is guessing at a cause.
5. Color never means "correct." Reserve it for what `DESIGN.md` already assigned it, nothing
   more.
6. One lot is a story with a growing number of chapters, not a static card. Every additional
   tasting — the guest's own, or the community's — is a new chapter, not a correction to a
   previous one.
7. Progressive disclosure by density, not by hiding features — a Guest's simpler view isn't a
   crippled version of the Professional view, it's the appropriate view for that audience.
8. Never synthesize a community pattern from too little data. If the aggregate isn't
   supported by real numbers, don't render it.
9. The philosophy earns its place once, prominently, then recedes — repetition without
   restraint turns a memorable idea into an ignored disclaimer.
10. Context is always optional. No tasting should ever require more than a rating to save.
11. A reveal should feel like a conversation completing, not a test being graded — its last
    beat should always be understanding, not a score.
12. New context fields are a future decision, not a default — document the need, don't
    implement it opportunistically.
13. Don't merge Coffee Profile and Your Perception into one view — their separation is what
    keeps "official grade" and "personal experience" legible as two different, equally valid
    things.
14. Community data amplifies the individual guest's story; it never replaces or overrides it.
15. When in doubt, prefer the version of a screen that could not be mistaken for an exam
    result, even by someone skimming quickly.

---

## FOUND

- No literal "correct/incorrect" wording exists anywhere in the current codebase — the "exam"
  risk is structural (a scored diff table, adjacent unrelated numbers), not lexical.
- The guest's actual descriptor words are captured but never compared against the roaster's
  declared descriptors anywhere — the single biggest, most fixable gap found.
- "One Lot — Many Cups" already exists in working skeleton form (`CoffeeJourney.tsx`), just
  undiscoverable from the Passport itself.
- `FarmerRevealCard.tsx` contains real custom illustration (a correction to the prior audit's
  "zero imagery" claim — it's not zero, it's just not photography).
- The community layer has real, usable data with zero current aggregation.

## DECISIONS

- Adopt Variant C (Overlap/Difference) as the primary reveal structure; keep Variant B's
  underlying data pairing; reserve Variant D (Timeline) for Taste History, not the first
  reveal.
- Remove the personal-rating/Q-Score adjacency; keep both, but not next to each other.
- Demote the 4-axis numeric comparison from primary (scored table) to secondary (quiet
  paired-dot view), available at Enthusiast depth.
- Promote "One Lot — Many Cups" onto the Passport itself, reframed as "История вкуса," rather
  than building a new feature.
- Add a strictly generic, hedged "possible influences" list — never a diagnosed cause.
- Add community aggregation (most-common, by-brew-method) built from existing fields only,
  rendered only when data genuinely supports it.
- Place the full philosophy statement at the first-reveal moment and in a dedicated,
  reachable editorial page — never in a footer or as small print.

## A — Critical
1. `TasteComparison.tsx`'s scored diff table (+N/-N, "совпадение") structurally implies a
   graded test regardless of surrounding copy.
2. Guest's actual descriptor words are never surfaced or compared against the roaster's
   declared descriptors — the philosophy's core interaction doesn't exist yet.
3. Personal rating (1-5) shown adjacent to Q-Score (1-100) invites a "was I close to the
   official grade" reading.

## B — Important
1. No explanatory/educational framing exists anywhere in the reveal flow today.
2. Community layer has zero aggregation despite having the data for it.
3. "One Lot — Many Cups" is undiscoverable from the one place a guest would look (the
   Passport, right after their own reveal).
4. No "possible influences" model exists — differences are shown with no interpretive layer
   at all today.

## C — Polish
1. Radar chart visual treatment, once demoted to secondary/Enthusiast depth.
2. Diff-table color/typography, once restructured as shared/different groups.

## PRODUCT PHILOSOPHY

Coffee Passport tells two intertwined stories at once: where a coffee came from (origin,
producer, process — a transparent dialogue from bean to cup), and how it actually shows up in
the world for the people who drink it (a story of contextual, honestly-different perceptions,
not a single correct answer to be graded against). The product's job is never to declare a
winner between a guest's palate and a roaster's — it's to make visible, clearly and without
judgment, that both are real, and that the gap between them is often the most interesting
thing in the cup.

## IMPLEMENTATION

No code was changed in this block. Per the task's own explicit scope guidance (§20/§25 of
the brief: "если для этой задачи достаточно документации и прототипирования — не делай
massовый refactor," and the final-report instruction that commit/push are only needed "если
код изменялся и все acceptance criteria выполнены"), this block was completed as design
documentation grounded in a full trace of the actual current implementation — not
speculation. The specific, scoped changes recommended in §7, §8, §9, and §11 are each small
and buildable individually against existing data (no schema change required for any of
them except the optional, explicitly-deferred items in §17), but implementing them now would
have meant making product-level UI decisions (exact visual treatment of the shared/different
groups, exact aggregation thresholds for community data, exact placement mechanics for a
one-time philosophy reveal) that the brief's own §21/§22 reserve for a separate review step
after this document is read. Recommendation: treat §7 (reveal restructure) and the
descriptor-comparison gap (§3, §Found #2) as the first implementation block once this
document is approved, since it is both the most architecturally simple (no new fields) and
the highest-leverage fix found.

## TESTS

75/75 passing (unchanged — no code was modified, so the existing suite was re-run only to
confirm baseline integrity, not because any change required verification).

## TSC

PASS (unchanged, no code modified).

## BUILD

PASS (unchanged, no code modified).

## BROWSER

NOT RUN (standing instruction — not a blocker; compensated by a full source-level trace of
`taste/page.tsx`, `TastingForm.tsx`, `BlindTastingLock.tsx`, `TasteComparison.tsx`,
`FarmerRevealCard.tsx`, `CommunityTastingsCard.tsx`, `RoastIntentCard.tsx`, `journey/page.tsx`,
and `CoffeeJourney.tsx`, with exact copy and structure quoted throughout this document).

## GIT

No commit/push for this block — no code was changed, matching the brief's own instruction
that documentation-only work does not require one.

## FINAL VERDICT

**PASS WITH NON-BLOCKING NOTES**

All required document sections are present, the philosophical phrase is embedded verbatim in
its correct primary location and explained mechanically (§16), the contextual taste model
(§5), Blind Tasting/Reveal redesign (§6-7), One Lot — Many Cups (§8), Community UX (§9),
progressive disclosure (§10), information architecture (§12), mobile UX (§13), visual
direction (§14), microcopy (§15), future data requirements (§17), and design principles
(§18) are all fully specified and grounded in the actual current codebase rather than
assumption. The "non-blocking notes" are the three A-critical and four B-important findings
listed above — real, but by design deferred to a follow-up implementation block per the
brief's own explicit two-phase instruction (§20: inspect/design first, decide what needs
implementation only after).
