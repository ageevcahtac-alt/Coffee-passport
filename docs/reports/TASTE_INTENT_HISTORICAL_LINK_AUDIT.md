# Taste Intent Historical Link — Architecture Audit

Scope: audit only, per explicit instruction. No TS/TSX, SQL, migration, RLS,
data, or Public Passport behavior was changed while producing this report.
All claims below are backed by a fresh read of the current code/schema
(this session) and a live, read-only query against the real Supabase
project — not by assumption or by carrying forward the brief mention of
this gap in `NEXT_ARCHITECTURE_AUDIT.md` §3.4.

## Step 1 — What actually exists today

### Schema: the historical-link column already exists, dormant

`supabase/migrations/0024_canonical_lot_fk_columns.sql` added, alongside
`checkins.lot_ref`:

```sql
add column if not exists reference_taste_profile_ref uuid
  references public.reference_taste_profiles(id) on delete set null;
```

The migration's own comment states the intended contract precisely:

> "Captured at write time: the reference_taste_profiles row that was
> `active` for this lot at the moment this checkin was recorded... a later
> profile version must never cause this checkin to look like it was
> compared against a profile it never saw... Stage 4 §32 explicitly
> forbids guessing a historical version for [pre-existing] rows."

`lib/types/database.ts`'s `CheckinRow` carries the same column with the
same documented intent ("captured once, never updated later"). So the
*intended* design for this exact problem was already decided when 0024
was written — it was simply never wired to any write path.

`reference_taste_profiles` (`supabase/migrations/0023_canonical_lot_profiles.sql`)
is schema-identical in shape to `reference_roast_profiles`: same
`draft/active/superseded` enum, same `unique(lot_id, version)`, same
partial unique index enforcing one `active` row per lot. Nothing about
Taste Intent's own versioning is weaker than Roast Intent's.

### Write path: nothing populates the column

- `lib/data/canonicalLotStore.ts`'s `activateTasteProfile(lotUuid, values)`
  (lines 425–462, read fresh) does exactly two things: supersede the old
  `active` row, insert the new one as `active`. It never touches
  `checkins` at all — there is no reason it would, since it runs at
  roaster-edit time, disconnected from any specific guest tasting.
- `lib/journey/store.ts`'s `recordToRow()` (lines 139–177, read fresh) —
  the single function that builds every `CheckinRow` ever sent to
  Supabase — has no `lot_ref` or `reference_taste_profile_ref` field in
  its returned object at all. Confirmed by direct inspection: the object
  literal simply omits both keys.
- `addTastingRecord()` (line 215) and `claimAnonymousTastings()` (line
  273) — the *only* two call sites that insert into `checkins` — both
  route through this same `recordToRow()` for their Supabase writes, with
  no branching logic between them regarding this column. **Anonymous and
  authenticated tastings behave identically: both leave the column null.**
- Repo-wide grep confirms `reference_taste_profile_ref` appears nowhere
  outside the migration, the type definition, and `NEXT_ARCHITECTURE_AUDIT.md`
  itself — it is set by zero lines of application code today.

### Read path: every comparison uses "whatever is active right now"

- `lib/data/lotsStore.ts`'s `rowToLot()` (line 100) computes
  `const activeTaste = row.reference_taste_profiles.find(p => p.status === 'active') ?? null`
  from `syncLotsFromSupabase()`'s join (`reference_taste_profiles(status,
  acidity, sweetness, body, bitterness)`), and stores it as
  `lot.roasterFlavorProfile`. This recomputes fresh, unconditionally, on
  every sync — there is no per-tasting id involved anywhere in this path.
- `components/coffee/TasteComparison.tsx` (lines 14–15) renders
  `guestValues` from `tasting.guestFlavorProfile` (immutable, tasting-time
  guest data — this part is correct) against `roasterValues` from
  `lot.roasterFlavorProfile` — i.e., whatever `rowToLot()` currently
  computed as active. **There is no conditional, no fallback, no id
  lookup — 100% of renders, for tastings of any age, use the live current
  version.**

### Contrast with the Roast Intent precedent (already fixed)

`app/(site)/passport/[lotId]/page.tsx` (lines 233–254, read fresh) shows
the pattern this audit is being asked to compare against:

```ts
const linkedId = latestRoastProfile?.referenceRoastProfileId ?? null;
const fetchIntent = linkedId
  ? getReferenceRoastProfileById(linkedId)
  : getActiveReferenceRoastProfile(canonicalLotId);
