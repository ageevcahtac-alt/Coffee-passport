# Next Architecture Audit

Audit-only pass. No code was changed to produce this report — every claim
below is sourced from re-reading the actual, current code, migrations, and
RLS policies, not from memory of prior reports.

## 1. Closing the Identity / Community block

Based on the completed, live-verified `IDENTITY_BROWSER_E2E_VERIFICATION.md`
(POST-MIGRATION VERIFICATION section), the following are confirmed closed —
re-stated here as the record of this block's final state, not re-tested:

- Migration `0026_checkins_community_sharing.sql` is genuinely applied to
  the live, hosted Supabase project — confirmed by direct live-schema
  queries (`checkins.is_public` and `checkins_community_view` both
  resolve with `200`, a negative-control query against a truly
  nonexistent column still correctly returns `400`), not by the dashboard
  indicator or the presence of the migration file.
- **Private check-in**: reaches Supabase, `is_public=false`, survives a
  full local-cache clear + reload (reconstructed purely from a live
  Supabase pull), correctly absent from `checkins_community_view`.
- **Public/Community check-in**: reaches Supabase, `is_public=true`,
  appears in `checkins_community_view` and in `CommunityTastingsCard` on
  the correct Lot, carries no owner/identity field of any kind, confirmed
  absent from a different Lot's view.
- **Community anonymity** is structurally preserved — the view's own
  column list excludes `owner_user_id`/`coffee_shop_id`/`roaster_id`/any
  `barista_*` field, not merely hidden client-side.
- **Anonymous → authenticated continuity**: two anonymous tastings
  correctly re-owned to a newly-signed-up account, verified from a
  separate fresh tab with local cache cleared — count, Lot, ratings,
  `liked` text, timestamps, and privacy state all survived, reconstructed
  from Supabase, no duplicates.
- **Blind tasting**: re-checked with real Community data now genuinely at
  stake (two real public rows existed for the test Lot) — a brand-new
  anonymous guest's pre-reveal screen still showed zero Community content.
- `npx tsc --noEmit`, `npx vitest run` (14/14), `npm run build` (39/39
  pages) all clean.
- The deployment blocker (migration never applied) is closed.

**No code was changed to produce this section.**

## 2. Method for this pass

Re-audited the actual write/read paths for the six areas most likely to
carry the next real gap, cross-referencing code against the live schema
files (not assumptions from prior reports, several of which are now
multiple sessions old). Focus: where does the chain **Coffee → Green Lot →
Canonical Lot → Roast → Taste → Passport → Community → Account** still
have an incomplete or unguarded write path, specifically where that
incompleteness can produce wrong or stale data a guest, café, or roaster
actually sees.

## 3. Findings

### 3.1 Coffee (origin data) has no edit path, ever

`createCoffee()` (`lib/data/canonicalLotStore.ts`) is the only write
function against `public.coffees` — there is no `updateCoffee`. No page
under `app/dashboard/roaster/**` edits an existing Coffee row.
`LotBuilderForm`'s origin fields (country, region, variety, process,
cropYear, producer/farm/altitude) are collected and submitted, but only
ever land in the local Lot override cache (`saveLot()`) — never in
`coffees`. This is by explicit design, documented in
`canonicalLotStore.ts`'s own comment: changing Coffee/Green Lot data
"means creating a new Coffee/Green Lot ... a distinct, explicit
operation, never a plain UPDATE through here" — but no such "distinct,
explicit operation" (an edit-Coffee flow) exists either. A roaster who
makes a mistake in a Coffee's country/farm/producer at creation time has
**no way, through this app, to ever correct it** — the exact data the
whole product's "Passport"/provenance premise rests on.

### 3.2 Green Lot has no edit path, ever

Same shape as 3.1, smaller blast radius: only `createGreenLot()` exists;
`CanonicalLotChain.tsx` renders Green Lot data read-only, no edit form
anywhere. Less guest-visible (Green Lot fields — purchased_kg,
purchase_date, contract_reference — are never rendered on the Public
Passport), so lower severity than 3.1, but the same missing-CRUD shape.

### 3.3 Café's own Lot-edit screen is a non-functional illusion

