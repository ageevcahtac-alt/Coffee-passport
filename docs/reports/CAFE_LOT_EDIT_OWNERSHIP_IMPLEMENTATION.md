# Café Lot-edit Ownership — Implementation

Implements the minimal fix approved in `CAFE_LOT_EDIT_OWNERSHIP_AUDIT.md`
(Classification: B). **Not yet closed** — see STATUS at the bottom: the
required live browser E2E (TEST 1, 4, 7) could not be executed. A
follow-up session explicitly asked to retry browser access before doing
anything else; three further connection attempts (spaced ~10s and ~20s
apart) all returned the same "browser extension is not connected" result,
in addition to the five attempts from the prior session — eight
consecutive failures in total across two sessions. No code was changed and
no commit was attempted in this follow-up, per that session's own
instruction to leave code/commit untouched if the browser remains
unavailable after a reasonable reconnect attempt. Per the original task's
instruction ("если какой-либо тест невозможно выполнить — явно укажи
BLOCKED, а не называй его PASS"), those three tests are reported BLOCKED,
not PASS, and **no commit was made**, per the task's own gate ("не коммить
до тех пор, пока все обязательные acceptance tests и validation не
PASS").

## CURRENT PROBLEM

Café's `app/dashboard/cafe/[lotId]/edit/page.tsx` rendered the roaster's
full `LotBuilderForm` and, on submit, called `saveLot(updated)` — a
localStorage-only write with no Supabase call at all. That local override
then unconditionally shadowed the real canonical Lot for every surface
reading `useLots()` on the same device (including the guest-facing Public
Passport), while presenting a fully convincing "success" (redirect, no
error) to the café user. See the audit for full evidence.

## EXACT CHANGES

1. **`components/coffee/FlavorSlider.tsx`** — added an optional
   `disabled?: boolean` prop (default `false`), applied to the underlying
   `<input type="range">`. Every existing caller (`TastingForm.tsx`,
   `CuppingForm.tsx`, and `LotBuilderForm.tsx`'s own roaster usage) omits
   it, so behavior there is unchanged.
2. **`components/roaster/LotBuilderForm.tsx`** — added an optional
   `readOnly?: boolean` prop (default `false`):
   - `onSave` is now optional (`onSave?: (lot: Lot) => void`) — a
     `readOnly` render never calls it.
   - `handleSubmit` early-returns when `readOnly` (`if (readOnly ||
     !lotId) return;`) — defense in depth, since there is no submit button
     rendered in that mode anyway.
   - Every text input, the Q-Score number input, the story textarea, the
     four roast-type radio inputs, and all four `FlavorSlider` instances
     now receive `disabled={readOnly}`.
   - The catalog toggle button also receives `disabled={readOnly}`
     (defense in depth — café never reaches this section at all, since
     `canEditCatalogFlag={false}` already hides it).
   - The bottom "Далее →" / "Сохранить изменения" button is suppressed
     entirely when `readOnly` (`{readOnly ? null : ...}`) — there is no
     Canonical-Lot save action left to click.
   - A short read-only banner is shown when `readOnly`: "Эти данные
     принадлежат обжарщику — кофейня видит их только для справки и не
     может их изменить."
   - Defaults preserve the roaster's exact prior behavior: neither
     `app/dashboard/roaster/[lotId]/edit/page.tsx` nor
     `app/dashboard/roaster/new/page.tsx` passes `readOnly`, so both keep
     using the form exactly as before.
3. **`app/dashboard/cafe/[lotId]/edit/page.tsx`**:
   - Removed the `saveLot` import and the `handleSave` function entirely.
   - `LotBuilderForm` is now called with `readOnly` and no `onSave` prop.
   - Heading changed from "Редактировать карточку лота" to "Карточка
     лота" — the page still lets café edit its own Signature Recipe, but
     no longer implies the Lot card itself is editable.
   - The Signature Recipe section (`SignatureRecipeForm` →
     `addBrewingRecipe(recipe)`) is **completely untouched** — confirmed by
     `git diff`, the only remaining lines in that block are identical to
     before this change.

## CANONICAL FIELDS MADE READ-ONLY

Every field `LotBuilderForm` collects for an existing Lot, on café's page:
name, country, region, farmer name, farm name, altitude, variety,
processing, crop year, descriptors, roast type, Q-Score, the four Taste
Intent sliders (acidity/sweetness/body/bitterness), and the origin story.
`status` and `inRoasterCatalog` were already unreachable from this page
before this change (no `CanonicalLotStatusControl` on café's page;
`canEditCatalogFlag={false}` already hid the catalog toggle) and remain
so.

## CAFÉ-OWNED FIELDS LEFT EDITABLE

The Signature Recipe section (`components/cafe/SignatureRecipeForm.tsx` →
`addBrewingRecipe()`, a `BrewingRecipe` with `authorType: 'coffee_shop'`)
— entirely unchanged, still fully editable, still saved through its
existing path.

## SAVE PATH — BEFORE / AFTER

**Before:**
```
Café edits any field → submits LotBuilderForm
  → onSave = handleSave(updated)
  → saveLot(updated)                      // localStorage write, no Supabase call
  → router.push('/dashboard/cafe')        // implied success
```

**After:**
```
Café opens the page → LotBuilderForm renders with readOnly
  → every input disabled, no submit button rendered
  → handleSubmit is unreachable (no button) and would no-op even if
    reached (readOnly guard)
  → onSave is undefined — never called
  → saveLot is not imported in this file at all
```

Signature Recipe's own save path is unchanged in both states:
`SignatureRecipeForm`'s `onSave` → `addBrewingRecipe(recipe)`.

## LOCAL SHADOWING — BEFORE / AFTER

**Before:** `saveLot(updated)` wrote the café's edited Lot into
`lib/data/lotsStore.ts`'s localStorage override, which `computeAll()`
prefers unconditionally over anything `syncLotsFromSupabase()` would
otherwise return for that same `id`, on every future read on that browser
(`useLots()`, used by the café dashboard itself and by the guest-facing
Public Passport if the same device shows it).

**After:** grep-confirmed zero references to `saveLot` remain anywhere in
`app/dashboard/cafe/[lotId]/edit/page.tsx`. `lib/data/lotsStore.ts` itself
is untouched by this block. There is no code path left in the café Lot-edit
screen capable of writing to the Lot override cache, so no new shadow can
ever be created from this screen going forward.

## ACCEPTANCE TESTS 1–7

| # | Test | Result |
|---|---|---|
| 1 | Café opens Lot — all fields visible, read-only, correct values | **BLOCKED** — requires live browser render; the extension never connected this session (5 attempts). Static evidence only: `showOrigin`/`showLotBasics`/`showMetrics`/`showStory` are all unconditionally true when editing (`!isCreating`), and `toFormState(initialLot)` is unchanged, so every field's displayed value is identical to before this change — only its interactivity changed. |
| 2 | Café cannot edit Canonical Lot — inputs/sliders disabled, no save action, no `saveLot()` call | **PASS** (code-verified) — every relevant input/textarea/radio/slider carries `disabled={readOnly}`; the Save/Next button is suppressed (`{readOnly ? null : ...}`); `saveLot` is not imported or referenced anywhere in the café page (grep-confirmed, zero matches outside an explanatory comment). |
| 3 | No local shadow after opening the page and any café action | **PASS** (code-verified) — no code path in the café page can call `saveLot`/mutate the local override; `lib/data/lotsStore.ts` is untouched. |
| 4 | Public Passport shows canonical values, unaffected by café edit | **BLOCKED** — requires opening the same Lot's Public Passport in a live browser after visiting café's page; not executed (browser tool unavailable). Follows logically from TEST 3 (no override is ever created to begin with), but not independently re-confirmed live. |
| 5 | Signature Recipe still saves via its existing path | **PASS** (code-verified) — `git diff` shows the entire Signature Recipe block byte-identical to before this change. |
| 6 | Roaster flow (`/dashboard/roaster/[lotId]/edit`) continues to edit/save Canonical Lot, Taste Intent, Roast Intent unchanged | **PASS** (code-verified) — neither `app/dashboard/roaster/[lotId]/edit/page.tsx` nor `app/dashboard/roaster/new/page.tsx` was touched by this block (confirmed: I did not open or edit either file), and neither passes the new `readOnly` prop, so the default (`false`) applies — behavior identical to before. `tsc`/`build` both pass with these files included. |
| 7 | Reload after café interaction — canonical values unchanged, no shadowing | **BLOCKED** — requires a live reload in a browser; not executed. Follows logically from TEST 3, not independently re-confirmed live. |

## TSC

`npx tsc --noEmit` — clean, no errors.

## VITEST

`npx vitest run` — 23/23 passed (3 test files, all pre-existing from the
prior Taste Intent block; no new automated tests were added for this
block — this is a UI/ownership fix with no new pure-logic function to
unit-test, and the task's own validation section calls for
browser/targeted E2E here, not new unit tests).

## BUILD

`npm run build` — succeeded, all 39 routes generated, including
`/dashboard/cafe/[lotId]/edit` and `/dashboard/roaster/[lotId]/edit`.

## BROWSER E2E

**Not completed.** The Claude-in-Chrome browser extension reported "not
connected" on eight consecutive attempts (`tabs_context_mcp`) across two
sessions: five in the original implementation session (backoff waits of
5s, 15s, 20s), and three more in a dedicated follow-up session whose only
task was to retry browser access before anything else (backoff waits of
~10s, ~20s). No workaround was attempted (no headless-browser package was
installed to substitute for it — that would be new tooling this task's own
scope rules don't call for). TEST 1, 4, and 7 above require this and remain
BLOCKED, not PASS, per instruction. No code was changed and no commit was
made in the follow-up session either, per its own explicit instruction to
leave code/commit untouched if the browser is still unavailable after a
reasonable reconnect attempt.

## FILES CHANGED

- `components/coffee/FlavorSlider.tsx` — new optional `disabled` prop (additive, backward-compatible).
- `components/roaster/LotBuilderForm.tsx` — new optional `readOnly` prop (additive, backward-compatible; roaster's own two call sites unaffected).
- `app/dashboard/cafe/[lotId]/edit/page.tsx` — removed `saveLot`/`handleSave`; `LotBuilderForm` now called with `readOnly`; heading text adjusted.

Note: both `components/roaster/LotBuilderForm.tsx` and
`app/dashboard/cafe/[lotId]/edit/page.tsx` already carried unrelated,
pre-existing uncommitted work from earlier session blocks before this task
started (`LotBuilderForm.tsx` has an already-uncommitted Phase 4.5.9
`LotOriginDefaults`/`initialOrigin` addition, confined to the props/
`toFormState` area; `FlavorSlider.tsx` had no pre-existing changes). When
this block is ready to commit, the same surgical staging technique used in
prior blocks this session (extract the `git show HEAD:<file>` baseline,
apply only this block's edits, verify the remaining working-tree diff is
exclusively the other block's content, then `git hash-object`/`git
update-index --cacheinfo`) will be required for `LotBuilderForm.tsx`
specifically — confirmed feasible: the pre-existing diff is fully confined
to the top of the file (the props destructuring and `toFormState`), while
every one of this block's edits lives in the JSX return body with zero
overlap.

## COMMIT HASH

None — no commit was made this session.

## BRANCH

`main` (unchanged, nothing pushed).

## PUSH RESULT

Not attempted — no commit exists to push.

---

**STATUS: BLOCKED**

Three of seven required acceptance tests (1, 4, 7) could not be executed
because the browser tool was unavailable for the entire session after
implementation was complete. All code-verifiable criteria (TEST 2, 3, 5,
6) pass, and `tsc`/`vitest`/`build` all pass. This is not a defect in the
fix itself — every blocked test is blocked by tool availability, not by
observed incorrect behavior — but per the task's own instruction, a
blocked required test must be reported as BLOCKED, not PASS, and the block
must not be declared complete or committed on that basis.

**GIT: NO COMMIT / NO PUSH** — validation is incomplete; the task's own
gate ("не коммить до тех пор, пока все обязательные acceptance tests и
validation не PASS") was followed. Re-run TEST 1, 4, and 7 once browser
access is available, then proceed to the surgical-staging commit described
under FILES CHANGED above.
