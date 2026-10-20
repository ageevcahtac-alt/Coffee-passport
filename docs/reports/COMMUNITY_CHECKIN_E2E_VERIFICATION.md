# Community Check-in — End-to-End Verification

Scope: verify the Community Check-in flow shipped in
`COMMUNITY_LAYER_PRODUCT_AUDIT.md` as a real user scenario — actual code,
actual Supabase schema/RLS/view text, actual UI — not a re-derivation from
memory. No new social features added. Canonical Lot architecture, Public
Passport core, `reference_taste_profiles`/`reference_roast_profiles`/
`roast_batches`, café gating, and QR were not revisited.

## 1. Guest tasting → consent (traced in `app/(site)/passport/[lotId]/taste/page.tsx`)

Flow: `location → drink → taste → barista` (unchanged step order) → consent checkbox → `handleFinish` → `addTastingRecord`.

- **Checkbox shown only where a Supabase write is actually possible**: gated on `isAuthenticated` from `useCurrentUser()`, which is resolved from `app/(site)/layout.tsx`'s `supabase.auth.getUser()` — a real, server-verified session, not a client-trusted flag. Confirmed the checkbox is entirely absent from the JSX for an anonymous guest (no dead/disabled checkbox, no misleading partial UI).
- **No false sense of publication for anonymous/local-only tastings**: an anonymous guest's `checkins` insert is rejected by the `owner_user_id references auth.users(id)` FK regardless of any flag — confirmed this is unconditional and pre-existing, not something the checkbox could bypass or promise around, and the checkbox simply isn't offered to that guest.
- **Consent is explicit opt-in**: `shareWithCommunity` state defaults `false`; `isPublic: isAuthenticated && shareWithCommunity` computed at save time, never inferred from anything else.
- **No consent = private**: verified end to end — `TastingRecord.isPublic → CheckinRow.is_public → checkins.is_public` (`default false`), and the DB migration backfills every pre-existing row to `false` (`add column ... not null default false` applies the default to existing rows too) — no historical tasting was retroactively made public.
- **No unexpected duplicates from the consent flow itself**: the checkbox only sets one boolean field on the single record `handleFinish` already builds — it does not trigger a second write, a second record, or any new insert path. (General double-submit risk on the "Сохранить" button itself is pre-existing, unrelated to consent, and out of this verification's scope — not introduced or changed by this feature.)
- **No functional change for a guest who doesn't publish**: for an anonymous guest, the screen is pixel-for-pixel what it was before (checkbox doesn't render). For a signed-in guest who leaves it unchecked, `isPublic` resolves to `false` — identical downstream behavior (own history, own `TasteComparison`) to before this feature existed. The only difference visible to a non-sharing signed-in guest is the presence of one more optional, unchecked-by-default control on the final step.

## 2. Blind tasting — no premature leak

Checked the actual render tree in `app/(site)/passport/[lotId]/page.tsx`, not just the data-fetching code:

- `communityTastings` is fetched (`getCommunityTastingsForLot`) in a `useEffect` keyed only on `lot?.id` — it runs as soon as the Lot resolves, **before** the guest has necessarily completed their own tasting. This mirrors the exact same pattern already used for `roastIntent`/`latestRoastProfile` (also fetched pre-reveal, also only rendered post-reveal) — consistent with, not a new deviation from, this codebase's established approach.
- **Rendering**, however, is confirmed strictly gated: `CommunityTastingsCard` appears only inside the final `return` block, which is only reached when `latestTasting` is truthy (line ~415 onward) — i.e. after the guest's own blind tasting for this Lot at this shop is already saved. It is **not present** in the `BlindTastingLock` branch (no `latestTasting`) at all — confirmed by reading that branch's JSX directly, no reference to `communityTastings`/`CommunityTastingsCard` anywhere in it.
- **Does not affect `BlindTastingLock`**: its own props/behavior are unchanged by this feature; it still receives `displayLot` (fixed in the prior end-to-end pass) and renders the same "Базовые данные" + lock message, with zero knowledge of community data.
- **Does not reorder the existing flow**: `CommunityTastingsCard` is inserted after `TasteComparison` and before "Ваша дегустация," an additive slot — every existing card before and after it keeps its exact position.
- **Canonical/`displayLot` consistency, checked specifically as asked**: `CommunityTastingsCard` never renders origin/producer/roast data at all (only rating, brewing method, flavor axes, liked/disliked/note, date) — there is no Coffee-overlay field for it to get right or wrong. The one place `lot` is used for this feature is the *fetch key* (`getCommunityTastingsForLot(lot.id)`), and `withCanonicalCoffeeOverlay` never modifies `.id` (only country/region/process/cropYear/producer) — so `lot.id === displayLot.id` always, structurally, regardless of overlay state. No divergence is possible here by construction, not just by observation.
- **Other guests' check-ins are not a hint before they're allowed to be one**: the only content in a community entry is a rating, brewing method, the four flavor axes, and free-text liked/disliked/note — no roaster-authored descriptor, origin, or producer data is duplicated into it, so it cannot function as a proxy spoiler for the parts of the Passport that are still correctly gated (`RoastProfileSummaryCard`, `RoastingTab`, `RoastIntentCard` — all still separately, correctly gated to post-reveal, unchanged).

