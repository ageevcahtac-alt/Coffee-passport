import { NextResponse } from 'next/server';
import { requireStaffApi } from '@/lib/auth/requireStaffApi';
import { xoAdmin } from '@/lib/integrations/xoAdmin';
import { adminJson, badRequest, readJson } from '@/lib/orders/respond';
import { destinationLabel, parseCafeOrderRequest, resolveShopIdentity } from '@/lib/orders/roasteryOrders';

// Coffee Shop -> Roastery orders, from the existing cafe cabinet.
// The shop is ALWAYS the signed-in cafe_admin's own profiles.cafe_id; the
// request body/query cannot name another shop. Admin holds the orders.
export const dynamic = 'force-dynamic';

function unknownShop() {
  return NextResponse.json(
    { error: 'Кофейня этого аккаунта не найдена в Coffee Passport.', code: 'forbidden' },
    { status: 403 }
  );
}

/** GET — this shop's own orders (newest first). */
export async function GET() {
  const auth = await requireStaffApi('cafe_admin');
  if (!auth.ok) return auth.response;
  const shop = resolveShopIdentity(auth.profile.cafeId);
  if (!shop) return unknownShop();
  return adminJson(await xoAdmin.listShopOrders(shop.id));
}

/**
 * POST { idempotency_key, destination_type, address?, contact?, items: [{ variant_id, quantity }] }
 * Retrying with the same idempotency_key (double click, refresh, timeout)
 * returns the order created the first time.
 */
export async function POST(request: Request) {
  const auth = await requireStaffApi('cafe_admin');
  if (!auth.ok) return auth.response;
  const shop = resolveShopIdentity(auth.profile.cafeId);
  if (!shop) return unknownShop();

  const parsed = parseCafeOrderRequest(await readJson(request));
  if (!parsed.ok) return badRequest(parsed.error);

  const result = await xoAdmin.createShopOrder({
    idempotencyKey: parsed.value.idempotencyKey,
    shop: { id: shop.id, name: shop.name },
    actorUserId: auth.profile.userId,
    contact: parsed.value.contact,
    destination: {
      type: parsed.value.destinationType,
      label: destinationLabel(parsed.value.destinationType, shop),
      address: parsed.value.address,
    },
    items: parsed.value.items,
  });
  return adminJson(result, 201);
}
