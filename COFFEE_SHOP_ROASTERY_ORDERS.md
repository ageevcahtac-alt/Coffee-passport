# Coffee Shop → Roastery orders (Production + Logistics)

Existing coffee shop cabinet → order → XO COFFEE Admin (acceptance) → production → existing roaster cabinet → produced → ready for shipping → shipped → visible to the coffee shop.

## What was reused

| Piece | Existing thing used |
|---|---|
| Coffee shop | `profiles.cafe_id` (`shop-xo-vsevolozhsk`) + seed shop record (`lib/data/coffeeShopSeed.ts`, moved verbatim out of `coffeeShops.ts`) |
| Cafe cabinet | `/dashboard/cafe` hub, new tab **«Заказы в ростерию»** |
| Roastery | `profiles.roaster_id` (`roaster-xo`), existing `/dashboard/roaster`, new screen **«Производство и отгрузка»** |
| Roles / auth | `profiles.role` (`cafe_admin`, `roaster_admin`) — `lib/auth/requireStaffApi.ts` is the JSON twin of `requireStaffRole.ts` |
| Catalog | Admin's published products + packaging variants (same as XO Store), each tied to a Canonical Lot by `passport_public_id` |
| Orders / production / audit / reconciliation | XO COFFEE Admin (`orders`, `production_orders`, `order_events`, triggers of migration 0003) |

Passport stores **no** orders, production or audit — every screen reads Admin's authoritative state and reloads it after each mutation.

## Flow

1. Cafe `POST /api/cafe/roastery-orders` → Passport resolves the shop from the session → Admin `POST /api/integrations/coffee-passport/orders` → `place_coffee_shop_order()` (source `coffee_shop`, shop id/name, destination snapshot, idempotency key; production created `queued` on XO-ROASTING in the same transaction).
2. Admin operator accepts the order (existing `order_accept`). Until then the job is invisible to the roastery and cannot start (DB trigger, `XOT04`).
3. Roaster `GET /api/roaster/production` → Admin `passport_list_production(roaster_id)` — only units whose `production_units.passport_roaster_id` is that roaster.
4. Start → Complete (produced units ≤ to_produce) → Ready for shipping → Ship (1 ≤ shipped ≤ produced + from_stock) via `passport_production_transition()`; retries answer `already`.
5. Cafe sees status/progress in its orders tab.

## Security

- Browser never talks to Admin; secret `XO_ADMIN_INTEGRATION_SECRET` is server-only (verified absent from `.next/static`).
- Shop id and roaster id come only from the signed-in profile; body/query ids are ignored (tested).
- Partner roaster → sees/moves only its own units; XO jobs answer 404.
- Admin unavailable / misconfigured / timeout → generic 503 `admin_unavailable`, details only in server log.

## Env

Passport: `XO_ADMIN_INTEGRATION_URL`, `XO_ADMIN_INTEGRATION_SECRET`. Admin: `PASSPORT_INTEGRATION_SECRET` (same value).

## Admin migration

`xo-coffee-admin/supabase/migrations/20260924120000_coffee_shop_orders.sql` — **must be applied manually** in Admin's Supabase (SQL Editor, one run) before the feature works in production. Verified on PGlite together with 0002/0003 (`coffeeShopOrdersSql.test.ts`, and the XO Store suite `fulfillmentSql.test.ts` re-run on top of it). Admin's existing Store pages do not depend on it.