## 3. Privacy / RLS — verified against actual SQL, not just TypeScript

Read `supabase/migrations/0026_checkins_community_sharing.sql` character by character, cross-referenced against the two already-in-use precedents in this same schema (`checkins_roaster_view`, `checkins_cafe_benchmark_view`):

- **PRIVATE check-in**: base table RLS — `create policy "owner manages own checkins" on public.checkins for all using (auth.uid() = owner_user_id) with check (...)` — is **byte-for-byte unchanged** by migration 0026 (confirmed: the migration contains no `alter policy`/`drop policy`/new policy statement on `public.checkins` at all, only `alter table ... add column` and a new, separate view). A private check-in therefore: remains visible to its owner exactly as before; is excluded from `checkins_community_view` by that view's own `where c.is_public = true` clause; remains inaccessible to any other user (anonymous or signed-in) via the base table, exactly as before.
- **PUBLIC (opted-in) check-in**: only reachable by the guest's own explicit action at save time (§1). `checkins_community_view` selects exactly nine columns (`id, lot_id, brewing_method, rating, acidity, sweetness, body, bitterness, liked, disliked, note, created_at`) — no `owner_user_id`, `coffee_shop_id`, `roaster_id`, `barista_id`, `barista_rating`, `barista_note`, `sub_descriptors`, `defects`, or drink/milk axes exist on the view at all, not merely hidden client-side (same "columns don't exist on this view, period" guarantee this schema already documents for `checkins_roaster_view`). No name, no id-that-maps-to-a-person, nothing a client could join back to an identity. **Author is not turned into a fake profile/entity** — confirmed no such field was added anywhere in this pass; the UI's only identity claim is the literal, static copy "сообщество... анонимно," matching the one identity contract this app already has (the "Вы" placeholder — no persistent name is manufactured for anyone).
- **The RLS-bypass mechanism itself**: `checkins_community_view` is a plain view (no `security_invoker`), which in this Postgres version runs with its **owner's** privileges for row visibility — the identical, already-relied-upon mechanism `checkins_roaster_view`/`checkins_cafe_benchmark_view` use (both migrations' own comments state this explicitly). This is not a new technique introduced without precedent; it's the third application of one already reviewed twice.
- **Grant surface**: `grant select on public.checkins_community_view to anon, authenticated;` — read access needs no account, matching the "guests browsing a lot need no account" tier already established for public recipes. No grant was added to the base `checkins` table itself.
- **Honest limitation on this verification**: this was checked **statically** — reading the exact policy/view/grant text and reasoning from the two working precedents already in this schema. This sandbox has no service-role key or direct Postgres connection (the same constraint every migration in this repo's history has stated, e.g. `0010_cafe_lot_benchmark_view.sql`'s own comment: "I cannot apply this one myself... Apply via the Supabase SQL Editor"), so **migration `0026` has not been executed against any live Supabase project by this session, and its actual runtime behavior has not been confirmed by a live query.** It must be applied the same manual way every other migration in this block was, before this feature does anything in production. This is a process fact, not a defect — flagged explicitly per the instruction not to call this "safe" on TypeScript alone.

## 4. Community on Public Passport

