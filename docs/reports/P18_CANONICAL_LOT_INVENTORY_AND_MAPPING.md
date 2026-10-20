# P18 — Coffee Passport Canonical Lot Inventory & XO COFFEE Mapping Strategy

## 1. Исходный commit

- **Coffee Passport** (this repo, `coffee-pasport`): `37c1535` — "P16: enable
  anonymous tasting save flow" (current `HEAD`, branch `main`, 2 commits
  ahead of `origin/main`). No commits were made during this audit; `HEAD`
  is unchanged at the time this report is written.
- **XO COFFEE** (`C:\Users\User\Desktop\xo-coffee-pureroast`, referenced
  read-only for Step 2 — not modified): `HEAD` = `f4421de` — "P17: Lot ID
  audit and Coffee Passport public.lots.public_id mapping check
  (audit-only, no code changes)". That commit's own report
  (`P17_LOT_ID_PUBLIC_ID_MAPPING_AUDIT.md`) records its audited baseline as
  `351c933` ("P14: connect XO COFFEE with Coffee Passport") — i.e. `351c933`
  is the commit P17 audited *from*, not the P17 result commit itself. Noted
  here because the P18 brief names `351c933` as "P17 завершён на commit" —
  the actual completion commit is `f4421de`; flagging the discrepancy
  rather than silently correcting or ignoring it.

**Uncommitted working-tree files in Coffee Passport, untouched by this
audit** (present before this session started, confirmed unrelated to P18):
`app/(site)/passport/[lotId]/taste/page.tsx`, `app/auth/actions.ts`.

## 2. Источник live данных

Queried directly against the live Supabase project via its REST API
(`https://vodmmtzclvqemcujwmdf.supabase.co/rest/v1/...`), using the same
publishable/anon key the deployed app itself uses (from `.env.local`) —
i.e. exactly the rows and columns a public, unauthenticated request would
see, respecting the real RLS policies from `0025_canonical_lot_rls.sql`.
Not sourced from `seed/seed.sql`, not sourced from TypeScript types, not
inferred from migrations, not invented. Tables read: `lots`, `roasters`,
`coffees`, `green_lots`, `reference_taste_profiles`, `roast_batches`,
`coffee_shops`.

`roast_batches` and `coffee_shops` came back empty (`[]`) — genuinely no
rows exist yet, not a query failure.

## 3–4. Фактический список Canonical Lots + public_id

All 8 rows currently in `public.lots` (the entire live table, no filter):

| public_id | name | roaster | status | q_grade | roast_type | legacy_text_id |
|---|---|---|---|---|---|---|
| `LOT-XO-ETH-001` | Ethiopia Guji | XO COFFEE Roasting | **active** | 87.0 | filter | `LOT-XO-ETH-001` |
| `LOT-XO-COL-004` | Colombia Huila | XO COFFEE Roasting | **active** | 85.5 | omni | `LOT-XO-COL-004` |
| `LOT-XO-ETH-002` | TEST FLOW A | XO COFFEE Roasting | draft | 85.0 | filter | — |
| `LOT-XO-ETH-003` | TEST FLOW B | XO COFFEE Roasting | draft | 85.0 | filter | — |
| `LOT-XO-ETH-004` | TEST FLOW D | XO COFFEE Roasting | draft | 86.0 | filter | — |
| `LOT-XO-COL-001` | TEST FLOW C | XO COFFEE Roasting | draft | 85.0 | filter | — |
| `LOT-NS-KEN-002` | Kenya Nyeri | North Star Roasters | **active** | 88.5 | filter | `LOT-NS-KEN-002` |
| `LOT-NS-ETH-003` | Ethiopia Yirgacheffe | North Star Roasters | **active** | 89.0 | filter | `LOT-NS-ETH-003` |

