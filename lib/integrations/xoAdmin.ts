// Coffee Passport -> XO COFFEE Admin, server-to-server only.
//
// Admin is the source of truth for coffee-shop orders and roastery
// production (its migration 0004 + /api/integrations/coffee-passport/*).
// This client is imported ONLY by Passport route handlers
// (app/api/cafe/roastery-orders/**, app/api/roaster/production/**), which
// authenticate the Passport user first and pass Admin the shop/roaster id
// resolved from that session — never an id the browser sent.
//
// The secret is read from XO_ADMIN_INTEGRATION_SECRET (no NEXT_PUBLIC_
// prefix, so Next.js never inlines it into a client bundle) and only ever
// travels in the Authorization header of this fetch. Same fail-closed
// convention as lib/integrations/xoStoreAuth.ts: not configured -> every call
// answers "admin_unavailable", nothing is attempted.
//
// Every non-business failure (not configured, network error, timeout, 401
// from a mis-set secret, 5xx) is reported to the caller as the single
// `admin_unavailable` outcome: the browser learns that Admin could not be
// reached, not why. The real reason goes to the server log.

if (typeof window !== 'undefined') {
  throw new Error('lib/integrations/xoAdmin.ts is server-only and must never be bundled for the browser.');
}

const TIMEOUT_MS = 10_000;

export type AdminErrorCode =
  | 'admin_unavailable'
  | 'invalid'
  | 'forbidden'
  | 'not_found'
  | 'stale'
  | 'not_accepted'
  | 'quantity'
  | 'idempotency_conflict';

export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: AdminErrorCode; error: string };

export const ADMIN_UNAVAILABLE_MESSAGE =
  'Система заказов XO COFFEE сейчас недоступна. Попробуйте ещё раз через минуту.';

const KNOWN_CODES = new Set<AdminErrorCode>([
  'invalid',
  'forbidden',
  'not_found',
  'stale',
  'not_accepted',
  'quantity',
  'idempotency_conflict',
]);

function unavailable(reason: string, detail?: unknown): { ok: false; status: 503; code: 'admin_unavailable'; error: string } {
  console.error(`[xoAdmin] ${reason}`, detail ?? '');
  return { ok: false, status: 503, code: 'admin_unavailable', error: ADMIN_UNAVAILABLE_MESSAGE };
}

export function isXoAdminConfigured(): boolean {
  return Boolean(process.env.XO_ADMIN_INTEGRATION_URL && process.env.XO_ADMIN_INTEGRATION_SECRET);
}

async function call<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<AdminResult<T>> {
  const base = process.env.XO_ADMIN_INTEGRATION_URL;
  const secret = process.env.XO_ADMIN_INTEGRATION_SECRET;
  if (!base || !secret) return unavailable('XO_ADMIN_INTEGRATION_URL / XO_ADMIN_INTEGRATION_SECRET not configured');

  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/+$/, '')}/api/integrations/coffee-passport${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return unavailable(`request to ${path} failed`, error);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Handled below by status.
  }
  const body = (payload ?? {}) as { data?: T; error?: unknown; code?: unknown };

  if (response.ok) {
    if (!('data' in body)) return unavailable(`unexpected response shape from ${path}`);
    return { ok: true, data: body.data as T };
  }
  if (response.status === 401 || response.status >= 500 || response.status === 429) {
    return unavailable(`${path} answered ${response.status}`, body.error);
  }
  const code = typeof body.code === 'string' && KNOWN_CODES.has(body.code as AdminErrorCode)
    ? (body.code as AdminErrorCode)
    : response.status === 404
      ? 'not_found'
      : 'invalid';
  return {
    ok: false,
    status: response.status,
    code,
    error: typeof body.error === 'string' ? body.error : 'Запрос отклонён XO COFFEE.',
  };
}

const q = encodeURIComponent;

export const xoAdmin = {
  catalog: () => call<unknown[]>('/catalog'),

  listShopOrders: (shopId: string) => call<unknown[]>(`/orders?coffee_shop_id=${q(shopId)}`),

  createShopOrder: (input: {
    idempotencyKey: string;
    shop: { id: string; name: string };
    actorUserId: string;
    contact: string | null;
    destination: { type: string; label: string; address: string | null };
    items: { variantId: string; quantity: number }[];
  }) =>
    call<{ orderId: string }>('/orders', {
      method: 'POST',
      body: {
        idempotency_key: input.idempotencyKey,
        coffee_shop: { id: input.shop.id, name: input.shop.name },
        actor_user_id: input.actorUserId,
        contact: input.contact,
        destination: input.destination,
        items: input.items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity })),
      },
    }),

  listProduction: (roasterId: string) => call<unknown[]>(`/production?roaster_id=${q(roasterId)}`),

  getProduction: (id: string, roasterId: string) =>
    call<unknown>(`/production/${q(id)}?roaster_id=${q(roasterId)}`),

  transitionProduction: (
    id: string,
    input: { roasterId: string; actorUserId: string; to: string; units: number | null }
  ) =>
    call<{ production: unknown; already: boolean }>(`/production/${q(id)}/transition`, {
      method: 'POST',
      body: { roaster_id: input.roasterId, actor_user_id: input.actorUserId, to: input.to, units: input.units },
    }),
};
