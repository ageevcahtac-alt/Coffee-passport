'use client';

import { PRO_GRINDER_MODELS, ESPRESSO_MACHINE_MODELS } from '@/lib/types/coffee';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { EquipmentGarage } from '@/components/coffee/EquipmentGarage';

// No real cafe auth wired up yet — same pilot-shop scoping as the rest of
// app/dashboard/cafe/(hub)/*.
const ACTIVE_SHOP_ID = 'shop-xo-vsevolozhsk';

export default function CafeEquipmentPage() {
  const shop = getCoffeeShopById(ACTIVE_SHOP_ID);

  return (
    <div>
      <p className="section-label mb-2">Гараж кофейни</p>
      <p className="text-sm text-ink-500 mb-8">
        Витринный сетап заведения — показывается гостям и коллегам как эталонная настройка кофейни.
      </p>
      <EquipmentGarage
        ownerId={ACTIVE_SHOP_ID}
        ownerName={shop?.name ?? 'Кофейня'}
        grinderOptions={PRO_GRINDER_MODELS}
        machineOptions={ESPRESSO_MACHINE_MODELS}
      />
    </div>
  );
}
