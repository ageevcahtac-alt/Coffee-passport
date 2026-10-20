# P19 — Canonical Lot Reconciliation & Data Ownership Decision

## 1. Исходный commit

- **Coffee Passport** (`coffee-pasport`): `HEAD` = `37c1535` ("P16: enable
  anonymous tasting save flow"), branch `main`, 2 ahead of `origin/main`.
  Unchanged since P18 — confirmed via `git rev-parse HEAD` at the start of
  this session. No commits made during this audit.
- **XO COFFEE** (`xo-coffee-pureroast`): `HEAD` = `f4421de` ("P17: Lot ID
  audit..."), branch `master`, 1 ahead of `origin/master`. Unchanged since
  P18. Read-only in this pass — nothing in that repo was modified.
- Pre-existing uncommitted files in Coffee Passport
  (`app/(site)/passport/[lotId]/taste/page.tsx`, `app/auth/actions.ts`)
  remain exactly as found; not read, not touched.

## 2. Источник live данных

Re-queried fresh (not reused from memory of P18) against the live
Supabase REST API, same project (`vodmmtzclvqemcujwmdf.supabase.co`), same
public anon key the deployed app uses. All 8 `public.lots` rows came back
identical to P18's snapshot (same `id`, `updated_at`, `status` for every
row) — no drift between the two audits. This pass additionally queried
`checkins`, `recipes`, and `cafe_menu_entries` (both by `lot_ref` uuid and
by the legacy text `lot_id` column) to check real usage of the 4 draft
"TEST FLOW" Lots — new evidence not gathered in P18, directly relevant to
Step 7 below.

## 3. Полный список Coffee Passport Lots (live, all 8 rows)

| public_id | name | roaster | status | q_grade | process | country/region | farm | variety | harvest |
|---|---|---|---|---|---|---|---|---|---|
| `LOT-XO-ETH-001` | Ethiopia Guji | XO COFFEE Roasting | active | 87.0 | Washed | Ethiopia / Guji | Guji Hambela Washing Station | Heirloom | 2025/2026 |
| `LOT-XO-COL-004` | Colombia Huila | XO COFFEE Roasting | active | 85.5 | Natural | Colombia / Huila | Finca El Mirador | Castillo, Caturra | 2024/2025 |
| `LOT-NS-KEN-002` | Kenya Nyeri | North Star Roasters | active | 88.5 | Washed | Kenya / Nyeri | Tekangu Factory | SL28, SL34 | 2024/2025 |
| `LOT-NS-ETH-003` | Ethiopia Yirgacheffe | North Star Roasters | active | 89.0 | Natural | Ethiopia / Yirgacheffe | Yirgacheffe Konga Washing Station | Heirloom | 2024/2025 |
| `LOT-XO-ETH-002` | TEST FLOW A | XO COFFEE Roasting | **draft** | 85.0 | — | (shares Guji green lot) | — | — | — |
| `LOT-XO-ETH-003` | TEST FLOW B | XO COFFEE Roasting | **draft** | 85.0 | — | (shares Guji green lot #2) | — | — | — |
| `LOT-XO-COL-001` | TEST FLOW C | XO COFFEE Roasting | **draft** | 85.0 | Washed | Colombia / Huila | "Test Farm C" | Caturra | 2026 |
| `LOT-XO-ETH-004` | TEST FLOW D | XO COFFEE Roasting | **draft** | 86.0 | — | (shares Guji green lot #2) | — | — | — |

`altitude` exists only on the underlying `coffees` rows for the 4 real
Lots (1700–2200 м range); the 4 TEST FLOW lots' green lots carry no
altitude (`purchased_kg`/`purchase_date` only, one has `contract_reference:
"TEST-C-001"`/`"TEST-B-001"` and `notes: "Scenario B/C test"`). No
`roast_batches` rows exist for any Lot (table empty). No `checkins` rows
exist at all — the live `checkins` table is completely empty (0 rows), so
no tasting history exists anywhere to cross-check against.

## 4. Полный список XO COFFEE Lots (`src/data/lots.json`, unchanged since P14)

| Lot.id | name | country/region | farm | variety | Q | process | notes |
|---|---|---|---|---|---|---|---|
| `lot-014` | Лот № 014 | Эфиопия / Гуджи | Станция Уорка Сакаро | Гейша, Курме | 89.5 | Washed | microlot |
| `lot-027` | Лот № 027 | Колумбия / Уила | Финка Эль-Параисо | Кастильо | 85.0 | Natural | filter |
| `lot-031` | Лот № 031 | Кения / Ньери | Кооператив Тегу | SL28, SL34 | 87.5 | Washed | microlot |
| `lot-042` | Лот № 042 | Гватемала / Уэуэтенанго | Финка Ла-Флореста | Bourbon, Caturra | 85.5 | Washed | filter |
| `lot-056` | Лот № 056 | Перу / Кахамарка | Кооператив Норандино | Typica, Caturra | 86.0 | Washed | microlot |
| `espresso-nol` | Эспрессо «Ноль» | Бразилия/Колумбия blend | купаж двух ферм | Bourbon, Castillo | 84.0 | Natural/Washed | espresso blend |
| `espresso-ugol` | Эспрессо «Уголь» | Бразилия/Гватемала blend | купаж двух ферм | Bourbon, Typica | 84.5 | Natural | espresso blend |
| `specialty-degustation` | Набор «Дегустация» | Эфиопия/Кения/Колумбия | 3 микролота | Гейша, SL28/34, Кастильо | 87.0 | Washed/Natural | 3-in-1 gift set |

Not modified in this pass (Step 2/Step 10 constraint respected).

## 5. Таблица 8-way reconciliation

| XO Lot.id | XO Coffee Data | Candidate CP public_id | Result | Reason |
|---|---|---|---|---|
| `lot-014` | Ethiopia, Guji, Уорка Сакаро, Гейша/Курме, Q89.5, Washed | `LOT-XO-ETH-001` | **unresolved — contradictory origin** | Country+region match; farm, variety, and Q-grade all differ from the CP row (Guji Hambela WS / Heirloom / 87.0 vs Уорка Сакаро / Гейша,Курме / 89.5). Not one shared decisive field beyond country/region. |
| `lot-027` | Colombia, Huila, Эль-Параисо, Castillo, Q85.0, Natural | `LOT-XO-COL-004` | **unresolved — contradictory origin** | Country+region+process match, Q close (85.0 vs 85.5). Farm name differs (Эль-Параисо ≠ El Mirador — not a transliteration variant, a different named place) and sensory descriptors have zero overlap. |
| `lot-031` | Kenya, Nyeri, Кооператив Тегу, SL28/34, Q87.5, Washed | `LOT-NS-KEN-002` | **foreign roaster** | Country+region+variety+process all match and Q is close (87.5 vs 88.5) — the single strongest resemblance in the set. Blocked outright: the CP row belongs to `North Star Roasters`, not `XO COFFEE Roasting`. Per Step 3's rule, a roaster-ownership conflict forbids mapping regardless of how good the other evidence is. |
| `lot-042` | Guatemala, Huehuetenango | — | **missing in Coffee Passport** | No Guatemala-origin Lot exists anywhere in the live 8-row table. |
| `lot-056` | Peru, Cajamarca | — | **missing in Coffee Passport** | No Peru-origin Lot exists in the live table. |
| `espresso-nol` | Brazil/Colombia blend | — | **not enough evidence** *(structural, not data)* | `coffees.country` is a single-value field (Stage 3 §01 — no origin canonicalization for blends); a 2-origin blend has no row shape to even compare against, independent of whether matching beans exist. |
| `espresso-ugol` | Brazil/Guatemala blend | — | **not enough evidence** *(structural, not data)* | Same structural reason as `espresso-nol`, plus no Brazil or Guatemala Lot exists at all. |
| `specialty-degustation` | 3-origin gift set | — | **not enough evidence** *(structural, not data)* | A bundle of 3 microlots is not one Lot; Canonical Lot models exactly one coffee per row, so this XO SKU cannot correspond to a single `public_id` by definition. |

**0 confirmed. 2 unresolved (contradictory origin). 1 foreign roaster
(blocked). 2 missing. 3 not-enough-evidence (structural).**

## 6. Детальный разбор 3 unresolved / blocked pairs

### `lot-014` ↔ `LOT-XO-ETH-001`
1. **Match:** country (Ethiopia), region (Guji).
2. **Contradict:** farm ("Станция Уорка Сакаро" vs "Guji Hambela Washing
   Station" — different named washing stations), variety ("Гейша, Курме"
   vs "Heirloom" — Geisha/Kurume is a specific varietal claim, Heirloom is
   a generic catch-all, these are not interchangeable descriptions of the
   same trees), Q-grade (89.5 vs 87.0, a 2.5-point gap), sensory overlap
   is partial only (Jasmine/Peach/Honey shared, Bergamot vs Citrus differ).
3. **Likely stale side:** cannot be determined from data alone. A
   Geisha/Kurume microlot at 89.5 reads as a distinct, higher-end lot from
   a generic-Heirloom 87.0 lot — this looks less like "one lot, two
   descriptions" and more like **two different physical lots that happen
   to share a roaster and a broad region**, which is a plausible real-world
   situation (a roaster often buys more than one lot per origin per
   season).
4. **Same physical Green Lot/Coffee Lot?** Cannot be confirmed — no
   contract reference, invoice, or shared identifier exists in either
   system to test this against; `checkins` (which could show a bridge if
   any guest had tasted and referenced both) is entirely empty.
5. **Decision owner:** XO roaster owner (whoever manages `roaster-xo` in
   Coffee Passport / sources these lots) together with a Coffee Passport
   data steward — this requires purchase records neither repo contains.

### `lot-027` ↔ `LOT-XO-COL-004`
1. **Match:** country (Colombia), region (Huila), process (Natural),
   Q-grade close (85.0 vs 85.5).
2. **Contradict:** farm name ("Финка Эль-Параисо" vs "Finca El Mirador" —
   two distinct, real, differently-named farms), variety (Castillo-only
   vs Castillo+Caturra), sensory descriptors share zero terms (Red
   cherry/cane sugar/fig vs Red apple/caramel/cocoa).
3. **Likely stale side:** indeterminate. Farm name is the single most
   concrete identifying fact available and it flatly disagrees — this
   reads as two different lots from the same broad region, not a stale
   copy of one lot.
4. **Same physical Green Lot/Coffee Lot?** No — a farm-name mismatch this
   specific (not a spelling/translation variant) is itself close to
   disproving physical identity, though not provable as "definitely two
   lots" without the roaster's own records.
5. **Decision owner:** XO roaster owner + data steward, same as above.

### `lot-031` ↔ `LOT-NS-KEN-002` (foreign roaster)
1. **Match:** country (Kenya), region (Nyeri), variety (SL28, SL34 —
   exact match), process (Washed), Q-grade close (87.5 vs 88.5), and
   "Кооператив Тегу" / "Tekangu Factory" are plausibly the same
   cooperative under different naming ("Тегу" reads as a truncation or
   informal name for "Tekangu"). This is the closest resemblance across
   the entire XO catalog.
2. **Contradict:** **roaster ownership** — `LOT-NS-KEN-002` belongs to
   `North Star Roasters` (`roaster_id = c08103cc-...`), not `XO COFFEE
   Roasting` (`a8143369-...`). This is a categorical block, not a
   fact that can be outweighed by matching evidence elsewhere.
3. **Likely stale side:** not applicable — this is not a staleness
   question, it's an ownership question (see §8 Foreign Roaster analysis).
4. **Same physical Green Lot/Coffee Lot?** Plausibly yes, in the sense
   that XO's storefront copy may describe green coffee that Coffee
   Passport's North Star roaster also purchased/roasted — coffee green
   lots are frequently sourced through the same importer/exporter by
   multiple roasters. This does not make them the same *commercial Lot*.
5. **Decision owner:** this one is **not** for the XO roaster owner alone
   — it requires whoever owns the Coffee Passport ↔ North Star Roasters
   relationship, since resolving it means deciding whether North Star's
   Lot can be surfaced through an XO-branded channel at all (see §8).

## 7. Разбор 5 missing товаров

| Lot.id | Category | Basis |
|---|---|---|
| `lot-042` (Guatemala) | **C — insufficient Canonical Lot data** (not B/D) | A real, fully-specified SKU (farm, variety, Q-grade, farmStory) exists in XO's own catalog; nothing in Coffee Passport contradicts or discredits it. It simply has no counterpart yet — there's no basis to call it stale, test, or to-be-replaced. |
| `lot-056` (Peru) | **C — insufficient Canonical Lot data** | Same reasoning as `lot-042`: a complete, plausible SKU with no CP counterpart and no evidence against it. |
| `espresso-nol` (blend) | **C, with a structural caveat** | Cannot become a Canonical Lot under the *current* one-country-per-Lot schema regardless of whether the underlying beans exist in Coffee Passport — this is a modeling gap, not a missing-data gap. |
| `espresso-ugol` (blend) | **C, with a structural caveat** | Same as `espresso-nol`. |
| `specialty-degustation` (3-in-1 set) | **C, with a structural caveat** | A bundle SKU is definitionally not a single Lot; no amount of added Canonical Lot data resolves this without a different entity (e.g. a "Set" or "Bundle" concept) that doesn't exist today. |

None of the 5 fall into **B** (old/test/archival — nothing suggests these
are stale internal artifacts; they read as genuine current XO catalog
items) or **D** (needs replacement/delisting — that is a merchandising
call for XO's own team, out of scope for a Coffee Passport-side audit).

**Minimum data needed to create a Canonical Lot for the category-A-shaped
cases** (`lot-042`, `lot-056` — the two that fit the existing schema
without a modeling change), per `0022_canonical_lot_core.sql`'s own
`not null`/required fields: a `roaster_id` (must resolve to a real
`roasters` row — today only `roaster-xo`/`roaster-north` exist, so a
decision on which roaster owns these is a precondition), a `green_lot_id`
(itself requires a `coffee_id`: country, region — `farm`/`producer`/
`variety`/`altitude`/`processing`/`harvest_year` default to `''` if
unknown but should be populated from real purchase records, not invented),
and the Lot's own `name`. **Not created in this pass** — per Step 10, no
Lot may be created without the data/roaster owner's explicit confirmation,
and no such confirmation was sought or given here.

## 8. Foreign roaster ownership — `LOT-NS-KEN-002` / North Star Roasters

New evidence found in this pass (not in P18): live `cafe_menu_entries`
contains exactly 2 rows, and one of them is —

```json
{
  "id": "menu-c78c5854-9094-4be1-8ded-cb89a5cdb648",
  "coffee_shop_id": "shop-xo-vsevolozhsk",
  "lot_id": "LOT-NS-KEN-002",
  "lot_ref": "541975f8-a981-4c2c-8ef4-a438328e0fdb",
  "is_active": false,
  "status": "discontinuing",
  "scheduled_removal_at": "2026-09-05T10:20:00+00:00"
}
```

`shop-xo-vsevolozhsk` (`lib/data/coffeeShops.ts`) is the coffee shop named
**"XO Coffee"** in Всеволожск, whose own description reads: *"Пилотная
кофейня программы Coffee Passport — зерно от нескольких обжарщиков"*
("Pilot café for the Coffee Passport program — beans from several
roasters"). This is a **coffee shop entity**, architecturally distinct
from the **roaster** entity `roaster-xo` ("XO COFFEE Roasting") — they
share a brand name but are different rows in different tables with
different ownership semantics (`is_roaster_staff_for` vs `is_cafe_staff_for`
in `0025_canonical_lot_rls.sql`).

Answering Step 6 directly:

- **Does a café-menu-association mechanism exist?** Yes, and it is
  already in live use: `cafe_menu_entries` links a `coffee_shop_id` to any
  Lot's `lot_id`/`lot_ref`, with no constraint tying the shop to the Lot's
  roaster. The North Star Kenya Lot being listed at the XO-named café is
  exactly this mechanism working as designed.
- **Is displaying another roaster's Lot at a café permitted
  architecturally?** Yes — this is the *existing, intended* trust model
  (§ comment in `0025`: RLS is scoped by roaster-staff-manage-own-Lot for
  writes, but reads are public and menu association is shop-scoped, not
  roaster-scoped). Nothing in the schema or RLS restricts a café to only
  its "own" roaster's Lots.
- **Does this mean XO COFFEE (the D2C storefront) may sell this Lot as
  its own product?** **No — this does not follow.** A physical café
  curating a multi-roaster bar menu is a materially different
  relationship from a D2C storefront listing a Lot as one of its own
  retail SKUs with its own price (per the Step 8 ownership matrix below,
  price/availability are XO's own data, owned by XO, describing something
  XO is selling as its product). The `cafe_menu_entries` precedent
  answers "can a café display someone else's roast on a chalkboard" — it
  does not answer "can a separate commercial storefront retail someone
  else's product," which is a business/licensing question this audit has
  no authority or evidence to resolve.
- **Current state of even the café-menu precedent:** already
  `is_active: false`, `status: "discontinuing"`, with a `scheduled_removal_at`
  that has already passed (2026-09-05, before today 2026-09-12) — i.e.
  this specific cross-roaster listing is itself being wound down, not an
  active endorsement to extend further.

**Conclusion: `LOT-NS-KEN-002` must be excluded from any XO COFFEE
storefront mapping.** No ownership or roaster_id change was made or
considered (Step 6/10 constraint respected).

## 9. Test data hygiene finding

Four `draft`-status Lots exist under `roaster-xo`, all created 2026-09-08
(the day of P16's manual E2E pass), named "TEST FLOW A–D", with empty
`descriptors` and (for A/B/D) no distinguishing coffee data beyond
reusing real green lots. Checked against every table that could reference
a Lot in production:

| public_id | `checkins` (lot_ref) | `checkins` (text lot_id) | `recipes` | `cafe_menu_entries` |
|---|---|---|---|---|
| `LOT-XO-ETH-002` (TEST FLOW A) | none | none | none | none |
| `LOT-XO-ETH-003` (TEST FLOW B) | none | none | none | none |
| `LOT-XO-ETH-004` (TEST FLOW D) | none | none | none | none |
| `LOT-XO-COL-001` (TEST FLOW C) | none | none | none | **1 row — `is_active: true`, `status: "new"`** |

**TEST FLOW A, B, D: no references anywhere.** Safe to consider for
cleanup — genuinely inert test residue.

**TEST FLOW C (`LOT-XO-COL-001`) is not inert.** A live `cafe_menu_entries`
row (`menu-b5757a7c-...`, `coffee_shop_id: shop-xo-vsevolozhsk`) uses the
exact text `lot_id = "LOT-XO-COL-001"`, is currently `is_active: true`,
and was created **2026-09-04 — four days before** the TEST FLOW C
canonical Lot row itself was created (2026-09-08). This ordering shows the
menu entry was not created *as part of* the P16 test flow; it independently
references the same identifier string that the test flow later happened
to reuse when generating a new `public_id` for its Scenario C fixture.
`lot_ref` on this menu row is `null` (never linked to the canonical row),
but `/passport/LOT-XO-COL-001` resolves today because
`findCanonicalLotByPublicId` matches on the text `public_id`, and the
TEST FLOW C draft row happens to occupy that exact string. **Deleting the
TEST FLOW C canonical Lot row without also addressing this menu entry
would silently turn its passport page into "Лот не найден" for whatever
depends on it** — an unintended side effect from what looks like a
pure-test cleanup.

**Recommendation (not executed — Step 7/10 forbid deletion here):**

- `TEST FLOW A / B / D` (`LOT-XO-ETH-002/003/004`) — safe to **delete**
  via a confirmed, separate migration/script once a data owner signs off;
  zero references found anywhere.
- `TEST FLOW C` (`LOT-XO-COL-001`) — **do not delete without first
  resolving `menu-b5757a7c-...`** — either retire that menu entry
  explicitly (it's already `status: "new"` on a pilot café, not clearly
  a real customer-facing listing either) or re-point it, as its own
  separate, confirmed decision. Until then, **archive** (leave `draft`,
  do not touch) rather than delete.
- None of the four should stay silently mixed into the general `lots`
  table indefinitely — a dedicated test/sandbox namespace or a
  `legacy_text_id`/tag convention for QA fixtures would prevent this kind
  of accidental collision in future E2E passes, but introducing that is a
  schema decision for whoever owns Canonical Lot architecture, not
  something to add here.

## 10. Data ownership matrix

| Data Item | Source of Truth | XO Action | Passport Action |
|---|---|---|---|
| Canonical Lot identity | Coffee Passport | consume only | own |
| `public_id` | Coffee Passport | never edit | own |
| Product price | XO COFFEE | own | ignore |
| Availability | XO COFFEE | own | ignore |
| Roaster ownership | Coffee Passport | respect | own |
| Tasting/history | Coffee Passport | link only | own |
| Order data | XO COFFEE | own | do not depend on it |

**XO COFFEE не имеет права создавать Canonical Lot mapping
самостоятельно.** Any `{xo_lot_id: public_id}` pairing must be produced
and confirmed on the Coffee Passport side (or jointly, with Coffee
Passport's live data as the deciding evidence), never unilaterally
authored inside the XO COFFEE repository.

## 11. Итоговый список confirmed mappings

**None.** Zero pairs met the evidence bar in this pass, same as P18. No
mapping — confirmed or provisional — is recorded anywhere as a result of
P19.

## 12. Список blocked mappings

- `lot-014` ↔ `LOT-XO-ETH-001` — blocked pending origin reconciliation
  (farm/variety/Q-grade conflict).
- `lot-027` ↔ `LOT-XO-COL-004` — blocked pending origin reconciliation
  (farm/sensory conflict).
- `lot-031` ↔ `LOT-NS-KEN-002` — blocked, **categorically**, by roaster
  ownership; additionally the closest real-world precedent for
  cross-roaster exposure (the café menu entry) is itself being
  discontinued.
- `lot-042`, `lot-056`, `espresso-nol`, `espresso-ugol`,
  `specialty-degustation` — blocked, no candidate exists to even evaluate
  (missing / structural).

## 13. Рекомендуемый следующий этап

**Not P20 integration implementation yet.** Per the success criterion,
turning uncertainty into a mapping is exactly what must not happen, and
every pair here remains genuinely uncertain or blocked. Concretely, before
any integration code is justified:

1. **XO COFFEE owner** must reconcile `lot-014` and `lot-027` against
   actual purchase/contract records — confirm or correct farm/variety/
   Q-grade on whichever side is wrong. Until then these stay unresolved.
2. **A Coffee Passport / North Star Roasters data steward** must decide,
   as a business question (not a technical one), whether North Star Lots
   may ever be retailed through an XO-branded storefront — current
   evidence (the discontinuing café listing) suggests the answer trends
   toward no, but this audit cannot make that call.
3. **XO's product owner** decides the fate of `lot-042`/`lot-056`/the two
   espresso blends/the degustation set — whether to pursue onboarding
   them as new Coffee Passport Lots (category A/C items in §7), and for
   the blends/set, whether to request a schema change from whoever owns
   Canonical Lot architecture.
4. **A Coffee Passport data owner** must decide the disposition of the 4
   TEST FLOW Lots per §9's recommendation, with special handling for
   `LOT-XO-COL-001` given its live menu-entry entanglement.

Only once at least one pair is genuinely confirmed (or the product owner
explicitly authorizes creating specific new Lots with real data) does a
P20 integration step have anything real to build against.

---

## Validation (Step 11)

No code was changed in either repository during this pass, so:

- **`git status`** in both repos — confirmed unchanged from the start of
  the session (Coffee Passport: same 2 pre-existing uncommitted files,
  nothing added by this session except this report; XO COFFEE: clean,
  1 ahead of `origin/master`, untouched).
- **Live REST queries** — re-ran `lots`, and additionally queried
  `checkins`, `recipes`, `cafe_menu_entries` (by both `lot_ref` and legacy
  text `lot_id`) directly against the same live Supabase project, using
  the app's own anon key; all results quoted verbatim above, nothing
  fabricated.
- **`npx tsc --noEmit`** — re-run, clean, 0 errors (repo unchanged since
  P18's identical result).
- **`npm test`** — not re-run in this pass since no source file changed
  since P18's run (143/143 passed then); re-running would not exercise
  anything different. If this is not acceptable practice, note that P18's
  run is the current baseline.
- **`npm run build`** — not re-run for the same reason (no code changed).
  Per Step 11's own instruction ("проверить production build только если
  это соответствует текущей практике") and Step 10's "не создавать
  фиктивные production changes", re-running an identical build against an
  unchanged tree was judged to add no new information; P18's clean build
  result stands as the current baseline.
- No Lot, `public_id`, mapping file, or migration was created. No
  `public.lots.public_id` was changed. No roaster ownership was changed.
  No test Lot was deleted. XO COFFEE's `src/data/lots.json` was read but
  not modified.

No production commit was created, per Step 10. This report may be
committed as a docs-only commit if requested, matching P15/P16/P18's
existing practice in this repository.
