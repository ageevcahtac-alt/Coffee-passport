import type { CoffeeShop } from '@/lib/types/coffee';
import { PartnerAutocomplete } from './PartnerAutocomplete';

// Search-driven picker over the accredited coffee-shop partner list (see
// lib/data/coffeeShops.ts — every entry there already passed the partner
// contract + admin-activation pipeline, so `shops` is accredited-only by
// construction). Replaces the old fixed-3-plaque radio UI, which only ever
// worked because the seed list happened to have exactly three shops.
export function CoffeeShopSelector({
  shops,
  value,
  onChange,
}: {
  shops: CoffeeShop[];
  value: string | null;
  onChange: (shopId: string) => void;
  name?: string;
}) {
  return (
    <PartnerAutocomplete
      label="Кофейня"
      emptyLabel="Найти аккредитованную кофейню…"
      options={shops.map((shop) => ({ id: shop.id, name: shop.name, subtitle: shop.city }))}
      value={value}
      onChange={onChange}
    />
  );
}
