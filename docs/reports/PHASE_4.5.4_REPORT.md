# Phase 4.5.4 — Canonical Lot Edit / Update Flow

## 1. Objective

Close the next logical step after Phase 4.5.3's read-only detail flow:

```
Canonical Lot Detail → Edit → Update Canonical Lot
```

without ever touching Coffee, Green Lot, or any other Canonical Lot sharing the same Green Lot.

## 2. Initial audit

Read-only pass over the actual repo state, no code changed during this step.

1. **Already-editable Canonical Lot fields**: `lib/data/canonicalLotStore.ts:304` already declares `MutableCanonicalLotFields = Partial<Pick<CanonicalLot, 'name' | 'status' | 'inRoasterCatalog'>>`, with an explicit comment from Phase 4.5.1: *"name/status/inRoasterCatalog are the entire mutable surface of a canonical Lot."* `updateCanonicalLotFields(lotUuid, fields)` (line 306) already exists, already only builds a patch from those three keys, and already scopes the write with `.eq('id', lotUuid)` — a single-row update by primary key.
2. **Coffee-owned fields that must not be edited here**: `country`, `region`, `farm`, `producer`, `variety`, `altitude`, `processing`, `harvestYear` — all live on `coffees`, reachable only through `createCoffee`/`getCoffeeById`, never through `lots`.
3. **Green-Lot-owned fields that must not be edited here**: `purchasedKg`, `purchaseDate`, `contractReference`, `notes` — all live on `green_lots`, reachable only through `createGreenLot`/`getGreenLotById`, never through `lots`.
4. **Existing update function to reuse**: `updateCanonicalLotFields()` — fits exactly, needed no changes. `lib/data/canonicalLotStore.ts` was audited in full and **zero lines in it needed to change** for this phase.
5. **Existing edit page usable parts**: `app/dashboard/roaster/[lotId]/edit/page.tsx` already renders `LotBuilderForm` (collects `name` and `inRoasterCatalog` among other local-only fields) and, since Phase 4.5.3, `CanonicalLotChain` (read-only chain display). Its `handleSave`, however, called only `saveLot(updated)` — the browser-localStorage override cache — and **never wrote to Supabase's `lots` row at all**. This is the actual gap Phase 4.5.4 closes: as of Phase 4.5.3, editing a Lot from the dashboard had no effect on the canonical record, ever.

**Two concrete findings that shaped the design:**

- `name` and `inRoasterCatalog` already have a UI (`LotBuilderForm`), but that UI never reached Supabase.
- `status` (`'draft' | 'testing' | 'active' | 'archived'`) has **no UI anywhere** in the app — the local `Lot` type (`lib/types/coffee.ts`) has no `status` field at all; it is a purely Supabase-side concept introduced by the canonical schema (`supabase/migrations/0022_canonical_lot_core.sql`). Editing it therefore needed a new, small, Canonical-Lot-specific control — it could not be bolted onto the shared `LotBuilderForm`/`Lot` type without either inventing a fake local field or rippling into `LotBuilderForm`'s other consumer (`/dashboard/cafe/[lotId]/edit`, which reuses the same component for coffee-shop-side editing).

## 3. Exact changed files

- `app/dashboard/roaster/[lotId]/edit/page.tsx` — modified (+43 / −2 lines: 3 new imports, 2 new state variables, `handleSave` made async and now also calls `updateCanonicalLotFields`, and two new render lines)
- `components/roaster/CanonicalLotStatusControl.tsx` — new file

**Not touched at all this phase** (verified via `git diff` producing zero output for each): `lib/data/canonicalLotStore.ts`, `app/dashboard/roaster/new/page.tsx`, `components/roaster/CanonicalLotChain.tsx`, `components/roaster/LotBuilderForm.tsx`, `lib/data/lotsStore.ts`, `lib/types/coffee.ts`, `lib/types/database.ts`.

## 4. Implementation

**`app/dashboard/roaster/[lotId]/edit/page.tsx`** — `handleSave` is now `async`:

