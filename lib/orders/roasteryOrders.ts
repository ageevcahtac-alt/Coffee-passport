import { SEED_COFFEE_SHOPS } from '@/lib/data/coffeeShopSeed';

// Coffee Shop -> Roastery orders and the roastery's production queue.
//
// XO COFFEE Admin is the source of truth for all of it (orders, production,
// statuses, quantities, audit — see lib/integrations/xoAdmin.ts); Passport
// keeps no copy. This module is the pure, framework-free part shared by the
// API routes (app/api/cafe/roastery-orders, app/api/roaster/production) and
// the cabinet pages: the wire types Admin returns, Russian labels, and
// validation of what the browser is allowed to send.

// ---------------------------------------------------------------------------
// Wire types (shape of Admin's /api/integrations/coffee-passport/* data)
// ---------------------------------------------------------------------------

export interface CatalogVariant {
  id: string;
  weight_grams: number;
  price: number;
}

export interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  passport_public_id: string | null;
  variants: CatalogVariant[];
}

export type DestinationType = 'coffee_shop' | 'roastery_pickup';
export type OrderStatus = 'new' | 'accepted' | 'cancelled' | 'completed';
export type ProductionStatus =
  | 'queued'
  | 'in_production'
  | 'produced'
  | 'ready_for_shipping'
  | 'shipped'
  | 'cancelled';
export type OrderSource = 'xo_store' | 'coffee_shop' | 'manual';

export interface ShopOrderItem {
  product_name: string;
  passport_public_id: string | null;
  weight_grams: number;
  quantity: number;
  unit_price: number | string;
  line_total: number | string;
}

export interface ShopOrder {
  id: string;
  number: string;
  status: OrderStatus;
  created_at: string;
  accepted_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  completed_at: string | null;
  total: number | string;
  contact: string | null;
  destination_type: DestinationType | null;
  destination_label: string | null;
  destination_address: string | null;
  items: ShopOrderItem[];
  production: {
    status: ProductionStatus;
    produced_units: number | null;
    shipped_units: number | null;
    started_at: string | null;
    completed_at: string | null;
    ready_for_shipping_at: string | null;
    shipped_at: string | null;
  } | null;
}

export interface ProductionItem {
  product_name: string;
  passport_public_id: string | null;
  weight_grams: number;
  quantity: number;
  from_stock: number;
  to_produce: number;
}

export interface ProductionEvent {
  event_type: string;
  actor_role: string;
  created_at: string;
  reason: string | null;
  metadata: Record<string, unknown>;
}

export interface ProductionJob {
  id: string;
  production_number: string;
  status: ProductionStatus;
  produced_units: number | null;
  shipped_units: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  ready_for_shipping_at: string | null;
  shipped_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  unit: { code: string; name: string; type: 'own' | 'partner' } | null;
  source: OrderSource;
  order: {
    id: string;
    number: string;
    status: OrderStatus;
    source: OrderSource;
    source_ref: string | null;
    source_name: string | null;
    destination_type: DestinationType | null;
    destination_label: string | null;
    destination_address: string | null;
    accepted_at: string | null;
  } | null;
  items: ProductionItem[];
  events?: ProductionEvent[];
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  queued: 'В очереди',
  in_production: 'В производстве',
  produced: 'Произведено',
  ready_for_shipping: 'Готово к отгрузке',
  shipped: 'Отгружено',
  cancelled: 'Отменено',
};

export const SOURCE_LABELS: Record<OrderSource, string> = {
  xo_store: 'Интернет-магазин',
  coffee_shop: 'Кофейня',
  manual: 'Ручное задание',
};

export const DESTINATION_TYPE_LABELS: Record<DestinationType, string> = {
  coffee_shop: 'Доставка в кофейню',
  roastery_pickup: 'Самовывоз из ростерии',
};

export const EVENT_LABELS: Record<string, string> = {
  ORDER_CREATED: 'Заказ создан',
  ORDER_ACCEPTED: 'Заказ принят XO COFFEE',
  ORDER_CANCELLED: 'Заказ отменён',
  ORDER_COMPLETED: 'Заказ завершён',
  PRODUCTION_CREATED: 'Производственное задание создано',
  PRODUCTION_STARTED: 'Производство начато',
  PRODUCTION_COMPLETED: 'Производство завершено',
  PRODUCTION_READY_FOR_SHIPPING: 'Готово к отгрузке',
  PRODUCTION_SHIPPED: 'Отгружено',
  PRODUCTION_CANCELLED: 'Производство отменено',
};

export const ACTOR_LABELS: Record<string, string> = {
  system: 'Система',
  store: 'Интернет-магазин',
  coffee_shop: 'Кофейня',
  owner: 'XO COFFEE',
  admin: 'XO COFFEE',
  store_admin: 'XO COFFEE',
  roasting_manager: 'Ростерия',
  partner_roaster: 'Ростерия-партнёр',
  unattributed: 'Система',
};

