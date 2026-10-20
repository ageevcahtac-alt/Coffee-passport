# P20 — Automatic XO Roasting → XO Store Lot Bridge Audit

Read-only architecture audit across two repositories:
`C:\Users\User\Desktop\coffee-pasport` (Coffee Passport, `HEAD` `37c1535`)
and `C:\Users\User\Desktop\xo-coffee-pureroast` (XO COFFEE Store, `HEAD`
`f4421de`). No production code changed in either repo — see §16.

---

## 1. Executive Summary

The two repositories are, today, **completely disconnected**: XO Store has
no live Supabase project at all (confirmed fresh — `.env`'s
`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` are empty, nothing in `src/`
imports a configured client), and its entire catalog is a build-time
static array (`src/data/lots.json` → `LOTS`) with no admin UI, no
database, no way to add a product without a code change and a deploy —
independent of any Coffee Passport question.

Coffee Passport already has exactly the ownership primitive this bridge
needs: `public.lots.roaster_id` (uuid, FK to `public.roasters`), and an
existing, working, roaster-scoped read function —
`listCanonicalLotsForRoaster(roasterUuid)` in
`lib/data/canonicalLotStore.ts` — that already implements "give me every
Canonical Lot owned by roaster X," used today by the roaster's own
dashboard catalog (Phase 4.5.5). **No new ownership system is needed on
the Coffee Passport side.** What's missing is only a way for an
*external* consumer (XO Store) to call the equivalent of that query
without needing a signed-in `roaster_admin` session — today the function
is a `'use client'` browser module gated only by RLS, not a public API.