```ts
async function handleSave(updated: Lot) {
  saveLot(updated);                              // unchanged local-first behavior
  const canonicalLot = await findCanonicalLotByPublicId(updated.id);
  if (canonicalLot) {
    await updateCanonicalLotFields(canonicalLot.id, {
      name: updated.name,
      inRoasterCatalog: updated.inRoasterCatalog,
    });
  }
  router.push('/dashboard/roaster');
}
```

`saveLot` still runs first and unconditionally, so local UX is unaffected even if the Supabase write fails. If a canonical row exists, exactly the two overlapping fields (`name`, `inRoasterCatalog`) are pushed through the existing `updateCanonicalLotFields` — the same function, same `Pick<>`-enforced surface, from Phase 4.5.1, completely unmodified. A Lot with no canonical row yet (e.g. purely local/seed) silently skips the Supabase call, matching `CanonicalLotChain`'s own "not connected" tolerance. If the Supabase write throws, navigation is blocked and `canonicalSaveError` is shown inline — the local save already happened, so no work is lost, but the roaster is told the canonical catalog didn't update, mirroring the existing error pattern in the creation wizard (`new/page.tsx`'s `lotSaveError`).

**`components/roaster/CanonicalLotStatusControl.tsx`** (new) — self-contained: fetches its own canonical row via `findCanonicalLotByPublicId(publicId)`, renders a 4-way pill radio group (`draft`/`testing`/`active`/`archived`, same visual idiom as `LotBuilderForm`'s roast-type picker and `components/cafe/LotStatusControl.tsx`'s menu-status picker), and on selection calls `updateCanonicalLotFields(canonicalLot.id, { status })` directly — nothing else in the patch, ever. Renders nothing for a Lot with no canonical row.

**Wiring**: the edit page now renders

```tsx
<CanonicalLotChain key={chainRefreshKey} publicId={lot.id} />
<CanonicalLotStatusControl publicId={lot.id} onUpdated={() => setChainRefreshKey((k) => k + 1)} />
```

`CanonicalLotChain` itself was not touched — it has no refresh mechanism of its own, so a `chainRefreshKey` state bump (incremented by `CanonicalLotStatusControl`'s `onUpdated` callback) forces a full remount, which re-runs its existing `useEffect([publicId])` fetch. This was the only way to make the already-closed Phase 4.5.3 component reflect a status change without editing its internals.

## 5. Editable vs. immutable fields (as implemented)

| Field | Entity | Editable from this flow? | Path |
|---|---|---|---|
| `name` | Canonical Lot | ✅ | `LotBuilderForm` → `handleSave` → `updateCanonicalLotFields` |
| `status` | Canonical Lot | ✅ | `CanonicalLotStatusControl` → `updateCanonicalLotFields` |
| `inRoasterCatalog` | Canonical Lot | ✅ | `LotBuilderForm` → `handleSave` → `updateCanonicalLotFields` |
| `descriptors`, `qGrade`, `roastType`, `roastProfileLabel` | Canonical Lot | ❌ (unchanged from Phase 4.5.1) | Outside `MutableCanonicalLotFields` by explicit prior architecture decision — this phase did not widen it (see §7) |
| `id` (uuid), `publicId`, `greenLotId`, `roasterId` | Canonical Lot | ❌ never | Not part of any patch this phase sends |
| `country`, `region`, `farm`, `producer`, `variety`, `altitude`, `processing`, `harvestYear` | Coffee | ❌ never | No write path from this page touches `coffees` at all |
| `purchasedKg`, `purchaseDate`, `contractReference`, `notes` | Green Lot | ❌ never | No write path from this page touches `green_lots` at all |

## 6. Architecture decisions

- **Reused `updateCanonicalLotFields()` as-is, with zero changes to `canonicalLotStore.ts`.** It already matched Step 3's requirement exactly; extending its scope would have meant relaxing a deliberate Phase 4.5.1 restriction (`descriptors`/`qGrade`/`roastType`/`roastProfileLabel` excluded on purpose, per that function's own comment pointing at future Reference Taste/Roast Profile versioning) — out of scope for "reuse if it fits."
- **`status` got a dedicated small component instead of a field added to `LotBuilderForm`/`Lot`.** `LotBuilderForm` is shared with the coffee-shop edit flow (`app/dashboard/cafe/[lotId]/edit`); adding a Canonical-only concept to the shared `Lot` type would have rippled into that unrelated surface for no benefit there. A narrow, self-fetching control kept the blast radius to exactly the one page that needed it.
- **Local save (`saveLot`) always runs before the Supabase write, and always succeeds independently of it.** Keeps existing local-first UX (Phase 4.5.2) intact; the Supabase sync is additive, not a replacement of the existing mechanism.
- **Update is scoped by the Lot's own internal `uuid`, never derived from or joined against `green_lot_id`.** `updateCanonicalLotFields`'s `.eq('id', lotUuid)` is a single-row primary-key update — structurally, it cannot reach `green_lots`, `coffees`, or any other row in `lots`, including a sibling Lot sharing the same `green_lot_id`. Verified by reading the function body (unchanged since Phase 4.5.1); no test could make this "more true" than the SQL itself already guarantees.
- **`chainRefreshKey` remount, not a `CanonicalLotChain` rewrite.** The task explicitly said not to redo 4.5.3 work without necessity; forcing a refetch via `key` needed a one-line change at the call site instead of restructuring that component's internals or props.

## 7. Intentionally unchanged

- `lib/data/canonicalLotStore.ts` — audited fully, changed nowhere. `updateCanonicalLotFields`, `createCanonicalLot`, `createCoffee`, `createGreenLot`, `generatePublicLotId` usage, and all Phase 4.5.3 read functions are byte-identical to their state at the close of Phase 4.5.3.
- `app/dashboard/roaster/new/page.tsx` — the entire creation wizard (Existing/New Coffee → Existing/New Green Lot → Canonical Lot) is untouched.
- `components/roaster/CanonicalLotChain.tsx` — untouched; only referenced with an added `key` prop from its parent.
- `components/roaster/LotBuilderForm.tsx` — untouched; its `onSave: (lot: Lot) => void` prop type already tolerates an async handler (TypeScript's return-type-ignoring callback compatibility), so no signature change was needed even though `handleSave` is now `async`.
- `lib/data/lotsStore.ts` — untouched. `saveLot`'s own header comment (from Phase 4.5.1/4.5.2) is now slightly further out of date than it already was after 4.5.2 — flagged again under Caveats, not fixed here, same as in the Phase 4.5.3 report.
- `MutableCanonicalLotFields`'s `Pick<>` scope — not widened. `descriptors`/`qGrade`/`roastType`/`roastProfileLabel` remain immutable through this path, per Step 3's explicit "don't add fields just for this phase" instruction.

## 8. Validation

**`npx tsc --noEmit`** — passed. No output, no errors.

**`npx vitest run`** — passed.
```
✓ lib/server/canonicalLot.test.ts (14 tests) 29ms

 Test Files  1 passed (1)
      Tests  14 passed (14)
```
No new test file added — see §11 (no new pure domain logic was introduced; `canonicalLotStore.ts`, the only file with real logic touched by an earlier phase, was not modified at all this phase).

**`npm run build`** — passed.
```
✓ Compiled successfully
   Linting and checking validity of types ...
 ✓ Generating static pages (39/39)
   Finalizing page optimization ...
   Collecting build traces ...
```
`/dashboard/roaster/[lotId]/edit` grew from 9.61 kB to 10.2 kB (191 kB First Load JS, was 190 kB) — the two new imports and the status control. No route added or removed; `/dashboard/roaster/new` is byte-identical in size to its Phase 4.5.3 build output (8.1 kB → unchanged at 8.21 kB, same as before — the reported 8.1 vs 8.21 kB difference across the two reports is measurement noise between build runs, not a code change, confirmed by `git diff` showing zero lines changed in that file this phase).

## 9. Regression

- **Creation wizard (all four scenarios A–D)**: `createCoffee`, `createGreenLot`, `createCanonicalLot` call sites in `new/page.tsx`, and their implementations in `canonicalLotStore.ts`, are unmodified — confirmed by `git diff` producing no changes to either file this phase (only Phase 4.5.3's earlier diff remains).
- **`public_id` generation**: `generatePublicLotId` and its 14 covering unit tests are unmodified and still pass.
- **`green_lot_id`**: never appears in any patch built by `updateCanonicalLotFields` (its `Pick<>` doesn't include it) or by this phase's new code — confirmed by reading `updateCanonicalLotFields`'s patch-building logic, unchanged from Phase 4.5.1.
- **Green Lot reuse (Scenario D)**: `listCanonicalLotsForGreenLot` (Phase 4.5.3) is unmodified; a status/name/catalog-flag edit on one sibling Lot cannot reach another, since the update is a single-row `.eq('id', lotUuid)` write with no join or batch semantics.
- **Detail/read flow (Phase 4.5.3)**: `CanonicalLotChain.tsx` has zero diff this phase; it is now given a `key` prop by its parent so a status edit is reflected without a full page reload, but its own fetch/render logic is untouched.
- **No direct Supabase writes were performed by this phase outside the app itself** — no curl/REST inserts, no service-role key, no connector use. All Supabase interaction happens only through the existing anon-key browser client, through the pre-existing `updateCanonicalLotFields`/`findCanonicalLotByPublicId` functions, exactly as the app's own RLS (`0025_canonical_lot_rls.sql`) expects a signed-in `roaster_admin` to write.
- No new regression test was added for the update path itself: `updateCanonicalLotFields` is a thin Supabase I/O wrapper with one trivial early-return guard (already the case before this phase) and no new branching was introduced in it. Per this project's existing testing convention (stated directly in `lib/server/canonicalLot.test.ts`'s own header comment — DB-constraint-shaped behavior is validated by the migrations, not re-asserted in JS), and per this phase's explicit instruction not to build excessive test infrastructure (mocking the Supabase client would be new infra this project doesn't currently have), no test file was added or changed. The 14 existing tests continue to cover every piece of pure domain logic this phase's code depends on.

## 10. Caveats / technical debt

- `LotBuilderForm` still collects and locally saves several fields (`country`, `region`, `variety`, `process`, `cropYear`, `qGrade`, `descriptors`, `roasterFlavorProfile`, `producer`) that have no Canonical Lot write path at all — they update the local override cache only, exactly as before this phase. This is Phase 4.5.2-era debt (already flagged in the Phase 4.5.3 report); this phase does not change or widen it, per the explicit instruction not to add fields just for this step.
- `lib/data/lotsStore.ts`'s header comment on `saveLot` ("Lot CREATE/EDIT still writes to localStorage only, not Supabase") is now doubly stale — both creation (4.5.2) and, as of this phase, `name`/`inRoasterCatalog` edits do reach Supabase. Not fixed here (comment-only, no behavioral bug, out of this phase's file scope).
- `app/dashboard/roaster/new/page.tsx` and the earlier `roaster.slug` → `roaster.id` fix inside it remain **uncommitted** in the working tree, as already noted in the Phase 4.5.3 report — this phase adds no new commits either, so that state is unchanged, just carried forward.
- `CanonicalLotStatusControl` and `CanonicalLotChain` now each independently fetch the same canonical row on the same page load (two separate `findCanonicalLotByPublicId` calls). This is a small, deliberate duplication — see §6 — traded for not touching the already-closed Phase 4.5.3 component. Acceptable at this data volume (a single-row `.eq()` lookup); would be worth consolidating into a shared hook only if this page grows more canonical-aware widgets.

## 11. Blockers / risks

None encountered. All three validation commands passed on the first run after implementation. No Supabase writes (test or otherwise) were made by this phase — validation relied entirely on `tsc`/`vitest`/`build`, plus direct reading of the unchanged `updateCanonicalLotFields` implementation to confirm its single-row, `Pick<>`-scoped write contract.

## 12. Stopping point

Phase 4.5.4 (Canonical Lot Edit / Update Flow) is implemented and validated. **Phase 4.5.5 has not been started.**