`app/dashboard/cafe/[lotId]/edit/page.tsx`'s `handleSave` calls only
`saveLot()` (local browser cache) — no Supabase call, no import of
`canonicalLotStore.ts` at all. The only write policy on `public.lots`
(`supabase/migrations/0025_canonical_lot_rls.sql`) is `"roaster staff
manage own lots"`, scoped to `is_roaster_staff_for(roaster_id)` — there is
**no RLS policy under which a `cafe_admin` could ever be authorized to
write to `lots`**, so even adding the missing Supabase call today would
fail outright. A café staff member filling out and saving this form sees
no error and is redirected as if it worked; nothing persists beyond their
own browser. This exact gap was first found in a prior architecture pass
(referenced, not re-derived, from this repo's own `PHASE_4.5.12_REPORT.md`)
and independently re-confirmed unfixed in the Community Layer audit — this
is now its third confirmation. The reason it was deferred each time still
holds: fixing it requires deciding **whether** a café should be able to
edit a roaster's product data at all, and if so, through what mechanism
(a café-scoped annotation layer, distinct from the roaster's own canonical
fields, is one plausible shape) — not something this pass has standing to
decide.

### 3.4 Taste Intent has no historical link (mirrors the roast gap already closed)

`checkins.lot_ref` and `checkins.reference_taste_profile_ref`
(`supabase/migrations/0024_canonical_lot_fk_columns.sql`) are real,
nullable FK columns — `lot_ref → lots.id`, `reference_taste_profile_ref →
reference_taste_profiles.id` — that already exist in the live schema.
Neither is ever set: `recordToRow()` (`lib/journey/store.ts`) builds the
insert payload without either field, so every checkin leaves them `null`.
There is also no `getReferenceTasteProfileById()` — the taste-side
equivalent of `getReferenceRoastProfileById()` (already built and live for
roast, see `ROAST_BATCH_REFERENCE_LINK.md`) does not exist. Practically:
"Ваши ощущения vs Задумка обжарщика" always compares a guest's blind
tasting against whichever `reference_taste_profiles` version is `active`
*today*, never the exact version that was active when they tasted — the
identical asymmetry the roast side had before this session's earlier
`ROAST_BATCH_REFERENCE_LINK.md` pass closed it there. Lower urgency than
that pass judged it (roasters rarely re-declare taste intent mid-Lot), and
that reasoning still holds — but the schema work is already done and
sitting idle, and the exact pattern to close it (thread the id from
`activateTasteProfile`-equivalent into the checkin insert, add one getter)
is now proven, low-risk, and already shipped once for the sibling table.

### 3.5 Lot lifecycle status has no transition guard, and no link to café menu consequences

`CanonicalLotStatusControl.tsx` renders all four statuses
(`draft`/`testing`/`active`/`archived`) as an always-clickable radio
group — any status can move to any other status freely. The only guard
(`isReadyForActive`: name + `qGrade > 0`) fires solely on transitions
*into* `active`; the control's own comment confirms moving *out* of
`active` (including straight to `archived`) is never blocked. No code
anywhere — not in this control, not in `updateCanonicalLotFields`, not as
a DB trigger — checks `cafe_menu_entries` before permitting a status
change.

Separately, `cafe_menu_entries.lot_id` is legacy `text`, not a real FK;
migration `0024` added a nullable `lot_ref uuid references lots(id)` but,
like 3.4's columns, it is never populated by `cafeMenuStore.ts`'s
`writeThroughEntry()`. The only place Lot status is even checked against
café listing is at **add time** (`isPublishedForOrdering` /
`handleCodeSubmit` in `add-lot/page.tsx`, both requiring `status ===
'active'`) — a one-time gate, not a standing constraint. Once a café has
added a Lot to its menu, **nothing re-checks that relationship if the
roaster later changes the Lot's status.** A roaster can archive a Lot
that a café is still actively selling; the café's menu entry stays
`is_active: true`/`status: 'active'` indefinitely, with no signal to
either side, and a guest scanning that café's QR still reaches a fully
live Public Passport for a Lot the roaster considers gone.

## 4. Classification

### Category A — Critical, should be addressed now

**Lot lifecycle status changes are not reconciled with café menu listings (§3.5).**

- **Where**: `components/roaster/CanonicalLotStatusControl.tsx` (the write side, unguarded) and `lib/data/cafeMenuStore.ts`/`app/dashboard/cafe/add-lot/page.tsx` (the read/gate side, checked only once, at add-time).
- **Why this is real, not invented**: every other status-adjacent flag in this exact area — `in_roaster_catalog` (Phase 4.5.11) and `status === 'active'` at menu-add time — was already deliberately, carefully synced or gated. This one specific transition (`active`/`testing` → `archived`, after a café has already listed the Lot) was never covered by any of those passes, and is the one place a roaster's own dashboard action can silently make a café's live, guest-facing menu wrong. This is precisely a "further scaling" risk: it costs nothing today with a handful of pilot Lots, and produces more silent staleness the more roasters and cafés actually use the lifecycle feature that already exists.
- **What already exists to reuse**: `updateCanonicalLotFields()`'s existing patch-building pattern; `listAllCanonicalLotStatuses()`/`isPublishedForOrdering()`'s existing status-check logic (already proven, just needs to run at more than one point in time); the already-added-but-idle `cafe_menu_entries.lot_ref` FK column (migration `0024`) as the correct join key instead of the legacy text `lot_id`.
- **What would need to change**: either (a) a re-check at status-change time — when a roaster moves a Lot to `archived` (or off `active`), surface which café menu entries reference it and require an explicit acknowledgment, or auto-flag those entries; or (b) a re-check at menu-render time — café dashboard and/or the guest Passport itself re-validates the Lot's live canonical status rather than trusting a menu entry's own `is_active` flag. Both are additive to existing tables/functions; neither requires a new table.
- **What must not change**: `in_roaster_catalog`'s already-correct, already-synced semantics; the existing one-time add-time gate (still correct, just insufficient alone); `cafe_menu_entries.lot_id`'s legacy text column (population of `lot_ref` should be additive, not a replacement/migration of existing rows).

### Category B — Important, next block

1. **Café Lot-edit ownership (§3.3)** — real, repeatedly-confirmed (third
   time, across this and two prior sessions), actively misleading (a form
   that appears to save and doesn't). Not Category A because the correct
   fix requires an actual product decision this pass has no standing to
   make (should a café be able to edit a roaster's Lot at all, and how) —
   the same conclusion every prior pass reached, re-confirmed rather than
   overridden. **Reusable**: the RLS pattern already used for
   `roaster staff manage own lots`, extended to a new, café-scoped
   surface (e.g. an annotation table, or an explicit café-owned subset of
   fields) rather than direct `lots` writes. **Must not change**: the
   existing roaster-only write authority over the canonical `lots` row
   itself.
2. **No Coffee edit path (§3.1)** — real provenance-integrity gap (the
   product's core promise), but infrequent in practice (Coffee data is
   set once, rarely revisited) and not yet evidenced as actively causing
   incidents. **Reusable**: `createCoffee()`'s existing shape/validation,
   `updateCanonicalLotFields()`'s patch-building convention as a template
   for an `updateCoffee()`. **Must not change**: Coffee's own identity
   (`id`, `roaster_id`) or the existing "Coffee overlay wins over local
   Lot fields" read-side convention (`withCanonicalCoffeeOverlay`).
3. **No Green Lot edit path (§3.2)** — same shape as #2, lower guest
   visibility, correspondingly lower priority within this category.

### Category C — Deferred, consciously left alone

1. **Taste Intent historical link (§3.4)** — real and now cheap (schema
   already exists, the exact pattern already shipped once for roast), but
   the original judgment that this is low-priority (roasters rarely
   re-declare taste intent mid-Lot-life) is still evidenced and still
   holds. Worth doing eventually, precisely because it's cheap — but not
   ahead of §3.5/3.3's real, live integrity risks.
2. **Aggregate/statistical community taste profile** — already deferred
   in `COMMUNITY_LAYER_PRODUCT_AUDIT.md` for a real privacy reason
   (small-sample deanonymization risk); nothing in this pass changes that
   reasoning.
3. **Cross-Lot community feed/leaderboard, café-scoped social features,
   reputation** — explicitly out of scope per this task's own instruction
   and every prior Community-block audit; would need a real identity/
   social graph decision, not attempted.

## 5. Result

**CURRENT BLOCK: CLOSED**

Identity / Account continuity and Community Check-in are confirmed
working end-to-end against the live, hosted Supabase project — real
write/read/privacy/continuity/blind-tasting flows, not just code review.

**NEXT RECOMMENDED BLOCK:**
Canonical Lot Lifecycle ↔ Café Menu Integrity

**WHY:**
Every other status-adjacent flag touching café visibility
(`in_roaster_catalog`, the `active`-only add-time gate) has already been
deliberately synced or gated in prior passes. The one transition nobody
has ever covered — a roaster moving a Lot *out* of `active` after a café
has already listed it — has no guard, no re-check, and no signal to
either side, so a café's live, guest-facing menu can silently go stale.
This directly threatens the one thing the last several blocks of work
(Public Passport core journey, Roast/Taste Intent linking, Community
Check-in) were all built to protect: that what a guest sees when they
scan a QR is accurate. It gets worse, not better, as more roasters and
cafés actually use the lifecycle feature that already exists.

**SCOPE:**
Reconciling Canonical Lot `status` transitions with existing
`cafe_menu_entries` rows for that Lot — populating and using the
already-existing, currently-idle `cafe_menu_entries.lot_ref` FK; deciding
and implementing either a status-change-time check/flag or a
menu-render-time re-validation (or both); surfacing the mismatch
somewhere a roaster and/or café can actually see and act on it.

**OUT OF SCOPE:**
Café Lot-edit ownership (§3.3, Category B — needs a separate product
decision first); Coffee/Green Lot edit paths (§3.1/3.2, Category B);
Taste Intent historical link (§3.4, Category C); any new social/
Community/profile/reputation feature; any change to `in_roaster_catalog`'s
already-correct behavior; any change to the existing add-time
`isPublishedForOrdering`/`handleCodeSubmit` gate (it stays, this block
only adds what happens *after* that point).

**EXPECTED PRODUCT RESULT:**
A roaster changing a Lot's lifecycle status can no longer silently leave
a café selling something the roaster considers gone, and a café's menu
can no longer silently drift out of sync with the roaster's own catalog
— closing the last unguarded seam between the two organizations that share
a Canonical Lot, on top of an already-accurate guest-facing Passport.

**CODE CHANGES:**
NONE — audit only.
