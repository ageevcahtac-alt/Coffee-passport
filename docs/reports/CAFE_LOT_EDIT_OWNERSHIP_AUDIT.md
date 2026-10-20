# Café Lot-edit Ownership — Architecture Audit

Audit only, per instruction. No code, schema, or data changed. All claims
below are from a fresh read of the current code and schema this session,
not from assumption or from the premise stated in the request.

## Step 1 — The actual flow

### The screen

`app/dashboard/cafe/[lotId]/edit/page.tsx` — reached exclusively via
**`components/cafe/LotDetailModal.tsx`**'s "Редактировать" link
(`/dashboard/cafe/${lot.id}/edit`), rendered as a plain, unflagged action
alongside "Паспорт лота" and "Аналитика" — nothing in the UI signals that
this link behaves any differently from those two read/analytics links.
`LotDetailModal` itself opens from the café dashboard hub
(`app/dashboard/cafe/(hub)/page.tsx`'s `LotMenuCard` → `onOpenDetail`), so
this is a normal, first-class, easily-reachable action for any café/barista
staff member.

The page renders **`components/roaster/LotBuilderForm.tsx`** — the exact
same component the roaster's own `app/dashboard/roaster/[lotId]/edit/page.tsx`
uses — with one single prop difference: `canEditCatalogFlag={false}`. Per
that prop's own doc comment, this hides only the "Доступен для заказа
кофейнями" (`inRoasterCatalog`) toggle section. **Every other field the
form collects remains fully visible and editable to café staff**: name,
country, region, farmer/farm/altitude, variety, process, crop year,
descriptors, roast type, Q-Score, the four flavor sliders
(acidity/sweetness/body/bitterness — the roaster's declared Taste Intent),
and the origin story.

### What "save" actually does

Café's `handleSave` (in the page component):
```ts
function handleSave(updated: Lot) {
  saveLot(updated);
  router.push('/dashboard/cafe');
}
```
That's the entire handler. Compare to the roaster's own `handleSave`
(`app/dashboard/roaster/[lotId]/edit/page.tsx`), which also calls
`saveLot(updated)` first, then additionally resolves the canonical Lot and
calls `updateCanonicalLotFields()` + `activateTasteProfile()` against
Supabase, surfacing `canonicalSaveError` on failure.

**Café's page has none of that second half.** It doesn't call
`findCanonicalLotByPublicId`, `updateCanonicalLotFields`, or
`activateTasteProfile` at all — not even once, successfully or not.

### `saveLot()` (`lib/data/lotsStore.ts`)

```ts
export function saveLot(lot: Lot): void {
  const overrides = readOverrides();
  ...
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  cache = computeAll();
  listeners.forEach((listener) => listener());
}
```
Purely local: reads/writes `window.localStorage`, no network call, no
Supabase client involved anywhere in this function. This is the **same**
function the roaster's page also calls as its first step — the difference
is entirely that the roaster's page does something *else* afterward, and
café's does not.

### The override's precedence — this is the part the request didn't ask about but the code makes unavoidable to check

`computeAll()`/`syncLotsFromSupabase()` (same file): once *any* lot id has
a local override, that override **unconditionally wins** over whatever
`syncLotsFromSupabase()` would otherwise pull from the real canonical
table, for every future read on that same browser:
```ts
const canonicalOnly = merged.filter((lot) => !overrideIds.has(lot.id));
cache = [...overrides, ...canonicalOnly];
```
`useLots()` (and therefore this override) is read by **every** surface on
that device, not just the café dashboard — including
`app/(site)/passport/[lotId]/page.tsx`, the guest-facing Public Passport.
There is no role check inside `lotsStore.ts` that scopes this override to
"café dashboard views only." A café/barista device that is also used to
show the guest-facing Public Passport at the counter (a plausible real
deployment — the same tablet running both the staff dashboard and the QR
scan/passport view) would show that café's own uncommitted local edit —
wrong Q-Score, wrong descriptors, a fabricated flavor profile — as if it
were the roaster's real, canonical guest-facing data, indefinitely, until
that browser's `localStorage` is cleared.

### RLS (for completeness — never actually reached by this flow today)

`supabase/migrations/0025_canonical_lot_rls.sql`:
```sql
create policy "roaster staff manage own lots" on public.lots
  for all using (public.is_roaster_staff_for(roaster_id)) with check (public.is_roaster_staff_for(roaster_id));
```
`is_roaster_staff_for(target_roaster_id)` joins `profiles.roaster_id` (text)
to `roasters.slug` for `auth.uid()`. A café/barista `profiles` row has
`cafe_id` set and no matching `roaster_id` (`ProfileRole` is one of
`enthusiast | barista | cafe_admin | roaster_admin | admin` — `cafe_id`
and `roaster_id` are separate, independently-nullable columns), so this
check would always evaluate false for a café user. **This RLS is a
correct, real backstop that would reject a café-authored write if one were
ever attempted** — but the code audited above never attempts one, so no
café user has ever actually hit this rejection. `reference_taste_profiles`
carries the identical policy shape.

**This corrects the audit request's own premise**: it is not that "RLS
prevents café from saving" (implying an attempted, rejected write) — the
café code path never even tries. The practical effect the request is
concerned about (café's edits never really reach the shared canonical
record) is real, just via a different, arguably worse mechanism: a
silent, always-succeeding local-only save with no attempt and therefore no
error to ever surface.

## Step 2 — Field-by-field actual behavior

| Field | Café edit reaches Supabase? | Survives reload? | RLS error ever seen? | User's perceived outcome |
|---|---|---|---|---|
| `name` | No — `saveLot()` only | Yes, same browser only | No — never attempted | Full success (redirect, no message) |
| `qGrade` | No | Yes, same browser only | No | Full success |
| `roastType` | No | Yes, same browser only | No | Full success |
| `roastProfileLabel` (`lot.roastProfile`) | N/A — **not exposed as an editable field in this form at all**; `handleSubmit` passes through `initialLot?.roastProfile` unchanged | — | — | — |
| `descriptors` | No | Yes, same browser only | No | Full success |
| `story` | No — **also true for the roaster** (Coffee-level field, no write path exists for anyone yet, per `PHASE_4.5.12_REPORT.md`) | Yes, same browser only | No | Full success |
| Origin fields (country/region/variety/process/cropYear/producer.*) | No — same pre-existing Coffee-level gap as `story`, for both roles | Yes, same browser only | No | Full success |
| `status` (draft/testing/active/archived) | **Not present on café's page at all** — `CanonicalLotStatusControl` is only rendered on the roaster's edit page | — | — | — |
| `inRoasterCatalog` | **Not editable** — `canEditCatalogFlag={false}` hides the toggle; the value is passed through unchanged from `initialLot` | — | — | — |
| Taste/roast profile (flavor sliders → `roasterFlavorProfile`, guest-facing "Задумка обжарщика") | No — same as name/qGrade/etc.: local-only, never reaches `activateTasteProfile` | Yes, same browser only | No | Full success |

Every editable field behaves identically: a fully convincing local save,
zero network attempt, zero error path, and — critically — that local
override then **shadows the real canonical data for every other surface
read on that same device**, including the guest-facing Public Passport.

## Step 3 — Ownership model

**ROASTER-OWNED** (confirmed by RLS: `is_roaster_staff_for(roaster_id)`
gates every write):
- Canonical Lot identity — `name`, `qGrade`, `roastType`, `roastProfileLabel`, `descriptors`, `in_roaster_catalog`, `status` (lifecycle).
- Coffee / Green Lot — origin, farmer/farm, story (write path not yet built for *anyone*, but conceptually and by every existing comment in this codebase, unambiguously roaster/Coffee-owned, never café-owned).
- Roast Intent (`reference_roast_profiles`) / Roast Fact (`roast_batches`).
- Taste Intent (`reference_taste_profiles` / `roasterFlavorProfile`).

**CAFÉ-OWNED** (confirmed by RLS: `profiles.cafe_id = cafe_menu_entries.coffee_shop_id`
gates every write to `cafe_menu_entries`):
- The café menu entry itself: `is_active`, `status` (new/active/discontinuing), `scheduled_removal_at`, `lot_ref`.
- Café's own signature recipe (`BrewingRecipe` with `authorType: 'coffee_shop'`) — already a real, separate, correctly-owned entity, already present and fully functional on this exact page (the "Фирменный рецепт кофейни" section), completely unrelated to `LotBuilderForm`.
- **No café-specific naming/price/description field currently exists anywhere in `cafe_menu_entries`** (confirmed by reading both `0017_cafe_menu_entries.sql` and `0018_cafe_menu_scheduled_removal.sql` in full: `id, coffee_shop_id, lot_id, is_active, status, status_changed_at, created_at, updated_at, scheduled_removal_at`, plus `lot_ref` from `0024`). Café-owned custom identity for a Lot is not a category this product has ever built or needed — it is not invented here either, per the instruction not to add ownership categories without necessity.

**GUEST-OWNED** (unaffected by this audit, included only for completeness):
- Tastings (`checkins`), personal history/preferences — already scoped to `owner_user_id`/anonymous device id, no relation to Canonical Lot write access.

## Step 4 — Solution options considered

**A — Remove/block the café Lot-edit UI entirely.** Would also remove the
one genuinely café-owned thing on this exact page (the signature-recipe
section) if done carelessly, and would remove café's only current way to
*see* the Lot's full metrics (Q-Score, descriptors, origin) in one place —
information that is legitimately useful to café staff (training baristas,
deciding how to feature a coffee), even though editing it is not.

**B — Convert the Canonical-Lot portion of the screen to a read-only
view**, keeping the signature-recipe section exactly as it is (already
correctly café-owned, already correctly write-enabled). This preserves
every piece of information café currently has access to, removes only the
false affordance (a save button that silently does nothing real), and
requires no new ownership category or schema.

**C — Move café-editable fields into `cafe_menu_entries`.** Rejected:
there is no existing café-owned counterpart for Lot identity fields
(name/Q-Score/descriptors/taste profile/origin), and inventing one
(café-specific name/description/price) is not something this product has
asked for anywhere else in the codebase — doing so here would be adding a
new ownership category "without necessity," which Step 3 explicitly warns
against. If a genuine future need for café-branded menu copy emerges, that
would be its own, separately-scoped product decision — not a byproduct of
fixing this ownership bug.

**D — Leave the current flow as-is.** Rejected: the current flow's only
observable behavior for a café user is a false "success," with a real,
demonstrated risk of silently corrupting the guest-facing Public Passport
on any device that also happens to run the café dashboard. There is no
architectural reason found in this audit for café to ever persist changes
to Canonical Lot identity or Taste Intent — every RLS policy in the schema
already agrees.

## Step 5 — Existing café menu model checked

Confirmed above: `cafe_menu_entries` has no field that could express
"café's own name/Q-Score/descriptors/taste-profile for this Lot" today.
No duplicate model is proposed. The recommendation (B) needs **zero** new
columns, tables, or `cafe_menu_entries` fields — it only changes which
component café's existing page renders for the Canonical-Lot portion.

## Step 6 — Backward compatibility

- **Existing café menu entries**: untouched — `cafe_menu_entries` schema
  and RLS are not part of this recommendation at all.
- **Existing Lots**: untouched — no write path changes for the roaster
  side; `saveLot()`/`syncLotsFromSupabase()` continue to work exactly as
  today for every other caller (roaster edit/create, café add-lot's Lot
  reads, `/scan`, `/passport/[lotId]`).
- **Roaster dashboard**: entirely unaffected — this is a café-only screen;
  `LotBuilderForm`'s `canEditCatalogFlag` default (`true`) and every other
  behavior on the roaster's own edit page stay exactly as they are.
- **Public Passport**: unaffected directly, and — as a direct consequence
  of removing café's local-override path — this recommendation actually
  *closes* a real risk to Public Passport's own correctness on
  shared/dual-purpose devices, rather than touching its own code at all.
- **QR**: unaffected — QR only ever resolves a Lot's `public_id`, never
  goes through this edit screen.
- **Community**: unaffected — no relation to check-ins or the community
  view.
- **Lifecycle / migration 0027**: unaffected — `cafe_menu_entries_roaster_status_view`
  and its already-verified live behavior
  (`CANONICAL_LOT_CAFE_MENU_INTEGRITY_DEPLOYMENT.md`) are completely
  independent of this page.
- **Historical data**: nothing is deleted. Any café browser that has
  already accumulated a stale local override from today's flow keeps that
  override in its own `localStorage` regardless of this recommendation —
  fully addressing that would be a separate, explicit cleanup decision
  (e.g., whether to purge café-origin `lots` overrides on next load), out
  of scope for this design-only audit.

---

**CURRENT BEHAVIOR:** Café's Lot-edit screen renders the roaster's own
full `LotBuilderForm` (name, origin, Q-Score, roast type, descriptors,
Taste Intent sliders, story — everything except the catalog toggle) and,
on save, writes **only** to that café staff member's own browser
`localStorage` (`saveLot()`), then redirects with no message of any kind.
No Supabase write is ever attempted for any of these fields from this
screen — `findCanonicalLotByPublicId`/`updateCanonicalLotFields`/`activateTasteProfile`,
all present on the roaster's equivalent page, are entirely absent here.
There is therefore no RLS rejection to ever surface; the café user sees a
fully convincing, indistinguishable-from-real "success." That local
override then unconditionally shadows the real canonical data for every
other surface reading `useLots()` on the same device — including the
guest-facing Public Passport, if that same device is also used to show it.

**OWNERSHIP:** Canonical Lot identity, Coffee/origin, Roast Intent/Fact,
and Taste Intent are ROASTER-OWNED (enforced by real RLS everywhere except
this one unreachable-in-practice UI path). The café menu entry
(`is_active`/`status`/`scheduled_removal_at`/`lot_ref`) and the café's own
signature recipe are CAFÉ-OWNED, already correctly modeled and already
correctly write-enabled elsewhere on this exact page. No café-owned
counterpart for Lot identity/taste fields exists, and none is warranted.

**UX GAP:** Yes, real. Not the RLS-rejection gap the request's premise
described — the actual mechanism is a silent, always-successful, purely
local save with a false "saved" affordance, carrying a demonstrated risk
of corrupting the guest-facing Public Passport on any shared café/kiosk
device.

**CLASSIFICATION:** B

**RECOMMENDATION:** Convert the Canonical-Lot portion of café's Lot-edit
screen to a read-only view (origin, Q-Score, roast type, descriptors,
Taste Intent, story shown as plain text/labels, no form, no save button
for any of it), while leaving the page's already-correct, already
café-owned "Фирменный рецепт кофейни" section exactly as it is today.

**MINIMAL IMPLEMENTATION:** Stop passing `initialLot` into
`LotBuilderForm` from café's edit page; render the same field values as
static, read-only content instead (a new small presentational block, or a
`readOnly`-mode addition to `LotBuilderForm` itself — an implementation
detail for the next block, not decided here). Remove café's
`handleSave`/`saveLot()` call for the Canonical-Lot fields entirely — the
signature-recipe section's own save path is untouched. No schema change,
no new `cafe_menu_entries` column, no RLS change: the fix is entirely
UI-level, removing a false affordance that current RLS already correctly
disallows from ever taking effect.

**BACKWARD COMPATIBILITY:** Full — see Step 6. Nothing deleted, no schema
touched, roaster dashboard and every guest-facing surface unaffected
(Public Passport's own correctness is, if anything, made safer).

**OUT OF SCOPE:** Any change to `cafe_menu_entries` schema; any new
café-owned identity/pricing/description concept; cleaning up
already-accumulated stale local overrides in existing café browsers;
closing the pre-existing, separate Coffee-level write-path gap
(origin/story fields not syncing to Supabase for *either* role); anything
about migration `0027` or its already-closed deployment verification.

**CODE CHANGES:** NONE

**GIT:** NO COMMIT / NO PUSH — audit only.