/** The one forward step a roastery can take from each status, and its button. */
export const NEXT_STEP: Partial<Record<ProductionStatus, { to: TransitionTarget; label: string; confirm: string }>> = {
  queued: { to: 'in_production', label: 'Начать производство', confirm: 'Начать производство по этому заданию?' },
  in_production: {
    to: 'produced',
    label: 'Завершить производство',
    confirm: 'Зафиксировать завершение производства? Укажите фактически произведённое количество.',
  },
  produced: { to: 'ready_for_shipping', label: 'Готово к отгрузке', confirm: 'Отметить заказ готовым к отгрузке?' },
  ready_for_shipping: {
    to: 'shipped',
    label: 'Отгрузить',
    confirm: 'Зафиксировать отгрузку? Укажите количество отгруженных упаковок.',
  },
};

/** What the coffee shop sees as its order's progress (commercial + production). */
export function shopOrderStage(order: Pick<ShopOrder, 'status' | 'production'>): { label: string; tone: StageTone } {
  if (order.status === 'cancelled') return { label: 'Отменён', tone: 'muted' };
  if (order.status === 'completed') return { label: 'Выполнен', tone: 'done' };
  if (order.status === 'new') return { label: 'Ожидает подтверждения XO COFFEE', tone: 'waiting' };
  switch (order.production?.status) {
    case 'in_production':
      return { label: 'В производстве', tone: 'active' };
    case 'produced':
      return { label: 'Произведено, готовится к отгрузке', tone: 'active' };
    case 'ready_for_shipping':
      return { label: 'Готов к отгрузке', tone: 'active' };
    case 'shipped':
      return { label: 'Отгружен', tone: 'done' };
    case 'cancelled':
      return { label: 'Производство отменено', tone: 'muted' };
    default:
      return { label: 'Принят, в очереди на производство', tone: 'active' };
  }
}
export type StageTone = 'waiting' | 'active' | 'done' | 'muted';

export function productionTone(status: ProductionStatus): StageTone {
  if (status === 'shipped') return 'done';
  if (status === 'cancelled') return 'muted';
  if (status === 'queued') return 'waiting';
  return 'active';
}

/**
 * A production job that still needs the roastery's attention: accepted by
 * XO COFFEE, queued, and not yet started. Anything further along
 * (in_production and later) or cancelled — including a queued job whose
 * order was cancelled — is not "new". Drives the new-order badge only; no
 * state is kept, so a job stops counting once production starts.
 */
export function isNewProductionJob(job: Pick<ProductionJob, 'status' | 'order'>): boolean {
  return job.status === 'queued' && job.order?.status !== 'cancelled';
}

export function countNewProductionJobs(jobs: Pick<ProductionJob, 'status' | 'order'>[]): number {
  return jobs.filter(isNewProductionJob).length;
}

export type SourceFilter = 'all' | 'xo_store' | 'coffee_shop';
export const SOURCE_FILTERS: { id: SourceFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'xo_store', label: 'Интернет-магазин' },
  { id: 'coffee_shop', label: 'Кофейня' },
];

export function filterBySource(jobs: ProductionJob[], filter: SourceFilter): ProductionJob[] {
  return filter === 'all' ? jobs : jobs.filter((job) => job.source === filter);
}

/** "Кофейня: XO Coffee" / "Интернет-магазин" — who the job is for. */
export function describeSource(job: Pick<ProductionJob, 'source' | 'order'>): string {
  if (job.source === 'coffee_shop') {
    return `Кофейня: ${job.order?.source_name ?? '—'}`;
  }
  return SOURCE_LABELS[job.source] ?? job.source;
}

/** Where the goods go once shipped. */
export function describeDestination(job: Pick<ProductionJob, 'source' | 'order'>): string {
  const order = job.order;
  if (job.source === 'coffee_shop' && order?.destination_type) {
    const parts = [DESTINATION_TYPE_LABELS[order.destination_type], order.destination_label, order.destination_address];
    return parts.filter(Boolean).join(' · ');
  }
  if (job.source === 'xo_store') return 'Служба доставки / покупатель интернет-магазина';
  return '—';
}

export function sumUnits(items: Pick<ProductionItem, 'quantity' | 'from_stock' | 'to_produce'>[]) {
  return items.reduce(
    (acc, item) => ({
      quantity: acc.quantity + item.quantity,
      fromStock: acc.fromStock + item.from_stock,
      toProduce: acc.toProduce + item.to_produce,
    }),
    { quantity: 0, fromStock: 0, toProduce: 0 }
  );
}

export function formatWeight(grams: number): string {
  return grams >= 1000 && grams % 1000 === 0 ? `${grams / 1000} кг` : `${grams} г`;
}

export function formatMoney(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
}

