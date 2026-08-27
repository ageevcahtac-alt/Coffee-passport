import type { Lot } from '@/lib/types/coffee';

// LOT-XO-ETH-001 is the primary demo lot — the one the demo QR resolves to.
// A couple of extra lots exist so the shop/brew/tasting flow can be tested
// against more than one coffee.
export const LOTS: Lot[] = [
  {
    id: 'LOT-XO-ETH-001',
    roasterId: 'roaster-xo',
    name: 'Ethiopia Guji',
    country: 'Ethiopia',
    region: 'Guji',
    process: 'Washed',
    harvestYear: 2026,
    qGrade: 87.0,
    roastProfile: 'Pure Roast®',
    descriptors: ['Peach', 'Jasmine', 'Citrus', 'Honey'],
  },
  {
    id: 'LOT-XO-COL-004',
    roasterId: 'roaster-xo',
    name: 'Colombia Huila',
    country: 'Colombia',
    region: 'Huila',
    process: 'Natural',
    harvestYear: 2025,
    qGrade: 85.5,
    roastProfile: 'Pure Roast®',
    descriptors: ['Red apple', 'Caramel', 'Cocoa'],
  },
  {
    id: 'LOT-NS-KEN-002',
    roasterId: 'roaster-north',
    name: 'Kenya Nyeri',
    country: 'Kenya',
    region: 'Nyeri',
    process: 'Washed',
    harvestYear: 2025,
    qGrade: 88.5,
    roastProfile: 'Light Filter',
    descriptors: ['Blackcurrant', 'Tomato', 'Brown sugar'],
  },
];

export function getLotById(id: string): Lot | undefined {
  return LOTS.find((lot) => lot.id === id);
}
