import type { CoffeeShop } from '@/lib/types/coffee';

export const COFFEE_SHOPS: CoffeeShop[] = [
  { id: 'shop-xo-vsevolozhsk', name: 'XO Coffee', city: 'Всеволожск', brandColor: '#D4AF37' },
  { id: 'shop-a-spb', name: 'Coffee Shop A', city: 'Санкт-Петербург', brandColor: '#00A896' },
  { id: 'shop-b-peterhof', name: 'Coffee Shop B', city: 'Петергоф', brandColor: '#E63946' },
];

export function getCoffeeShopById(id: string): CoffeeShop | undefined {
  return COFFEE_SHOPS.find((shop) => shop.id === id);
}