- **Same visual surface family as community recipes**: reuses this codebase's existing card/list conventions (`rounded-md border border-ink-200 bg-parchment-100 p-5`, `section-label`, per-entry `border-t border-ink-100` separators) — the same idiom `CommunityHighlights.tsx`'s recipe list and every other card on this Passport already use. No new design system, no new layout primitive.
- **Sorting**: `getCommunityTastingsForLot` orders `created_at desc` — newest first, matching every other "recent activity" list in this app (`CommunityHighlights`' own `FEED_LIMIT`-capped feeds, `RoastingTab`'s "newest first" batches).
- **No private records**: guaranteed at the DB view level (§3), not just by client-side filtering.
- **No identity leak**: confirmed in §3 — no field exists to leak.
- **Strictly scoped to one Canonical Lot**: `.eq('lot_id', lotId)` in the client query, using `lot.id` (the `public_id` — the same key `journey`/`checkins.lot_id` already use everywhere else, e.g. `TasteComparison`'s own `journey.filter(record => record.lotId === lot.id)`). No Canonical Lot UUID lookup was introduced for this feature — deliberately decoupled from that chain, per the instruction not to touch it.
- **No cross-Lot mixing**: `public_id` is generated server-side against the full existing set (`generatePublicLotId`), so no two Lots can collide; the filter is exact-match on that guaranteed-unique key.
- **Taste data rendering — found and fixed (§5)**: the card originally omitted the four flavor axes despite fetching and typing them.
- **Empty-state behavior**: `CommunityTastingsCard` returns `null` when `tastings.length === 0` (and the Passport page additionally gates the wrapper on the same condition) — a Lot with zero opted-in tastings renders exactly as it did before this feature existed, no "nothing shared yet" placeholder invented where the rest of this codebase's convention (e.g. `RoastIntentCard`, `getActiveReferenceRoastProfile`) is to render nothing rather than announce an absence.

## 5. Gap found and fixed (Category B)

**`CommunityTastingsCard` fetched and typed `guestFlavorProfile` (the four flavor axes — acidity/sweetness/body/bitterness) but never rendered them.** This is the literal core signal of "how did the community perceive this coffee's *taste*" — more central than the star rating or the free-text liked/disliked, and the only piece of data that makes this card meaningfully different from a generic star-rating list. Confirmed by direct code read: the component's JSX rendered `StarRating`, brewing method, `liked`/`disliked`/`note`, and a date — nothing referencing `tasting.guestFlavorProfile` anywhere.

**Fix** (minimal, additive, one file): added one compact text line per entry, reusing the existing `FLAVOR_AXES` label constant (`lib/types/coffee.ts`) already used by `TasteComparison` for the exact same four axes — e.g. "Кислотность 4 · Сладость 3 · Плотность 4 · Горечь 2" — plain text, matching `RoastIntentCard`'s own precedent of using plain text rather than a heavier chart/gauge visual for a secondary, per-entry card in a list. No new component, no new visual language, no new data fetched (the view already returned these columns; only the render was missing).

No other Category A/B/C-worthy gap was found in §1–4 — every other checked behavior matched the intended design exactly.

## 6. What was consciously NOT done

- No fix attempted for the pre-existing, unrelated double-submit-button risk on `handleFinish` (§1) — out of this verification's scope (not part of the consent flow, not introduced or changed by it).
- No live query against the actual Supabase project to confirm `checkins_community_view`'s runtime behavior (§3) — no DB credentials available in this sandbox; flagged explicitly rather than assumed safe.
- No aggregate/statistical community taste profile, accounts, profiles, followers, feed, comments, likes, reputation, leaderboards, or cross-device identity — none were found necessary, and all were explicitly out of scope regardless.
- No change to Canonical Lot architecture, Coffee/Green Lot, `public_id`, lifecycle, café gating, `roast_batches`, `reference_roast_profiles`, `reference_taste_profiles`, existing tasting-history persistence, or the QR flow.

## 7. Validation

**`npx tsc --noEmit`** — passed, no output.

**`npm run vitest -- --run`**
```
✓ lib/server/canonicalLot.test.ts (14 tests)
Test Files  1 passed (1)
     Tests  14 passed (14)
```
No new test added — the fix is a pure render-layer addition (one more line of JSX reading an already-typed, already-fetched field), no new branching logic.

**`npm run build`** — passed.
```
✓ Compiled successfully
 ✓ Generating static pages (39/39)
```
`/passport/[lotId]`: 11.8 kB → 11.9 kB. No route added or removed.

## 8. Regression

- **QR → Passport**: untouched this pass.
- **Existing tasting / tasting history**: `journey`/`checkins` read/write shape unchanged since the prior pass; this pass touched only the display component, not any store or write path.
- **Blind Tasting**: order, gating, and `BlindTastingLock`'s data source (`displayLot`) all re-confirmed unchanged (§2).
- **TasteComparison**: zero diff.
- **Taste Intent / Roast Intent vs. Fact**: zero diff; neither was touched or read by this pass's fix.
- **Recipes Community** (`ExtractionTab`, `CommunityHighlights`, votes): zero diff — an entirely separate feature, not touched.
- **Existing private check-ins**: re-confirmed structurally impossible to become public without the owner's own explicit action (§1, §3).
- **Existing public Passport**: only additive change is the one new text line inside `CommunityTastingsCard`; every other card, label, and ordering is unchanged.
- **Existing Lot data**: unaffected — this feature reads `checkins` only, never `lots`/`coffees`/`green_lots`.

## 9. Final status

**Category B** — one concrete, minimal gap found (rendered-data omission in `CommunityTastingsCard`) and fixed within the same file, no scope expansion. Every other checked behavior (consent flow, blind-tasting isolation, RLS/privacy boundary, Passport integration, regression surface) verified correct against the actual code and schema, with one explicitly flagged, unavoidable limitation: migration `0026`'s live RLS/view behavior has been verified statically against precedent, not by a live query, since this sandbox has no database credentials — the same limitation every prior migration in this project has carried.

No Category C architectural finding this pass — the identity constraint (device-local anonymous guests can never contribute to or be part of Community data) was already fully identified and correctly left alone in `COMMUNITY_LAYER_PRODUCT_AUDIT.md`; nothing new was discovered that changes that conclusion.

Stopping here, as instructed.
