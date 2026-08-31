'use client';

import { PRO_GRINDER_MODELS, ESPRESSO_MACHINE_MODELS } from '@/lib/types/coffee';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { EquipmentGarage } from '@/components/coffee/EquipmentGarage';
import { useStaffSession } from '@/lib/auth/staffSession';

export default function CafeEquipmentPage() {
  const { cafeId } = useStaffSession();
  const shop = cafeId ? getCoffeeShopById(cafeId) : undefined;

  return (
    <div>
      <p className="section-label mb-2">Гараж кофейни</p>
      <p className="text-sm text-ink-500 mb-8">
        Витринный сетап заведения — показывается гостям и коллегам как эталонная настройка кофейни.
      </p>
      <EquipmentGarage
        ownerId={cafeId ?? ''}
        ownerName={shop?.name ?? 'Кофейня'}
        ownerKind="coffee_shop"
        grinderOptions={PRO_GRINDER_MODELS}
        machineOptions={ESPRESSO_MACHINE_MODELS}
      />
    </div>
  );
}
