# Community / Social Layer — Product Audit

Scope: the new major block after Public Coffee Passport Core Journey
(closed — do not revisit). Question asked: how does a personal tasting
experience become part of a community around taste? This is a product
audit first — no social network, feed, likes, comments, followers, or
profiles were assumed going in; every claim below is traced to actual code.

## 1. What already exists (Step 1/2 — traced, not assumed)

| Data | Owner | Visibility | Persistence | Source of truth | Current user value | Potential community value |
|---|---|---|---|---|---|---|
| `checkins` (tasting: rating, guestFlavorProfile, sensoryTags, subDescriptors, defects, liked/disliked/note, brewing method) | The guest who tasted | **Strictly private** — RLS `for all using (auth.uid() = owner_user_id)`, both directions, no open tier. Own comment: "personal tasting history including the barista rating that must stay hidden from the roaster" | Local-first (`journey` store), best-effort Supabase mirror **only for a signed-in guest** (`owner_user_id references auth.users(id)`) | `checkins` table (signed-in), `localStorage` (anonymous or offline) | Personal history + comparison vs. the roaster's own reference (`TasteComparison`) | The obvious candidate — richest, most personal taste data in the whole product, currently 100% isolated |
| `checkins_roaster_view` (anonymized per-row checkin data) | N/A — a view | **Staff-only**, gated by a `profiles` join requiring `auth.uid()` to be the `roaster_admin` of that exact `roaster_id`. Structurally invisible to any other audience, guest included | Read-only, derived from `checkins` | `checkins` | Business analytics (`LotGuestAnalytics.tsx`) | None directly — proves the *pattern* (anonymized view over `checkins`) is safe and already used, but the audience is staff, never a guest |
| `checkins_cafe_benchmark_view` (cross-shop rating leaderboard) | N/A — a view | **Staff-only** (`cafe_admin`), anonymized to rank-only, no `coffee_shop_id` | Read-only, derived from `checkins` | `checkins` | Café benchmarking | Same as above — a working precedent, not itself a guest feature |
| `BrewingRecipe` (enthusiast recipes, `authorType: 'enthusiast'`) | The guest who logged it | **Three-tier, already built**: private draft → `isPublic` opt-in (explicit consent checkbox, default `false`, per-method cooldown) → ranked "🔥 Топ сообщества" (`COMMUNITY_TOP_MIN_NET_VOTES`), all **guest-facing on the Public Passport itself** (`ExtractionTab`) | `recipes` table, public tier readable with no account ("guests browsing a lot need no account") | `recipes` | Personal brew log, optionally shared | **This is the actual, working precedent for "Community around taste" in this exact product** — for brewing, not flavor |
| `CommunityHighlights.tsx` | N/A | **Staff dashboard only** (Roaster/Café/Admin) — a moderation/notification feed of enthusiast-submitted devices and top recipes | Read-only | `recipes`, `equipment` custom devices | Business visibility into community activity | Confirms recipes' community layer is real and active, but this particular view of it is internal, not guest-facing |
| Author identity (`authorName` on `BrewingRecipe`) | — | N/A | — | — | — | **There is no real display-name/profile entity anywhere in this app.** Every call site that sets `authorName` for the current user passes the literal, hardcoded string `"Вы"` ("You"). A guest's own recipe shows as authored by "Вы" to them; nothing renders it differently to anyone else. Confirms: the product has never needed or built named guest identity, even for its one existing community feature |

**Conclusion of Step 1/2**: this product already has a working, guest-facing, opt-in, voted Community layer — for *brewing*. It does not have one for *tasting/flavor*, which is the actual core mechanic of the product (the blind cupping, the roaster comparison, the whole Passport reveal moment). That asymmetry, not a total absence of "community," is the real finding.

## 2. What is the minimal unit of Community here? (Step 3)

Tested against the existing precedent rather than invented from scratch. The recipes system's own minimal unit is **one opted-in `BrewingRecipe` row** — not a person, not a post, not a like on its own (votes exist, but only as a secondary signal on top of a shared artifact). Net votes rank artifacts; they are not a social graph.

