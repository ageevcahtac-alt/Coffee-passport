import type { Roaster } from '@/lib/types/coffee';

export const ROASTERS: Roaster[] = [
  { id: 'roaster-xo', name: 'XO COFFEE Roasting', slug: 'xo-coffee' },
  { id: 'roaster-north', name: 'North Star Roasters', slug: 'north-star' },
];

export function getRoasterById(id: string): Roaster | undefined {
  return ROASTERS.find((roaster) => roaster.id === id);
}