**Real-data finding, not busywork**: 4 of the 6 `roaster-xo` lots
(`LOT-XO-ETH-002/003/004`, `LOT-XO-COL-001`) are `status: draft`, empty
`descriptors`, and named `"TEST FLOW A/B/C/D"` — these are P16's own E2E
test fixtures (created 2026-09-08, the day P16 ran its manual pass; see
`P16_ANONYMOUS_TASTING_SAVE_FLOW.md` §10.4 which already flagged one test
*account* left behind — these four test *Lots* are the same category of
residue, just not previously enumerated). They are excluded from mapping
consideration below: no real name, no descriptors, no `legacy_text_id`,
`draft` status. Only **2 of 8** live Lots are real, active,
publicly-meaningful catalog entries: `LOT-XO-ETH-001` and
`LOT-XO-COL-004`.

Full underlying evidence (`coffees`/`green_lots` joined by hand, since
this pass only had SELECT access, no service-role writes were performed):

| public_id | country | region | farm | producer | variety | processing | harvest | descriptors |
|---|---|---|---|---|---|---|---|---|
| `LOT-XO-ETH-001` | Ethiopia | Guji | Guji Hambela Washing Station | Kochere Cooperative | Heirloom | Washed | 2025/2026 | Peach, Jasmine, Citrus, Honey |
| `LOT-XO-COL-004` | Colombia | Huila | Finca El Mirador | Diego Samboní | Castillo, Caturra | Natural | 2024/2025 | Red apple, Caramel, Cocoa |
| `LOT-NS-KEN-002` | Kenya | Nyeri | Tekangu Factory | Tekangu Farmers Cooperative | SL28, SL34 | Washed | 2024/2025 | Blackcurrant, Tomato, Brown sugar |
| `LOT-NS-ETH-003` | Ethiopia | Yirgacheffe | Yirgacheffe Konga Washing Station | Konga Cooperative | Heirloom | Natural | 2024/2025 | Blueberry, Bergamot, Dark chocolate |

## 5–7. Сопоставление с XO COFFEE Lot.id — confirmed / unresolved / missing

XO COFFEE's 8 `Lot.id` values (`src/data/lots.json` at `xo-coffee-pureroast`
`HEAD` `f4421de`, unchanged since P14 per that repo's own P17 report):
`lot-014`, `lot-027`, `lot-031`, `lot-042`, `lot-056`, `espresso-nol`,
`espresso-ugol`, `specialty-degustation`.

| XO COFFEE Lot.id | Coffee Passport public_id | Status | Evidence |
|---|---|---|---|
| `lot-014` (Ethiopia, Guji, farm "Станция Уорка Сакаро", variety Гейша/Курме, Q 89.5, Washed) | `LOT-XO-ETH-001` (Ethiopia, Guji, farm "Guji Hambela Washing Station", variety Heirloom, Q 87.0, Washed) | **unresolved** | Country + region match. Farm name, variety, and Q-grade all differ (Гейша/Курме ≠ Heirloom; 89.5 ≠ 87.0; different washing station). Sensory partially overlaps (Jasmine, Honey, Peach common) but XO adds Bergamot where CP has Citrus. Same broad origin, but three independent factual fields contradict a 1:1 identity — per the task's explicit rule, name/region similarity alone is not sufficient. |
| `lot-027` (Colombia, Huila, farm "Финка Эль-Параисо", variety Castillo, Q 85.0, Natural) | `LOT-XO-COL-004` (Colombia, Huila, farm "Finca El Mirador", variety Castillo/Caturra, Q 85.5, Natural) | **unresolved** | Country + region + processing match, Q-grade close (85.0 vs 85.5), variety overlaps (Castillo). But the farm name is different ("Эль-Параисо" vs "El Mirador" — not the same place) and sensory descriptors have zero overlap (Red cherry/cane sugar/fig vs Red apple/caramel/cocoa). A farm-name mismatch is a decisive fact, not a translation artifact. |
| `lot-031` (Kenya, Nyeri, farm "Кооператив Тегу", variety SL28/SL34, Q 87.5, Washed) | `LOT-NS-KEN-002` (Kenya, Nyeri, farm "Tekangu Factory", variety SL28/SL34, Q 88.5, Washed) | **unresolved** | Country + region + variety + processing all match, and "Тегу"/"Tekangu" are plausibly the same cooperative name in different transliteration. **However this Coffee Passport Lot belongs to `North Star Roasters`, not `XO COFFEE Roasting`.** A Lot owned by a different roaster entity cannot be silently treated as XO COFFEE's product without an explicit business relationship (e.g. a resale/white-label agreement) that is not documented anywhere in either repo. This is the strongest partial match in the whole set, but the roaster mismatch blocks confirmation. |
| `lot-042` (Guatemala, Huehuetenango) | — | **missing** | No Guatemala-origin Lot exists anywhere in the live `public.lots` table (checked all 8 rows). |
| `lot-056` (Peru, Cajamarca) | — | **missing** | No Peru-origin Lot exists in the live table. |
| `espresso-nol` (Brazil/Colombia blend) | — | **missing** | No blended/multi-origin Lot exists in `public.lots` — the schema's `coffees` table has one `country` field per row (Stage 3 §01: "no global origin canonicalization"), so a two-origin blend has no structural home in the current Canonical Lot model, independent of whether a matching product exists. |
| `espresso-ugol` (Brazil/Guatemala blend) | — | **missing** | Same as above — no blend support in the current schema, and no Brazil or Guatemala origin present in live data. |
| `specialty-degustation` (Ethiopia/Kenya/Colombia 3-lot set) | — | **missing** | A bundled multi-lot gift set is not a single Lot by definition; Canonical Lot models one coffee per row. Even if all three components existed individually, this XO "Lot.id" would not correspond to any single `public_id`. |

