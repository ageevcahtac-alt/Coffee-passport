import type { Barista } from '@/lib/types/coffee';

export const UNSPECIFIED_BARISTA_ID = 'barista-unspecified';

// Rosters are per coffee shop, matching the real-world fact that a barista
// works at a specific shop. "Не указан" is always available regardless of
// which shop was picked.
export const BARISTAS: Barista[] = [
  { id: 'barista-xo-alexey', name: 'Алексей', coffeeShopId: 'shop-xo-vsevolozhsk' },
  { id: 'barista-xo-maria', name: 'Мария', coffeeShopId: 'shop-xo-vsevolozhsk' },
  { id: 'barista-xo-dmitry', name: 'Дмитрий', coffeeShopId: 'shop-xo-vsevolozhsk' },
  { id: 'barista-a-alexey', name: 'Алексей', coffeeShopId: 'shop-a-spb' },
  { id: 'barista-a-maria', name: 'Мария', coffeeShopId: 'shop-a-spb' },
  { id: 'barista-a-dmitry', name: 'Дмитрий', coffeeShopId: 'shop-a-spb' },
  { id: 'barista-b-alexey', name: 'Алексей', coffeeShopId: 'shop-b-peterhof' },
  { id: 'barista-b-maria', name: 'Мария', coffeeShopId: 'shop-b-peterhof' },
  { id: 'barista-b-dmitry', name: 'Дмитрий', coffeeShopId: 'shop-b-peterhof' },
  { id: UNSPECIFIED_BARISTA_ID, name: 'Не указан', coffeeShopId: '' },
];

export function getBaristasForShop(coffeeShopId: string): Barista[] {
  return [
    ...BARISTAS.filter((barista) => barista.coffeeShopId === coffeeShopId),
    ...BARISTAS.filter((barista) => barista.id === UNSPECIFIED_BARISTA_ID),
  ];
}

export function getBaristaById(id: string): Barista | undefined {
  return BARISTAS.find((barista) => barista.id === id);
}