The single largest risk found is **not** in Coffee Passport — it's a
dormant, unapplied migration already sitting inside the XO Store repo
(`supabase/migrations/20260911120000_coffee_passport_foundation.sql`,
from XO's own P14) that defines a **second, independent Canonical Lot
system** — its own `organizations`, `coffees`, `green_lots`, `lots`
tables with their own `public_id` generation and ownership model,
structurally unrelated to Coffee Passport's real `public.lots`. It has
never been applied (no live project exists to apply it to), so it has
caused no live damage — but if XO Store connects a real database using
this design as-is, it would create exactly the "shadow Lot / second
Canonical Lot system" P20 explicitly forbids. This is flagged, not fixed,
per Step 13.

Also worth surfacing plainly: XO Store already has a feature it calls
**"Coffee Passport"** (`src/lib/coffeePassport.ts`,
`src/components/passport/*`) — this is an unrelated, local-only,
`localStorage`-based post-purchase tasting journal keyed by `orderNumber`,
built entirely inside XO Store, with no backend and no connection
whatsoever to the real Coffee Passport platform this bridge concerns. The
shared name is coincidental and has already caused exactly the kind of
confusion P17/P18/P19 had to rule out (`orderNumber` ≠ Lot identity).

## 2. Current Coffee Passport Lot Ownership

`public.lots` (`supabase/migrations/0022_canonical_lot_core.sql`):

```sql
create table public.lots (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,          -- immutable (see P18 §Step 4 finding)
  roaster_id uuid not null references public.roasters(id) on delete restrict,
  green_lot_id uuid not null references public.green_lots(id) on delete restrict,
  name text not null,
  descriptors jsonb not null default '[]',
  q_grade numeric(4,1),
  roast_type text,
  roast_profile_label text,
  status text not null default 'draft' check (status in ('draft','testing','active','archived')),
  in_roaster_catalog boolean not null default true,
  legacy_text_id text,
  created_at timestamptz, updated_at timestamptz
);
```

Ownership is `roaster_id` — a real FK, not a name/slug guess.
`public.roasters` additionally carries a stable, human-readable `slug`
(`roaster-xo`, `roaster-north`) — this is the existing, already-designed
anchor for resolving "which roaster" without hardcoding a UUID anywhere
(the same pattern `0025`'s `is_roaster_staff_for()` already uses to bridge
`profiles.roaster_id` (text) to `roasters.id` (uuid) via `slug`).

**Existing canonical query** (already implemented, already in production
use — `lib/data/canonicalLotStore.ts:178`):

```ts
export async function listCanonicalLotsForRoaster(roasterUuid: string): Promise<CanonicalLot[]> {
  const { data, error } = await supabase
    .from('lots').select('*')
    .eq('roaster_id', roasterUuid)
    .order('created_at', { ascending: false });
  ...
}
```

This *is* "дай все доступные Canonical Lots, принадлежащие XO COFFEE
Roasting" — resolve `roaster-xo`'s uuid via `roasters.slug`, then this
exact query. **Nothing new needs to be invented for the read logic
itself.** What's missing is only *where this runs* (see §4/§13): today it
runs client-side, under the anon key, callable by anyone including a
signed-out browser — which is fine for Coffee Passport's own UI but is
not yet packaged as something a separate application should be pointed
at directly (no versioned contract, no server-side filtering, no
API surface documented for a third party).

Live data confirms the ownership model is real and populated (re-verified
this session, not reused from memory): `roaster-xo` (`XO COFFEE Roasting`,
id `a8143369-...`) owns 6 of the 8 live `public.lots` rows; `roaster-north`
(`North Star Roasters`) owns the other 2. `in_roaster_catalog` is `true`
on all 8 — it does not currently distinguish "real" from the 4 P16 test
fixtures; `status` does (`active` vs `draft`).

## 3. Current XO Store Product/Lot Model

- **No database.** `.env`'s Supabase vars are empty; `src/lib/supabase/{client,server}.ts`
  exist but throw if used unconfigured, and are imported by nothing else
  in `src/` besides `src/types/domain.ts` (types only, no runtime use).
- **The entire catalog is a static, build-time array**:
  `src/data/lots.json` (8 hand-written entries) → `src/data/lots.ts`
  (`export const LOTS: Lot[] = lotsData`) → imported directly by
  `Catalog.tsx`, `DiscoveryModal.tsx`, `LotPassportModal.tsx`, and the
  local "Coffee Passport" pages. Adding, editing, or removing *any*
  product today requires editing this JSON file and shipping a new
  deploy — true independent of Coffee Passport integration.
- **`Lot.id`** (`src/types/lot.ts`) is a hand-assigned, url-safe slug
  (`lot-014`, `espresso-nol`, ...) used as the sole identifier throughout:
  React key, `CartItem.id`, `OrderRecordItem.lotId`. **No field on this
  type resembles a Coffee Passport `public_id`** — no `passportPublicId`,
  no `lotId` referencing an external system, nothing. Confirmed by reading
  the full type (`src/types/lot.ts`) — this is not partially wired, it is
  entirely absent.
- **The "Coffee Passport" already inside this repo is a different,
  unrelated feature** (see §1) — `OrderRecord`/`TastingRecord`
  (`src/types/coffeePassport.ts`) are keyed by `orderNumber` and
  `Lot.id` (XO's own slug), stored in `localStorage`
  (`xo-coffee-orders`, `xo-coffee-tastings`). Its own doc comment says
  plainly: *"This is a local-only MVP: no account, no backend... a real
  Coffee Passport service could sit behind later"* — i.e. even XO's own
  code acknowledges this is a stand-in, not the integration.
- **A separate, unapplied schema already exists in this repo**
  (`supabase/migrations/20260911120000_coffee_passport_foundation.sql`,
  413 lines, from XO's own P14) that defines `organizations`, `coffees`,
  `green_lots`, `lots`, `roast_batches`, `reference_{roast,taste}_profiles`
  — a **complete second Canonical Lot model**, independent of, and
  structurally incompatible with, Coffee Passport's real schema (different
  ownership entity — `roaster_organization_id` → `organizations`, not
  `roaster_id` → `roasters`; different `public_id` generation; no
  cross-reference to the real Coffee Passport project anywhere). Its own
  header is explicit: *"Status: DESIGNED, NOT APPLIED... nothing here is
  imported or called by any existing route or component."* Confirmed
  still true — `src/types/domain.ts` hand-mirrors it but is unused
  elsewhere in `src/`.

## 4. Current Integration State

**None, functionally.** P17/P18/P19 already established: no live mapping,
`orderNumber` is unrelated, XO's 8 `Lot.id` values are unproven against
any `public_id`. This audit adds: XO Store also has no technical mechanism
today by which *any* external Lot data — Coffee Passport's or otherwise —
could reach its catalog without a code change, because the catalog has no
data source other than a checked-in JSON file. The integration gap is
therefore two-layered: (a) Coffee Passport has no public discovery
surface for "Lots owned by roaster X" outside its own client bundle, and
(b) XO Store has no dynamic product layer of any kind to receive that
data into. Both must be addressed for the bridge in §7 to be real, not
just one of them.

## 5. Required Automatic Bridge

Restated precisely from the brief's own success criterion: a **discovery
and canonical-linking** mechanism, not an auto-create or auto-publish
mechanism.

```
XO COFFEE Roasting creates a Canonical Lot in Coffee Passport (existing flow, unchanged)
        │
        ▼  roaster_id = roasters.id where slug = 'roaster-xo'   (already true, zero new code)
        │
Coffee Passport: a read surface returning "every Lot owned by roaster-xo"
        │            (does not exist as a public surface today — §9/§13)
        ▼
XO Store: a discovery view lists these Lots as "available to add"
        │            (does not exist at all today — no dynamic UI, no DB — §9/§13)
        ▼
A human at XO Store picks one, publishes it as a Product
        │
XO Store Product row stores canonical_lot_public_id = that Lot's public_id
        │            (does not exist — XO Store has no Product table at all)
        ▼
Storefront renders the Product; its Passport link/QR is built from public_id
```

Every arrow after the first is a genuine gap, not a wiring detail — see
§9 for exactly what has to be built and on which side.

## 6. Source of Truth

Unchanged from P18/P19, reaffirmed here as the explicit constraint this
bridge must preserve: **Coffee Passport's `public.lots` is the sole
source of truth for Canonical Lot identity, `public_id`, and ownership.**
XO Store must never hold a second authoritative copy of Lot identity —
only a pointer (`canonical_lot_public_id`) plus its own genuinely-XO-owned
commercial fields (price, availability, publish state — see §10 matrix,
unchanged from P19).

## 7. Ownership Rule

```
Lot is eligible for XO Store  ⟺  lots.roaster_id = (select id from roasters where slug = 'roaster-xo')
```

Nothing else — not name, not slug similarity, not country, not category.
This is exactly the filter `listCanonicalLotsForRoaster` already applies;
the bridge's job is to expose that filter's result to XO Store, not to
invent a new one. North Star Lots (or any future third roaster) never
enter this set, structurally, by definition of the query — no denylist,
allowlist, or per-roaster flag is needed beyond the `roaster_id` equality
check itself.

## 8. New Lot Lifecycle

Walking the brief's §4 scenario against what actually exists today:

| Step | Exists today? | Where |
|---|---|---|
| 1. XO Roasting creates a Canonical Lot | **Yes** | Roaster dashboard `createCanonicalLot` (`lib/data/canonicalLotStore.ts`) — unchanged, no bridge work needed here |
| 2. CP saves Lot with owner = XO Roasting | **Yes** | `roaster_id` set at insert, immutable ownership by RLS write-scoping (`is_roaster_staff_for`) |
| 3. Lot gets immutable `public_id` | **Yes** | `generatePublicLotId` (`lib/server/canonicalLot.ts`), confirmed immutable in P18 (never in any `update()` patch) |
| 4. XO Store gets this Lot automatically via an integration layer | **No** | This is the gap — no public read surface exists yet (§9/§13) |
| 5. New Lot appears among "available" Lots for XO Store's catalog | **No** | Requires #4 plus a UI/data layer on XO Store's side that doesn't exist (no DB, no admin screen) |
| 6. Store user adds it to the storefront | **No** | No mechanism to add *any* product dynamically today — everything is the static JSON |
| 7. Publishing uses this exact Canonical Lot | **N/A yet** | Depends on 4–6 existing first |
| 8. Passport link built from real `public_id` | **Partially** — the URL *shape* is already correct and immutable-safe (P18 §10), just nothing today feeds a real XO `public_id` into it |
| 9. QR → `/passport/[public_id]` | **Correct target, not built** — per P18, and per this brief's own Step 8 ("не создавать QR"), out of scope here too |
| 10. No code change for the *next* new Lot | **Achievable** — but only once steps 4–6's infrastructure exists; it is not a property of today's code |

## 9. Product → Canonical Lot Relation

**Recommended shape** (per the brief's own preferred model, checked
against actual current architecture rather than assumed):

```
Coffee Passport                          XO Store (new, does not exist yet)
─────────────────                        ──────────────────────────────────
public.lots                              store_products (new table)
  id (uuid)                                id (uuid)
  public_id  ◄─────────── by value ─────── canonical_lot_public_id (text, unique)
  roaster_id                               price_cents, is_available, is_published, ...
  status                                   (XO's own commercial fields only)
  name, descriptors, q_grade, ...          (display copy may be cached, but public_id is the join key — never re-derive identity from it)
```

This is `Product → Canonical Lot`, not `Product → copy of Lot data` and
not `Product → hardcoded mapping in source`, per the brief's explicit
requirement. The **join key is `public_id`**, treated by XO Store as an
opaque, immutable foreign identifier it never generates and never edits —
exactly the role `legacy_text_id` plays in the *other* direction inside
Coffee Passport's own schema (a foreign identifier kept for traceability,
never treated as the source of truth).

**Why not a cross-database foreign key:** Coffee Passport and XO Store are
(and per the brief's own principle, should remain) separate Supabase
projects/databases — a real FK constraint across projects isn't possible.
`canonical_lot_public_id` must be a plain unique text column with
application-level integrity (checked against Coffee Passport's discovery
endpoint at write time — see §13), not a database-enforced constraint.

**Do not reuse the existing `20260911120000_coffee_passport_foundation.sql`
design for this.** That migration's `public.lots` is a second Canonical
Lot table with its own `public_id`/ownership — applying it and then also
adding `canonical_lot_public_id` would leave two different "Lot" concepts
inside XO Store's own database, one real (a pointer to Coffee Passport)
and one fake (a local reinvention). If XO Store's database is stood up at
all as part of this bridge, only a narrow `store_products`-shaped table
(commercial fields + one pointer column) belongs in it — not
`organizations`/`coffees`/`green_lots`/`lots`.

**Field name:** `canonical_lot_public_id` is proposed here explicitly
because it says what it is (a copy of Coffee Passport's `public_id`,
owned by Coffee Passport, read-only from XO's side) rather than because
it's a convenient name — per the brief's own instruction not to add such
a field just because it "seems convenient." No such field exists anywhere
today; this is a genuinely new addition, called out as such rather than
silently assumed.

## 10. Security / RLS Considerations

This is the part most likely to be misunderstood, so stated precisely:

**RLS on `public.lots` does not, and structurally cannot, restrict XO
Store to only its own Lots.** `0025_canonical_lot_rls.sql`'s read policy
is `for select using (true)`, granted to `anon` — by design, since a
guest scanning a QR with no session must read any Lot. This means the
*same* anon key already shipped in Coffee Passport's own public JS bundle
would, if handed to XO Store for direct table access, let XO Store's
server or client query **any** roaster's Lots (North Star included) —
RLS does not gate this, because Coffee Passport's Lot data is
intentionally fully public. **Roaster-exclusivity for XO Store must
therefore be enforced by the query/API contract, not by access control**
— i.e. by always filtering `roaster_id = <xo-uuid>` server-side, never by
relying on "XO Store's credentials only see XO's rows" (no such
credential scoping exists or is possible with the current RLS model).

This has a direct implication for §13's two design options:

- **Direct Supabase access** (giving XO Store the anon key + project URL
  and letting it run `listCanonicalLotsForRoaster`-equivalent queries
  itself): technically works today, zero new Coffee Passport code, but
  the roaster-exclusivity filter lives entirely in XO Store's own code —
  a bug or scope-creep there could just as easily query North Star's Lots,
  and nothing on the Coffee Passport side would prevent or even notice it.
- **A dedicated Coffee Passport-side read endpoint**, hard-coded
  server-side to `roaster_id = roaster-xo's id` (not parameterized by a
  caller-supplied roaster): XO Store's client code cannot request another
  roaster's data even by mistake, because the endpoint never accepts
  "which roaster" as an input from the caller — the filter is baked in,
  not merely intended.

Write access is unaffected either way: `is_roaster_staff_for()` already
scopes all `insert`/`update`/`delete` on `lots` to the owning roaster's
own staff (`0025`). XO Store never gets, and under this design never
needs, any write credential against `public.lots` — it only ever reads.

## 11. What Must Never Be Hardcoded

Per §8 of the brief, verified against actual code rather than asserted:

- A specific `Lot.id` / `public_id` value in any XO Store source file
  (route, component, config) — none exist today; must stay that way.
- A per-Lot `if`/`switch` branch anywhere in Catalog/cart/checkout code.
- A roaster's internal **uuid** — the anchor must always be the stable
  `roasters.slug` (`'roaster-xo'`), resolved to a uuid at query time, the
  same pattern `0025`'s own RLS functions already use. A hardcoded uuid
  would silently break if the `roasters` row were ever recreated.
- A manually-maintained JSON/table pairing `{xo_lot_id: public_id}` for
  the current 8 SKUs — explicitly forbidden by the brief (§8) and not
  produced by this audit (§12 confirms none was created).
- The count "8," or any other property of *today's* catalog, anywhere in
  the discovery or linking logic — the whole point is that a 9th, 50th,
  or 500th Lot needs zero of this to change.

## 12. Current 8 XO Store Products — Readiness Snapshot

Not re-litigating P19's factual conclusions — restated here strictly
through the "is this Store item ready to link" lens the brief asks for,
with the new P20 constraint (single-roaster branch) applied:

| XO Lot.id | Has a candidate CP Lot? | Confirmed XO Canonical Lot? | Readiness |
|---|---|---|---|
| `lot-014` | Yes — `LOT-XO-ETH-001` (same roaster) | No — farm/variety/Q conflict (P19) | Candidate exists, blocked on data reconciliation, not on the bridge mechanism |
| `lot-027` | Yes — `LOT-XO-COL-004` (same roaster) | No — farm/sensory conflict (P19) | Same as above |
| `lot-031` | Yes — `LOT-NS-KEN-002` | **No, and never can be** under this stage's principle | Excluded outright — wrong roaster, not merely "unresolved" |
| `lot-042`, `lot-056` | No CP Lot exists at all | No | Pure Store-only items; would need XO Roasting to create a new Canonical Lot first (their choice, not this audit's) |
| `espresso-nol`, `espresso-ugol`, `specialty-degustation` | No — and structurally can't (multi-origin) | No | Cannot be linked under the current one-country-per-Lot Canonical Lot model regardless of any bridge |

**Zero of the 8 current XO Store products have a confirmed Canonical Lot
link today**, and the bridge described in this report does not change
that by itself — it only makes it *possible* for a human to establish
correct links going forward (for the 2 same-roaster candidates, after
data reconciliation; for `lot-042`/`lot-056`, after XO Roasting decides to
onboard them as real Canonical Lots). No SKU was relinked, fixed, or
mapped in this pass, per Step 9's explicit instruction.

## 13. Recommended Implementation Architecture

Two options exist given what's actually in place; recommending one, not
inventing a third unsupported by current code.

**Option A — Direct Supabase read access (fastest, weaker isolation).**
Give XO Store the existing public anon key + project URL (already
effectively public — it ships in Coffee Passport's own browser bundle
today) and let it call the equivalent of `listCanonicalLotsForRoaster`
directly. Zero new Coffee Passport code. Downsides per §10: roaster
exclusivity lives only in XO Store's own query code (not enforced
structurally), and XO Store becomes coupled to Coffee Passport's raw table
shape — any future Coffee Passport schema change (column rename, table
split) breaks XO Store silently, with no version contract between them.

**Option B — A dedicated public read endpoint on Coffee Passport
(recommended).** One new Next.js Route Handler, e.g.
`app/api/public/xo-roasting-lots/route.ts` (naming is illustrative, not
prescriptive), that:
- Resolves `roaster-xo`'s uuid from `roasters.slug` server-side.
- Runs the *existing* `roaster_id`-scoped query server-side (reusing the
  same shape `listCanonicalLotsForRoaster` already proves out — this is
  not new query logic, just a new place to run it from).
- Filters to `in_roaster_catalog = true` (the existing "still relevant to
  this roaster's own catalog" flag — the closest already-existing signal
  for "eligible for the roaster to consider listing," as distinct from
  `status`, which governs guest-facing tasting readiness, not merchant
  selectability; whether `draft`/`testing` Lots should also be
  selectable for early Store prep is a product decision, not one this
  audit makes — flagging both existing flags rather than picking silently).
- Returns a small, stable, versioned JSON contract (`public_id`, `name`,
  `status`, `qGrade`, `roastType`, `descriptors`, `createdAt`) — decoupled
  from `public.lots`'s actual column names, so Coffee Passport can
  refactor its schema without breaking XO Store.
- Hard-codes the roaster filter server-side (§10) — never accepts a
  caller-supplied roaster parameter, so it structurally cannot leak
  another roaster's Lots regardless of what XO Store's own code does.

This is additive-only: no change to `public.lots`, no schema migration,
no RLS change (the endpoint reads through the same public-select policy
that already exists), no change to the roaster dashboard's write path.

**On XO Store's side, both options require the same missing piece**: a
real database connection (currently absent) holding exactly one new table
shaped like §9's `store_products` — not the `20260911120000` migration's
design. This is unavoidable under either option, because the underlying
problem — "XO Store's catalog is a static file with no way to add a
product without a deploy" — exists independent of Coffee Passport.

## 14. Risks / Edge Cases

- **The dormant `20260911120000` migration gets applied as-is by someone
  unaware of this report** — would create a second, independent Canonical
  Lot system inside XO Store, directly contradicting the "one source of
  truth" principle. Flagged in §3/§9; no code change made to prevent it
  beyond this documentation, per Step 13's instruction not to
  self-initiate rework.
- **XO Store's two same-named "Coffee Passport" concepts** (its own local
  order/tasting feature vs. the real platform) causing a future
  implementer to wire the bridge into the wrong module, or to believe
  integration is further along than it is, because grepping "coffeePassport"
  in XO Store's repo finds a lot of existing, working code that has
  nothing to do with this bridge.
- **`in_roaster_catalog` vs `status` ambiguity** (§13) — whichever flag
  ends up gating "selectable by the Store merchant" needs an explicit
  product decision; picking wrong either hides Lots the roaster wants to
  prep early, or exposes `archived`/never-finished Lots for selection.
- **No versioning/deprecation story yet** for the discovery endpoint's
  JSON contract — since this is the only integration surface between two
  independently-deployed apps, a breaking change to it silently breaks XO
  Store with no compile-time signal (they're different repos, different
  languages of truth). Worth a deliberate contract-versioning decision
  before real reliance on it, not solved here.
- **`canonical_lot_public_id` integrity is only application-level**, not
  database-enforced (§9) — a typo'd or stale `public_id` in
  `store_products` would silently fail to resolve to a real Coffee
  Passport Lot rather than erroring at write time, unless XO Store
  validates it against the discovery endpoint at the moment a merchant
  picks it (recommended, not yet built).
- **Draft/test Lots remain visible to the discovery mechanism** unless
  explicitly filtered (§13's `in_roaster_catalog`/`status` choice) — the
  4 P16 `TEST FLOW` fixtures under `roaster-xo` (still live, per P19) would
  otherwise appear as "available to add to the storefront," which is
  exactly the kind of accidental exposure a merchant-facing discovery
  view must guard against. Not a reason to clean them up now (P19 already
  deferred that, Step 8 of this brief repeats the restriction) — just a
  reason the endpoint's filter must not be sloppy.

## 15. Exact Next Implementation Stage

Answering the brief's own question directly, split by repository since
both need one-time work:

**Coffee Passport (one-time):**
1. Add one new, additive Route Handler implementing Option B (§13):
   resolves `roaster-xo` via `roasters.slug`, queries `public.lots` scoped
   to that `roaster_id` and `in_roaster_catalog = true` (pending the
   product decision on whether `status` should further narrow this),
   returns the stable JSON contract described in §13.
2. No change to `public.lots`, RLS, the roaster dashboard's create/edit
   flow, or ownership model — a new Lot XO Roasting creates today already
   satisfies "automatically discoverable" the moment this endpoint exists,
   because the query is `roaster_id`-scoped, not id-enumerated.

**XO COFFEE Store (one-time):**
1. Stand up a real database connection (none exists today) — independent
   prerequisite, not a Coffee Passport concern — and create exactly one
   new table shaped like §9's `store_products` (XO's own commercial
   fields + `canonical_lot_public_id`), explicitly **not** applying the
   existing `20260911120000_coffee_passport_foundation.sql` design as-is.
2. Build one small merchant-facing screen that calls Coffee Passport's new
   endpoint, shows XO-owned Lots not yet present in `store_products`, and
   lets a human create a new (default-unpublished) `store_products` row
   pointing at the chosen `public_id`.
3. Migrate `Catalog.tsx` (and the other three current consumers of the
   static `LOTS` array) to read published `store_products` rows instead
   of the static JSON — **this is the one place existing code changes,
   and it changes exactly once**, not per future Lot.

Once both are in place: a new `LOT-XO-BRA-007` created in Coffee Passport
tomorrow needs no code change on either side — it appears in step 1's
endpoint automatically (pure `roaster_id` filter), becomes selectable in
step 2's merchant screen, and a human decides whether/when to publish it.
This satisfies the brief's §14 criterion exactly: automatic *discovery and
canonical linking*, manual *publishing decision*, zero recurring code
changes, other roasters structurally excluded by the ownership filter
itself.

---

## 16. Git status / changes made

```
$ git status -sb   (coffee-pasport)
## main...origin/main [ahead 2]
 M app/(site)/passport/[lotId]/taste/page.tsx      <- pre-existing, untouched
 M app/auth/actions.ts                              <- pre-existing, untouched
?? P20_AUTOMATIC_XO_ROASTING_STORE_LOT_BRIDGE_AUDIT.md   <- this report
?? (P15/P16/P18/P19's own pre-existing untracked report files, unchanged)

$ git status -sb   (xo-coffee-pureroast)
## master...origin/master [ahead 1]
(clean — nothing changed)
```

**No production code was changed in either repository.** This pass was
read-only end to end: no migration written, no route added, no field
added to any type, no table created. `TypeScript`/build were not
re-run, per Step 13's own instruction ("проверить TypeScript только если
менялся код") — nothing did. The two pre-existing uncommitted files in
Coffee Passport were not opened or touched. XO Store's working tree is
untouched and clean.

The only artifact produced by P20 is this report.