**Result: 0 confirmed, 3 unresolved, 5 missing.** No mapping row reached
the bar for `confirmed` — every near-match had at least one directly
contradicting fact (farm name, variety, Q-grade, or roaster ownership).

## 8. Какие Lots нужно создать или дополнить в Coffee Passport

**None, as part of P18.** Per the task's explicit constraint, no Lot is
created solely to fill an XO COFFEE gap. Two structural (not
data-completeness) gaps worth surfacing to the product owner, not acted on
here:

- The Canonical Lot model has no representation for a blend (multiple
  countries under one Lot) or a multi-lot bundle — `espresso-nol`,
  `espresso-ugol`, and `specialty-degustation` cannot be represented as a
  single `public.lots` row today regardless of mapping decisions. This is
  a modeling question for whoever owns Canonical Lot architecture, not
  something this audit should decide or implement.
- If `lot-014`/`lot-027`/`lot-031` are in fact the same physical coffees
  as their closest Coffee Passport counterparts (just recorded with
  different farm names/varieties/Q-grades by whichever side entered them
  more recently), the correction belongs in whichever system's data is
  stale — that determination requires the roaster/product owner, not an
  agent guessing which of two conflicting Q-grades is "right."

## 9. Какие данные нужно передать XO COFFEE

**Nothing yet.** With zero confirmed mappings, there is no
`{xo_lot_id: public_id}` pair that can be handed to XO COFFEE without it
being invented. What XO COFFEE's own team needs to provide before this can
move forward: for each of its 8 `Lot.id` values, a factual confirmation
(from purchase/import records, not marketing copy) of exactly which
physical coffee purchase it corresponds to — country, farm, variety,
harvest, and ideally the roaster's own internal contract/lot reference —
so it can be checked against Coffee Passport's `coffees`/`green_lots`
tables using the same non-negotiable evidence bar this audit applied.

## 10. QR / deep-link contract (final)

```
https://<COFFEE_PASSPORT_DOMAIN>/passport/<public.lots.public_id>
```

Confirmed against the live route (`app/(site)/passport/[lotId]/page.tsx`)
and RLS (`0025_canonical_lot_rls.sql`):

- The route param is looked up directly as `public_id`
  (`findCanonicalLotByPublicId` → `eq('public_id', publicId)`,
  `syncLotsFromSupabase(params.lotId)`) — nothing else.
- `public_id` is immutable in practice: `MutableCanonicalLotFields`
  (`lib/data/canonicalLotStore.ts`) explicitly excludes `public_id` from
  its type, and grep across `lib/` confirms no code path ever includes
  `public_id` in an `update()` call — the only place it's written is the
  one-time `insert` in `createCanonicalLot`.
