import type { CoffeeShop } from '@/lib/types/coffee';

export const COFFEE_SHOPS: CoffeeShop[] = [
  { id: 'shop-xo-vsevolozhsk', name: 'XO Coffee', city: 'Всеволожск' },
  { id: 'shop-a-spb', name: 'Coffee Shop A', city: 'Санкт-Петербург' },
  { id: 'shop-b-peterhof', name: 'Coffee Shop B', city: 'Петергоф' },
];

export function getCoffeeShopById(id: string): CoffeeShop | undefined {
  return COFFEE_SHOPS.find((shop) => shop.id === id);
}
