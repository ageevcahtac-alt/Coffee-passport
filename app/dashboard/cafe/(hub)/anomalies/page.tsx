'use client';

import { useStaffSession } from '@/lib/auth/staffSession';
import { ShopAnomaliesPanel } from '@/components/cafe/ShopAnomaliesPanel';

// «Аномалии» — read-only прозрачность для владельца: запретов не вводим,
// подозрительное он видит глазами (топ кэшбэка, чеки выше порога, фильтр
// по бариста). Доступ — только кабинет кофейни (requireStaffRole('cafe_admin')
// в app/dashboard/cafe/layout.tsx), бариста экран не видит.
export default function CafeAnomaliesPage() {
  const { cafeId } = useStaffSession();
  if (!cafeId) return null;

  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-ink-500">
        Бариста вводит суммы чеков вручную. Этот экран ничего не запрещает и ничего не меняет — он
        показывает, где начисления выглядят необычно, чтобы вы могли сверить их глазами с кассой.
      </p>
      <ShopAnomaliesPanel shopId={cafeId} />
    </div>
  );
}
