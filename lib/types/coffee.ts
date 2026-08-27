// Core domain types for the consumer tasting flow.
//
// Split deliberately mirrors the product model: a Lot describes the coffee
// itself (graded once, by the roaster); a TastingRecord describes one
// person's experience of a cup of that lot, at a specific coffee shop,
// prepared with a specific brewing method. The same lot can have many
// tasting records — never overwrite, always append.

export interface Roaster {
  id: string;
  name: string;
  slug: string;
}

export interface Lot {
  id: string; // stable public id, e.g. "LOT-XO-ETH-001" — what the QR encodes
  roasterId: string;
  name: string; // "Ethiopia Guji"
  country: string;
  region: string;
  process: string;
  harvestYear: number;
  qGrade: number;
  roastProfile: string;
  descriptors: string[];
}

export interface CoffeeShop {
  id: string;
  name: string;
  city: string;
}

export const BREWING_METHODS = [
  { id: 'espresso', label: 'Эспрессо' },
  { id: 'v60', label: 'V60 / Воронка' },
  { id: 'chemex', label: 'Chemex / Кемекс' },
  { id: 'aeropress', label: 'AeroPress / Аэропресс' },
  { id: 'siphon', label: 'Сифон' },
  { id: 'batch_brew', label: 'Batch Brew / Батч-брю' },
] as const;

export type BrewingMethodId = (typeof BREWING_METHODS)[number]['id'];

export const SENSORY_TAGS = [
  { id: 'sweetness', label: 'Сладость' },
  { id: 'acidity', label: 'Кислотность' },
  { id: 'brightness', label: 'Яркость' },
  { id: 'body', label: 'Плотность' },
  { id: 'bitterness', label: 'Горечь' },
  { id: 'fruitiness', label: 'Фруктовость' },
  { id: 'floral', label: 'Цветочность' },
  { id: 'chocolate', label: 'Шоколадность' },
  { id: 'citrus', label: 'Цитрусовые' },
  { id: 'berry', label: 'Ягодные' },
] as const;

export type SensoryTagId = (typeof SENSORY_TAGS)[number]['id'];

export interface TastingRecord {
  id: string;
  userId: string; // placeholder until this flow is wired to real auth
  lotId: string;
  roasterId: string;
  coffeeShopId: string;
  brewingMethod: BrewingMethodId;
  rating: number; // 1-5, the consumer's personal rating of this cup
  sensoryTags: SensoryTagId[];
  liked: string;
  disliked: string;
  note: string;
  createdAt: string; // ISO timestamp
}