// ---------------------------------------------------------------------------
// Coffee shop identity (server side)
// ---------------------------------------------------------------------------

export interface ShopIdentity {
  id: string;
  name: string;
  city: string;
}

/**
 * The signed-in cafe's canonical identity, from its own profiles.cafe_id —
 * never from anything the browser sends. Name/city come from the seed
 * coffee-shop records (lib/data/coffeeShopSeed.ts), the same records the
 * cabinet header shows.
 */
export function resolveShopIdentity(cafeId: string | null): ShopIdentity | null {
  if (!cafeId) return null;
  const shop = SEED_COFFEE_SHOPS.find((candidate) => candidate.id === cafeId);
  if (!shop) return null;
  return { id: shop.id, name: shop.name, city: shop.city };
}

export const ROASTERY_PICKUP_LABEL = 'Ростерия XO COFFEE (самовывоз)';

export function destinationLabel(type: DestinationType, shop: ShopIdentity): string {
  return type === 'coffee_shop' ? `${shop.name} · ${shop.city}` : ROASTERY_PICKUP_LABEL;
}

// ---------------------------------------------------------------------------
// Validation of browser input
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
export const MAX_ORDER_LINES = 50;
export const MAX_LINE_QUANTITY = 1000;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface CafeOrderRequest {
  idempotencyKey: string;
  destinationType: DestinationType;
  address: string | null;
  contact: string | null;
  items: { variantId: string; quantity: number }[];
}

const cleanText = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, max) : null;

/**
 * Body of POST /api/cafe/roastery-orders. Deliberately has NO shop id, name,
 * price, weight or lot field: those are resolved server-side (shop from the
 * session, everything else by Admin from its own catalog). Anything extra
 * the browser sends is ignored.
 */
export function parseCafeOrderRequest(body: unknown): Parsed<CafeOrderRequest> {
  if (typeof body !== 'object' || body === null) return { ok: false, error: 'Некорректный запрос.' };
  const raw = body as Record<string, unknown>;
  if (typeof raw.idempotency_key !== 'string' || !KEY_RE.test(raw.idempotency_key)) {
    return { ok: false, error: 'Некорректный ключ запроса. Обновите страницу.' };
  }
  if (raw.destination_type !== 'coffee_shop' && raw.destination_type !== 'roastery_pickup') {
    return { ok: false, error: 'Выберите способ получения.' };
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    return { ok: false, error: 'Добавьте в заказ хотя бы одну позицию.' };
  }
  if (raw.items.length > MAX_ORDER_LINES) {
    return { ok: false, error: `Не больше ${MAX_ORDER_LINES} позиций в одном заказе.` };
  }
  const items: CafeOrderRequest['items'] = [];
  const seen = new Set<string>();
  for (const entry of raw.items) {
    const item = (entry ?? {}) as Record<string, unknown>;
    if (!isUuid(item.variant_id)) return { ok: false, error: 'Некорректная позиция заказа.' };
    if (
      typeof item.quantity !== 'number' ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > MAX_LINE_QUANTITY
    ) {
      return { ok: false, error: `Количество — целое число от 1 до ${MAX_LINE_QUANTITY}.` };
    }
    const variantId = item.variant_id.toLowerCase();
    if (seen.has(variantId)) return { ok: false, error: 'Одна и та же фасовка указана дважды.' };
    seen.add(variantId);
    items.push({ variantId, quantity: item.quantity });
  }
  const destinationType = raw.destination_type;
  const address = destinationType === 'coffee_shop' ? cleanText(raw.address, 300) : null;
  return {
    ok: true,
    value: {
      idempotencyKey: raw.idempotency_key,
      destinationType,
      address,
      contact: cleanText(raw.contact, 200),
      items,
    },
  };
}

export type TransitionTarget = 'in_production' | 'produced' | 'ready_for_shipping' | 'shipped';
const TRANSITION_TARGETS: TransitionTarget[] = ['in_production', 'produced', 'ready_for_shipping', 'shipped'];

/** Body of POST /api/roaster/production/:id/transition — { to, units? }. */
export function parseTransitionRequest(body: unknown): Parsed<{ to: TransitionTarget; units: number | null }> {
  const raw = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (!TRANSITION_TARGETS.includes(raw.to as TransitionTarget)) {
    return { ok: false, error: 'Неизвестное действие.' };
  }
  const to = raw.to as TransitionTarget;
  if (raw.units === undefined || raw.units === null) return { ok: true, value: { to, units: null } };
  if (to !== 'produced' && to !== 'shipped') {
    return { ok: false, error: 'Количество указывается только при завершении или отгрузке.' };
  }
  if (typeof raw.units !== 'number' || !Number.isInteger(raw.units) || raw.units < 0 || raw.units > 100000) {
    return { ok: false, error: 'Количество — целое неотрицательное число.' };
  }
  return { ok: true, value: { to, units: raw.units } };
}