Applying the same test to tasting: the natural, already-collected minimal unit is **one `TastingRecord`/checkin** — a guest's blind-cupping result for one Lot, at one point in time. It is not:
- **A person** — there is no profile/identity entity to be "the unit" (§1's `authorName` finding).
- **A post** — a checkin isn't authored as community content; it's authored as a personal record that can *optionally* become visible.
- **A like** — there's nothing to like without a shared unit existing first, exactly as votes only exist on top of already-public recipes.

So the hypothesis in the task's own framing (`User + Coffee + Canonical Lot + Brewing Method + Taste + Time`) is **not quite right as stated** — checked directly against `TastingRecord`'s real shape: there is no `User` component in any community-safe sense (no identity to attach), and `Canonical Lot`/`Coffee` are not part of the checkin row at all — only `lot_id` (the `public_id` text, no FK). The actual minimal unit, provable from the code, is narrower and safer:

**Community unit = one anonymized, opted-in checkin, scoped to a Lot.** No user, no name, no cross-Lot identity — just `{Lot, brewing method, taste result, time}`, exactly the fields `checkins_roaster_view` already proves are safe to anonymize this way, minus the fields that view still exposes only because its audience (the coffee's own roaster) has a legitimate business reason to see close-to-raw data that a stranger-guest audience does not.

## 3. Current identity model (Step 1/4)

- **Anonymous guest**: a per-browser random id (`getOrCreateAnonId()`, `lib/auth/currentUser.tsx`), stored in `localStorage`. Stable across reloads on the *same* browser, gone on a new device or cleared storage. Cannot write to `checkins` at all — `owner_user_id references auth.users(id)`, and an anon id isn't a real `auth.users` row, so every write attempt is rejected (caught, silently kept local-only).
- **Signed-in guest**: a real Supabase `auth.users` id. Only this identity can ever produce a `checkins` row that persists server-side, for anyone (including the guest's own future devices) to read.
- **No profile/display-name entity** for either kind of guest — confirmed in §1.

**This is the single most important constraint on the entire Community Layer**: any feature built on Supabase-persisted `checkins` data is, by construction, built on the subset of guests who signed in. An anonymous guest's tasting can never surface anywhere beyond their own device, no matter what UI is added — not a bug, not something a `localStorage` trick can fix, and explicitly **not something this pass attempted to route around**.

## 4. Privacy / visibility model (Step 4)

Three tiers, checked against real RLS/schema, not assumed:

- **PRIVATE**: a `checkins` row by default. Unchanged, still `auth.uid() = owner_user_id` only, in both directions. No existing personal tasting record was made more visible by this pass — `is_public` defaults `false`, and only ever becomes `true` by the guest's own explicit checkbox action at save time, never retroactively, never for records already saved before this pass (`normalizeRecord` defaults missing/legacy rows to `false`).
- **PASSPORT**: the new tier this pass adds — a checkin the guest explicitly opted into sharing becomes visible **only within this Lot's own Passport page**, anonymously, to any guest (signed in or not — reading requires no account, same tier already established for public recipes), and only *after* that guest's own blind reveal (never shown pre-reveal, so it can never bias a blind read — same placement rule already governing `TasteComparison`).
- **COMMUNITY** (cross-Lot, e.g. a global feed/leaderboard of tasters): **not built**. No evidence this is needed yet, and building it would require solving the identity problem in §3 for real (a meaningful "top tasters" or cross-Lot profile needs an actual persistent, nameable identity) — Category C, below.

## 5. Category A/B/C findings (Step 5)

### Category A — implemented

**A guest's own completed blind tasting is completely invisible to every other guest of the same Lot, with zero mechanism to change that — the one gap that directly contradicts "Community around taste," and the one place the existing recipes precedent transfers cleanly without inventing new identity or social architecture.**

Implemented exactly the recipes pattern, narrowed for the more sensitive data type:
- `checkins.is_public` — new column, default `false`, explicit opt-in only (never automatic, never retroactive).
- `checkins_community_view` — new anonymized view (same "plain view runs with owner privileges" technique already used twice in this schema for `checkins_roaster_view`/`checkins_cafe_benchmark_view`), exposing only `lot_id`, `brewing_method`, `rating`, the four flavor axes, `liked`/`disliked`/`note`, `created_at` — never `owner_user_id`, `coffee_shop_id`, `roaster_id`, any `barista_*` field, `sub_descriptors`, `defects`, or the adaptive milk/drink axes. No RLS policy change on the base `checkins` table at all — the existing strict owner-only policy is untouched.
- Opt-in checkbox in `/passport/[lotId]/taste`'s final step, shown **only to a signed-in guest** (an anonymous checkin never reaches Supabase regardless of this flag — showing the checkbox to an anonymous guest would be a false promise, so it's simply not offered to them, no workaround attempted).
- `CommunityTastingsCard`, rendered on the Public Passport **only after the guest's own reveal**, right alongside `TasteComparison` — a small, anonymous, capped-at-5, newest-first list. Renders nothing when empty (same "don't fabricate" convention as every other conditional card in this codebase).

No k-anonymity threshold was needed (unlike an aggregate-statistics design, which was considered and rejected — see §6): each entry is individually, explicitly consented to by the specific guest who logged it, so there is no indirect-deanonymization risk the way there would be with, say, "the average of N=1 tasters."

### Category B — real improvement, not implemented

1. **Aggregate collective taste profile** (e.g. "the community's average flavor read for this Lot," a crowd-sourced counterpart to `reference_taste_profiles`) — considered first, rejected in favor of the opt-in list: an aggregate computed from a small sample would risk indirectly exposing an individual's own private values (average of 1–2 tasters ≈ their own numbers), and every existing aggregate view in this schema (`checkins_roaster_view`, `checkins_cafe_benchmark_view`) is deliberately staff-only — there's no precedent for a guest-facing statistic derived from personal data without an explicit per-row opt-in, which the shipped design already provides more safely and more simply. Could be revisited later with a real minimum-sample-size policy decision.
2. **A "was this like what I tasted?" comparison between the guest's own read and the community's** — a natural next UI step once enough opted-in data exists per Lot, but there's no evidence yet of adequate sample size to make it meaningful (see §3's identity constraint), so building it now would mostly show "not enough data."

### Category C — needs new identity/social architecture, not implemented

1. **Any feature requiring the anonymous-guest-identity gap to be closed** (cross-device history, a "community score" attached to a person rather than a Lot, "most active taster" recognition, follow/subscribe to a roaster or a taster) — flagged, not routed around with a `localStorage` hack, per the task's explicit instruction. This is the same underlying constraint already noted as Category B in `PUBLIC_COFFEE_PASSPORT_END_TO_END_AUDIT.md` §6.1 (anonymous history is device-local), now shown to block the Community layer too, more directly.
2. **A cross-Lot community feed/leaderboard** (§4's COMMUNITY tier) — needs a real, nameable identity to attach any cross-Lot reputation or ranking to; today's "Вы"-only author label (§1) is adequate for a single person's own view of their own content, structurally inadequate for anything communal beyond a single Lot's page.
3. **Comments/replies on a shared tasting** — the task's own explicit "do not build" list; also would need moderation/identity machinery this pass correctly did not invent.

## 6. What was implemented

- `supabase/migrations/0026_checkins_community_sharing.sql` — new `checkins.is_public` column (default `false`) + new `checkins_community_view`.
- `lib/types/database.ts` — `CheckinRow.is_public`; new `CheckinCommunityViewRow`; registered in `Database.Views`.
- `lib/types/coffee.ts` — `TastingRecord.isPublic`.
- `lib/journey/store.ts` — `normalizeRecord`/`rowToRecord`/`recordToRow` carry `isPublic`/`is_public`; new `CommunityTasting` type + `getCommunityTastingsForLot(lotId)`.
- `app/(site)/passport/[lotId]/taste/page.tsx` — opt-in checkbox (signed-in guests only), wired into `addTastingRecord`.
- `components/coffee/CommunityTastingsCard.tsx` — new, minimal, guest-facing card.
- `app/(site)/passport/[lotId]/page.tsx` — fetches and renders it, post-reveal only.

No change to `Canonical Lot`, `Coffee`/`Green Lot`, `public_id`, lifecycle, café gating, roast profiles/batches, `reference_taste_profiles`, QR, or the existing `checkins` RLS policy. No redesign — one new small card, reusing this codebase's own established conditional-card and opt-in-checkbox conventions verbatim.

## 7. What was consciously NOT implemented

- Aggregate/statistical community taste profile (§5, Category B.1) — a real privacy-policy decision, deferred.
- Cross-Lot feed, leaderboard, or any "top taster" concept (§5, Category C.2) — needs real identity.
- Anything that would give anonymous guests a way to participate that isn't gated by the real account requirement already governing every other Supabase-backed personal store in this app (§3) — deliberately not hacked around with device-local pseudo-identity.
- Comments, likes-on-tastings, follows, notifications, public profiles — never in scope per the task's own instruction; no evidence found that would justify them anyway.

## 8. Validation

**`npx tsc --noEmit`** — passed, no output.

**`npx vitest run`**
```
✓ lib/server/canonicalLot.test.ts (14 tests)
Test Files  1 passed (1)
     Tests  14 passed (14)
```
No new test added — every new function here (`getCommunityTastingsForLot`, `rowToCommunityTasting`) is an unbranched read/mapping, matching this project's established convention of not testing pure I/O plumbing; no new branching logic was introduced anywhere.

**`npm run build`** — passed.
```
✓ Compiled successfully
 ✓ Generating static pages (39/39)
```
`/passport/[lotId]`: 11.5 kB → 11.8 kB. `/passport/[lotId]/taste`: 10.1 kB → 10.3 kB. No route added or removed.

## 9. Regression

- **Passport** — every existing card/section unchanged; the new card is additive, gated `communityTastings.length > 0`, and positioned after `TasteComparison`, never before reveal.
- **Blind Tasting** — the new checkbox is the only addition to the taste flow; it's optional, defaults unchecked, and is entirely absent for anonymous guests (no change to their flow at all). `handleFinish`'s existing validation (`!coffeeShopId || !baristaId || ...`) is untouched — sharing consent isn't a required field.
- **TasteComparison** — zero diff; still reads `lot.roasterFlavorProfile`/`tasting.guestFlavorProfile` exactly as before.
- **History** — `journey`/`checkins` read/write shape is additive-only (`isPublic`/`is_public` defaulted `false` for every existing and legacy record via `normalizeRecord`); nothing about how a guest's own history is stored, synced, or displayed changed.
- **QR** — untouched.
- **Existing Lots** — a Lot with zero opted-in community tastings renders identically to before this pass (`CommunityTastingsCard` returns `null`).
- **Existing users/device identity** — `getOrCreateAnonId`/`reconcileUserScope`/`CurrentUserProvider`: zero diff. The Category C finding (§5.3.1) was deliberately left as a finding, not "fixed" by touching this code.
- **Privacy boundaries** — re-verified directly: the new view exposes only the seven fields listed in §5's Category A entry, for rows where `is_public = true` only; the base `checkins` table's RLS is byte-for-byte unchanged from before this pass.

## 10. Next major product gap

The two real, evidenced Category C items (§5) are the actual next architectural decisions, in order of how directly they block further Community work:

1. **Guest identity beyond an anonymous per-browser id** — the load-bearing constraint underneath *everything* in this block: sign-in adoption, not more UI, determines how much of the Community layer ever has real data to show. Worth measuring (how many checkins are actually signed-in today) before designing anything further here.
2. **Whether "Community" should ever grow a cross-Lot dimension** (a taster's own profile, reputation, or feed) — a real product decision requiring (1) to be solved first, correctly out of this pass's authority to decide unilaterally.