- The route carries **no** auth gate: `middleware.ts`'s matcher is
  `['/admin/:path*', '/api/admin/:path*']` only, and `public.lots` grants
  `select` to `anon` with policy `using (true)` — confirmed live via the
  anon key in Step 1's query, which is the same key/policy pair any
  unauthenticated QR scan uses.
- The URL depends on **none** of: `orderNumber`, user ID, purchase ID,
  anonymous session id, or café/shop ID — the shop-selection step
  (`LocationStep`) shown on the page is client-side UI state entered
  *after* the Lot itself already resolved from the URL; it never
  participates in the lookup.

**No production domain is defined or confirmed anywhere in this repo**
(no `NEXT_PUBLIC_SITE_URL`, no `vercel.json`, no deployment config found) —
`<COFFEE_PASSPORT_DOMAIN>` is a placeholder, not a value to invent. Must
not use: XO COFFEE's internal slug (`lot-014` etc. — confirmed not equal
to any `public_id`), `orderNumber`, order number, or a random user UUID.

QR generation itself is **not implemented** in this pass, per the task's
explicit instruction not to build it yet.

## 11. Blockers

1. **No confirmed Lot.id ↔ public_id mapping exists.** Every one of the 3
   plausible candidates has a contradicting fact (see §5–7). Proceeding
   past this point requires either corrected source data or an explicit
   product decision, not more inference.
2. **Roaster-identity ambiguity on the single strongest candidate**
   (`lot-031` ↔ `LOT-NS-KEN-002`): that Lot belongs to `North Star
   Roasters`, a different roaster entity than `XO COFFEE Roasting`, with
   no documented relationship between the two in this codebase.
3. **No production domain is defined** for the QR contract's host —
   confirmed absent, not filled with a guess.
4. **Test-data pollution in the live table**: 4 of 8 `public.lots` rows
   under `roaster-xo` are `draft`-status E2E fixtures from P16
   (`TEST FLOW A–D`), reducing the real XO COFFEE catalog in Coffee
   Passport to 2 active Lots. Not blocking this report, but relevant
   context for whoever next queries this table expecting a clean catalog.
5. **`espresso-nol` / `espresso-ugol` / `specialty-degustation` have no
   structural home** in the current one-country-per-Lot Canonical Lot
   schema, independent of any mapping decision.

## 12. Рекомендуемый следующий этап

Not a code change. A product-owner decision is needed on exactly two
points before any further engineering step is justified:

1. For the 3 `unresolved` pairs — confirm or deny each one using the
   underlying purchase/contract records (not descriptions), and correct
   whichever side (XO COFFEE's `lots.json` or Coffee Passport's
   `coffees`/`green_lots` rows) is factually stale.
2. Decide whether `North Star Roasters`-owned Lots may ever be exposed
   through an XO COFFEE storefront, since that is the actual blocker on
   the one near-exact match (`lot-031`).

Only after at least one pair is genuinely `confirmed` does a mapping
table/document become meaningful to build — building one now, with zero
confirmed rows, would be the "artificial mapping" this task explicitly
forbids.

---

## Validation (Step 8)

Run from the root of `coffee-pasport` at `HEAD` `37c1535`, working tree
otherwise unchanged (only the two pre-existing uncommitted files noted in
§1, neither touched):

- `npx tsc --noEmit` — **clean, 0 errors.**
- `npm run build` (`next build`) — **succeeded**, 36 routes compiled,
  including `/passport/[lotId]`.
- `npm test` (`vitest run`) — **143/143 passed**, 18 test files, no
  changes made to any test or source file.
- Live Supabase queries (Step 1) — executed against the real project via
  its REST API using the app's own anon key; no fabricated rows, no
  fallback to seed/mock data at any point.
- No new Lot, no new `public_id`, no new slug, and no mapping file/table
  was created — per §12, there is nothing confirmed yet to persist.

No code was changed in this pass, so per the task's own instruction, no
production commit was created. This report itself may be committed as a
docs-only commit, matching this repository's existing practice
(`P15_COFFEE_PASSPORT_INTEGRATION_CONTRACT_AUDIT.md`,
`P16_ANONYMOUS_TASTING_SAVE_FLOW.md`).
