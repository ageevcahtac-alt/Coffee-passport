import type { Barista } from '@/lib/types/coffee';

export const UNSPECIFIED_BARISTA_ID = 'barista-unspecified';

// Rosters are per coffee shop, matching the real-world fact that a barista
// works at a specific shop. "Не указан" is always available regardless of
// which shop was picked.
// favoriteOrigin/favoriteBrewMethod/avatarUrl are the personal-preference
// layer added in supabase/migrations/0015_barista_profiles.sql — seeded
// here only for the pilot shop's three named baristas (matching the flavor
// text lib/data/staff.ts already gives them); every other entry starts
// unset ('') until its own profile row is created. See
// lib/data/baristaProfileStore.ts for the merge-with-Supabase-overrides
// layer that makes these editable.
export const BARISTAS: Barista[] = [
  { id: 'barista-xo-alexey', name: 'Алексей', coffeeShopId: 'shop-xo-vsevolozhsk', favoriteOrigin: 'Эфиопия', favoriteBrewMethod: 'v60', avatarUrl: '' },
  { id: 'barista-xo-maria', name: 'Мария', coffeeShopId: 'shop-xo-vsevolozhsk', favoriteOrigin: 'Колумбия', favoriteBrewMethod: 'aeropress', avatarUrl: '' },
  { id: 'barista-xo-dmitry', name: 'Дмитрий', coffeeShopId: 'shop-xo-vsevolozhsk', favoriteOrigin: 'Кения', favoriteBrewMethod: 'espresso', avatarUrl: '' },
  { id: 'barista-a-alexey', name: 'Алексей', coffeeShopId: 'shop-a-spb', favoriteOrigin: '', favoriteBrewMethod: '', avatarUrl: '' },
  { id: 'barista-a-maria', name: 'Мария', coffeeShopId: 'shop-a-spb', favoriteOrigin: '', favoriteBrewMethod: '', avatarUrl: '' },
  { id: 'barista-a-dmitry', name: 'Дмитрий', coffeeShopId: 'shop-a-spb', favoriteOrigin: '', favoriteBrewMethod: '', avatarUrl: '' },
  { id: 'barista-b-alexey', name: 'Алексей', coffeeShopId: 'shop-b-peterhof', favoriteOrigin: '', favoriteBrewMethod: '', avatarUrl: '' },
  { id: 'barista-b-maria', name: 'Мария', coffeeShopId: 'shop-b-peterhof', favoriteOrigin: '', favoriteBrewMethod: '', avatarUrl: '' },
  { id: 'barista-b-dmitry', name: 'Дмитрий', coffeeShopId: 'shop-b-peterhof', favoriteOrigin: '', favoriteBrewMethod: '', avatarUrl: '' },
  { id: UNSPECIFIED_BARISTA_ID, name: 'Не указан', coffeeShopId: '', favoriteOrigin: '', favoriteBrewMethod: '', avatarUrl: '' },
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
