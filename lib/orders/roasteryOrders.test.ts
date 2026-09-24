import { describe, expect, it } from 'vitest';
import {
  NEXT_STEP,
  describeDestination,
  describeSource,
  destinationLabel,
  filterBySource,
  parseCafeOrderRequest,
  parseTransitionRequest,
  resolveShopIdentity,
  shopOrderStage,
  sumUnits,
  type ProductionJob,
} from './roasteryOrders';

const VARIANT = '0b9d3f0e-7c1a-4c55-9d0e-1a2b3c4d5e6f';

function job(over: Partial<ProductionJob>): ProductionJob {
  return {
    id: 'j',
    production_number: 'PROD-XO-000001',
    status: 'queued',
    produced_units: null,
    shipped_units: null,
    created_at: 't',
    started_at: null,
    completed_at: null,
    ready_for_shipping_at: null,
    shipped_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    unit: { code: 'XO-ROASTING', name: 'XO', type: 'own' },
    source: 'xo_store',
    order: null,
    items: [],
    ...over,
  };
}

describe('shop identity', () => {
  it('resolves the existing XO COFFEE coffee shop from its profile id', () => {
    expect(resolveShopIdentity('shop-xo-vsevolozhsk')).toEqual({ id: 'shop-xo-vsevolozhsk', name: 'XO Coffee', city: 'Всеволожск' });
  });
  it('unknown / missing shop -> null', () => {
    expect(resolveShopIdentity('shop-nope')).toBeNull();
    expect(resolveShopIdentity(null)).toBeNull();
  });
  it('builds the destination label server-side', () => {
    const shop = resolveShopIdentity('shop-xo-vsevolozhsk')!;
    expect(destinationLabel('coffee_shop', shop)).toBe('XO Coffee · Всеволожск');
    expect(destinationLabel('roastery_pickup', shop)).toBe('Ростерия XO COFFEE (самовывоз)');
  });
});

describe('parseCafeOrderRequest', () => {
  const base = { idempotency_key: 'abcdefgh-1', destination_type: 'coffee_shop', address: ' ул. 1 ', items: [{ variant_id: VARIANT, quantity: 2 }] };
  it('keeps only what the browser may decide', () => {
    expect(parseCafeOrderRequest({ ...base, price: 1, coffee_shop_id: 'x' })).toEqual({
      ok: true,
      value: { idempotencyKey: 'abcdefgh-1', destinationType: 'coffee_shop', address: 'ул. 1', contact: null, items: [{ variantId: VARIANT, quantity: 2 }] },
    });
  });
  it('drops the address for pickup', () => {
    const parsed = parseCafeOrderRequest({ ...base, destination_type: 'roastery_pickup' });
    expect(parsed.ok && parsed.value.address).toBeNull();
  });
  it('rejects duplicate variants and over-long carts', () => {
    expect(parseCafeOrderRequest({ ...base, items: [{ variant_id: VARIANT, quantity: 1 }, { variant_id: VARIANT.toUpperCase(), quantity: 1 }] }).ok).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => ({ variant_id: `0b9d3f0e-7c1a-4c55-9d0e-${String(i).padStart(12, '0')}`, quantity: 1 }));
    expect(parseCafeOrderRequest({ ...base, items: many }).ok).toBe(false);
  });
});

describe('parseTransitionRequest', () => {
  it('accepts the four forward steps', () => {
    for (const to of ['in_production', 'produced', 'ready_for_shipping', 'shipped']) {
      expect(parseTransitionRequest({ to }).ok).toBe(true);
    }
  });
  it('refuses cancel and units where they do not belong', () => {
    expect(parseTransitionRequest({ to: 'cancelled' }).ok).toBe(false);
    expect(parseTransitionRequest({ to: 'ready_for_shipping', units: 1 }).ok).toBe(false);
  });
});

describe('labels and views', () => {
  it('coffee shop sees acceptance and production progress', () => {
    expect(shopOrderStage({ status: 'new', production: null }).label).toBe('Ожидает подтверждения XO COFFEE');
    expect(shopOrderStage({ status: 'accepted', production: { status: 'queued' } as never }).label).toBe('Принят, в очереди на производство');
    expect(shopOrderStage({ status: 'accepted', production: { status: 'in_production' } as never }).label).toBe('В производстве');
    expect(shopOrderStage({ status: 'accepted', production: { status: 'shipped' } as never }).label).toBe('Отгружен');
    expect(shopOrderStage({ status: 'cancelled', production: null }).label).toBe('Отменён');
  });

  it('NEXT_STEP walks queued -> in_production -> produced -> ready_for_shipping -> shipped', () => {
    expect(['queued', 'in_production', 'produced', 'ready_for_shipping'].map((s) => NEXT_STEP[s as 'queued']?.to)).toEqual([
      'in_production',
      'produced',
      'ready_for_shipping',
      'shipped',
    ]);
    expect(NEXT_STEP.shipped).toBeUndefined();
    expect(NEXT_STEP.cancelled).toBeUndefined();
  });

  it('source and destination are shown separately', () => {
    const shopJob = job({
      source: 'coffee_shop',
      order: {
        id: 'o',
        number: 'XO-000002',
        status: 'accepted',
        source: 'coffee_shop',
        source_ref: 'shop-xo-vsevolozhsk',
        source_name: 'XO Coffee',
        destination_type: 'coffee_shop',
        destination_label: 'XO Coffee · Всеволожск',
        destination_address: 'Колтушское ш., 1',
        accepted_at: 't',
      },
    });
    expect(describeSource(shopJob)).toBe('Кофейня: XO Coffee');
    expect(describeDestination(shopJob)).toBe('Доставка в кофейню · XO Coffee · Всеволожск · Колтушское ш., 1');
    expect(describeSource(job({}))).toBe('Интернет-магазин');
    expect(describeDestination(job({}))).toBe('Служба доставки / покупатель интернет-магазина');
  });

  it('filters by source', () => {
    const jobs = [job({ id: 'a' }), job({ id: 'b', source: 'coffee_shop' })];
    expect(filterBySource(jobs, 'all').map((j) => j.id)).toEqual(['a', 'b']);
    expect(filterBySource(jobs, 'coffee_shop').map((j) => j.id)).toEqual(['b']);
    expect(filterBySource(jobs, 'xo_store').map((j) => j.id)).toEqual(['a']);
  });

  it('sums quantities', () => {
    expect(sumUnits([{ quantity: 4, from_stock: 1, to_produce: 3 }, { quantity: 2, from_stock: 2, to_produce: 0 }])).toEqual({
      quantity: 6,
      fromStock: 3,
      toProduce: 3,
    });
  });
});
