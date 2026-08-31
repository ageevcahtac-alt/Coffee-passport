import type { CoffeeShop, Lot, Roaster } from '@/lib/types/coffee';
import { CoffeeShopSelector } from './CoffeeShopSelector';
import { RoasterAutocomplete } from './RoasterAutocomplete';

// Step 2 of the blind-tasting flow ("Выбор локации/кофейни и обжарщика"):
// one screen, two accredited-partner autocompletes. The roaster field
// defaults to the roaster of the scanned lot (that's what the QR actually
// encodes) but stays editable, same searchable widget as the shop field, in
// case staff need to correct it.
export function LocationStep({
  lot,
  coffeeShops,
  roasters,
  shopId,
  onShopChange,
  roasterId,
  onRoasterChange,
}: {
  lot: Lot;
  coffeeShops: CoffeeShop[];
  roasters: Roaster[];
  shopId: string | null;
  onShopChange: (shopId: string) => void;
  roasterId: string | null;
  onRoasterChange: (roasterId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <CoffeeShopSelector shops={coffeeShops} value={shopId} onChange={onShopChange} />
      <RoasterAutocomplete
        roasters={roasters}
        value={roasterId}
        onChange={onRoasterChange}
        helperText={`Определён по коду лота «${lot.id}» — поправьте, если это не так.`}
      />
    </div>
  );
}