```

`roast_batches.reference_roast_profile_id` is a real, populated FK (set at
insert time by reordering the write: `activateReferenceRoastProfile()`
runs first and returns the new version's id, which is threaded into
`createRoastBatch()`). A dedicated `getReferenceRoastProfileById(id)`
getter (`lib/data/canonicalLotStore.ts:654`) exists specifically to
resolve one *specific* historical version. **No taste-side equivalent of
either piece exists** — confirmed by grep: `getReferenceTasteProfileById`
and any `getActiveReferenceTasteProfile`-shaped helper are both entirely
absent from the codebase.

### Live database evidence (read-only, anon key, real project)

```
GET reference_taste_profiles?select=id,lot_id,version,status,effective_from
→ 4 rows, one per lot, every row: version=1, status="active"
```

No lot in the live project has ever had a second version activated —
`activateTasteProfile()`'s supersede branch has never actually fired in
production yet.

```
GET checkins?select=id,lot_id,reference_taste_profile_ref,created_at
→ []
```

Zero checkins exist in the live project at all yet. **This means the gap
is currently 100% latent** — no real guest has yet been shown a taste
comparison against a version different from the one active when they
tasted, simply because no lot has yet had more than one version and no
live checkins exist yet to be affected either way. This is decisive,
not incidental: it directly determines the A/B/C classification below.

## Step 2 — Historical-integrity questions, answered with evidence

**Q1. What happens if the roaster changes Taste Intent after guests have
already left tastings?**
`activateTasteProfile()` sets the old row's `status` to `'superseded'`
(never deleted, never mutated otherwise) and inserts a new `active` row.
The old version's data survives intact in `reference_taste_profiles`.

**Q2. Does an old tasting continue to reference the old version?**
No. `reference_taste_profile_ref` is never set by any write path, for any
tasting, anonymous or authenticated. It is `null` on every row today and
would remain `null` on every future row until this is wired up.

**Q3. Or does re-viewing it actually compare against the new version?**
Yes, unconditionally, for every tasting regardless of age. `TasteComparison`
has no per-tasting branch at all — it always reads `lot.roasterFlavorProfile`,
which is always "whichever row is `active` right now." This is a strictly
weaker guarantee than the roast side, which at least falls back correctly
when no link exists.

**Q4. Can today's system reconstruct which Taste Intent was active at the
moment of a specific tasting?**
Not from application code — no code path attempts this. In principle the
raw history is *not deleted* (superseded rows persist with their own
`effective_from`), so a manual, best-effort reconstruction by comparing
`checkins.created_at` against `reference_taste_profiles.effective_from`
timestamps is theoretically possible, but: (a) nothing implements it, (b)
there's no column recording exactly when a row transitioned out of
`active`, only when the *next* row started, making it approximate at
best, and (c) migration 0024's own comment explicitly forbids exactly
this kind of retroactive guessing for checkins that predate the column.
So: **no, not reliably, and the schema's own stated policy says not to
try.**

**Q5. What happens after the old version is superseded?**
The superseded row is retained as historical data inside
`reference_taste_profiles` itself (this part of the design is sound).
The gap is entirely on the `checkins` side: nothing ever captured a
pointer to it, so that correctly-preserved history is orphaned — it
exists in the database but is unreachable from any specific tasting.

**Q6. How do anonymous vs. authenticated tastings behave with respect to
this?**
Identically — confirmed by reading both call sites. `addTastingRecord()`
(direct/authenticated write) and `claimAnonymousTastings()` (anonymous
tastings re-owned at signup) both build their Supabase row via the same
`recordToRow()`, which omits this field in both cases. There is no
divergence between the two identity paths to reason about here.

**Q7. Does Community anonymity break?**
No, for two independent reasons. First, `checkins_community_view`
(migration 0026) is a manually curated column list — `id, lot_id,
brewing_method, rating, acidity, sweetness, body, bitterness, liked,
disliked, note, created_at` — that already excludes both `lot_ref` and
`reference_taste_profile_ref`; populating the column server-side would
not surface it through that view without an explicit, separate edit.
Second, even if it were exposed, a taste-profile-version id points to the
*roaster's own public declared target* for that lot, not to any guest
identity — it carries no re-identification risk. This is a non-issue in
either direction and is not a reason to favor or defer the fix.

## Step 3 — Comparison against the Roast Intent precedent

The schema-level shape is genuinely analogous: `reference_taste_profiles`
mirrors `reference_roast_profiles` exactly, and `checkins.reference_taste_profile_ref`
was already deliberately pre-built (in 0024) to mirror `roast_batches.reference_roast_profile_id`.
So the *column* the roast precedent suggests already exists — this part
requires no new assumption.

However, the **write-time mechanics genuinely differ** and a naive copy
of the roast implementation would be wrong:

- On the roast side, `createRoastBatch()` is itself the event that
  documents "we just roasted following this profile" — so reordering the
  writes (activate profile → get its id → pass into the batch insert) is
  natural, because both actions happen in the same roaster-side workflow,
  often in the same moment.
- On the taste side, `activateTasteProfile()` (roaster declaring a new
  target) and `addTastingRecord()`/`claimAnonymousTastings()` (a guest
  recording their own tasting) are **unrelated events, on different
  actors' timelines, usually far apart**. There is no "reorder two writes
  that happen together" opportunity here — a guest's check-in is never
  preceded by a fresh profile activation as part of the same flow.

The correct analogous mechanism for taste is therefore a **read-then-stamp
at check-in time**, not a **reordered dual-write**: at the moment
`addTastingRecord()` (or `claimAnonymousTastings()`) builds the row to
insert, look up whichever `reference_taste_profiles` row is currently
`active` for `record.lotId`, and stamp its `id` onto
`reference_taste_profile_ref`. This requires a new getter — the taste-side
equivalent of `getActiveReferenceRoastProfile(lotUuid)` — which does not
exist today (confirmed by grep) and would need to be added specifically
for this purpose, since `rowToLot()`'s bulk join isn't reachable from
`recordToRow()`'s synchronous, per-record context.

On the **read side**, the roast pattern (prefer the linked historical id,
fall back to "active" for rows predating the link) applies to Taste
Intent without modification once the write side exists — the same
`{linkedId ? getByLinkedId() : getActiveByLotId()}` shape used in
`app/(site)/passport/[lotId]/page.tsx` would work identically for
`TasteComparison`.

## Step 4 — Classification

**CLASSIFICATION: B — Important**

Evidence for B over A: the live database shows this gap has not yet
produced any incorrect guest-facing data — every lot today has exactly
one taste-profile version (`version=1, status=active`), no version has
ever been superseded, and zero checkins exist in the live project at all.
"Historical correctness is already broken" (the A bar) does not hold
today in the sense of a real guest having actually seen a wrong
comparison. But the architecture genuinely **cannot** preserve historical
correctness once real usage begins: the moment any roaster calls
`activateTasteProfile()` a second time on a lot that already has
check-ins — an entirely ordinary, expected action, already fully wired
and live on the roaster dashboard — every existing check-in against that
lot will silently and permanently start comparing against the new
version, with no way to tell after the fact that this happened, and no
way to recover the original comparison. This is not a hypothetical edge
case gated behind an unlikely trigger; it's the default outcome of normal
roaster behavior on any lot with tasting history.

Evidence against C: this is not a "consciously not needed" case like
Loyalty's deliberate exclusion of a Lot FK (migration 0024's own comment
for `loyalty_transactions`/`subscriptions`). The migration that added this
exact column already documented the exact correct intent for it — this
was scoped and designed, then left unwired, not deliberately scoped out.

- **Affected tables/files:** `checkins.reference_taste_profile_ref`
  (schema, dormant); `lib/journey/store.ts` (`recordToRow`,
  `addTastingRecord`, `claimAnonymousTastings` — write path); `lib/data/canonicalLotStore.ts`
  (needs a new `getActiveReferenceTasteProfile`/`getReferenceTasteProfileById`
  pair, taste-side equivalents of the existing roast-side getters);
  `components/coffee/TasteComparison.tsx` and its caller in
  `app/(site)/passport/[lotId]/page.tsx` (read path).
- **Current behavior:** every taste comparison, for every tasting
  regardless of age, silently uses whichever `reference_taste_profiles`
  row is active right now.
- **Desired behavior:** a tasting's comparison should show the Taste
  Intent version that was actually active when that tasting was recorded,
  falling back to "active now" only for tastings that predate the fix —
  identical in spirit to the roast side's already-shipped behavior.
- **Minimal solution:** (1) at check-in insert time, resolve the lot's
  current active `reference_taste_profiles.id` and stamp it into
  `reference_taste_profile_ref` on both write paths; (2) add a taste-side
  `getActiveReferenceTasteProfile(lotId)` + `getReferenceTasteProfileById(id)`
  pair mirroring the existing roast-side functions; (3) in the Public
  Passport, prefer the linked id when present, falling back to "active"
  exactly as the roast side already does.
- **Risks:** none identified that are unique to taste — same shape,
  same `on delete set null` policy, same tested `planVersionActivation()`
  logic already reused from the roast side. The only genuinely new risk
  is the write-path getter needing a network round-trip inside
  `addTastingRecord()`/`claimAnonymousTastings()` before the insert,
  which those functions don't currently need (today's insert is
  synchronous-local + fire-and-forget); this would need to stay
  best-effort (never block saving a tasting locally on this lookup
  succeeding), consistent with how both functions already treat their
  Supabase writes as best-effort today.
- **Backward compatibility:** identical to the roast precedent — every
  check-in already recorded today (and everywhere until this ships) keeps
  `reference_taste_profile_ref = null` forever; the read-side fallback to
  "active" must be preserved for these rows exactly as it already is
  today, matching migration 0024's own explicit instruction not to guess
  a historical version for them.

---

**CURRENT STATE:** `checkins.reference_taste_profile_ref` exists in the
schema with the exact correct documented intent, but no write path
(`addTastingRecord`, `claimAnonymousTastings`) ever populates it, and the
read path (`TasteComparison`/`rowToLot`) always renders whichever taste
profile version is active right now, with no per-tasting branch at all.
Live data confirms zero real checkins and zero superseded profile
versions exist yet in production, so this has not yet produced any
incorrect guest-facing result.
**HISTORICAL GAP:** Yes — the mechanism to preserve "which Taste Intent
version was active at tasting time" is entirely absent from the write
path, while the schema, the roast-side precedent, and even this exact
migration's own comments all already anticipated it.
**CLASSIFICATION:** B
**RECOMMENDATION:** Wire `reference_taste_profile_ref` the same way
`roast_batches.reference_roast_profile_id` was wired, adapted for the
real difference in write timing: stamp the lot's current active taste
profile id onto the checkin at insert time (a read-then-stamp, not a
reordered dual-write like the roast side), then prefer that linked id on
read, falling back to "active" for null/legacy rows.
**MINIMAL IMPLEMENTATION:** New taste-side `getActiveReferenceTasteProfile(lotId)`
+ `getReferenceTasteProfileById(id)` getters in `lib/data/canonicalLotStore.ts`;
a best-effort lookup + stamp added to `recordToRow()`'s two call sites in
`lib/journey/store.ts`; a `{linkedId ? getById() : getActiveByLot()}`
branch added to `TasteComparison`'s data source in
`app/(site)/passport/[lotId]/page.tsx`, mirroring the existing roast-side
branch exactly.
**OUT OF SCOPE:** Any change to `checkins_community_view` (already
correctly excludes this column — no privacy work needed); any
retroactive backfill of `reference_taste_profile_ref` for existing null
rows (explicitly forbidden by migration 0024's own comment); any change
to `activateTasteProfile()` itself; any change to RLS.
**CODE CHANGES:** NONE
**GIT:** NO COMMIT / NO PUSH — audit only, no repository changes.
