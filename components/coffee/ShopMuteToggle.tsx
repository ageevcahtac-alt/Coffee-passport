'use client';

import { useCurrentUser } from '@/lib/auth/currentUser';
import { useMutedShops } from '@/lib/data/useMutedShops';
import { muteShop, unmuteShop } from '@/lib/data/shopMutePreferencesStore';

// "Получать обновления о новых лотах" — default on (per spec). Lives on
// the shop's own page (see app/(site)/shop/[shopId]/page.tsx); flipping it
// off is the same "Отписаться от обновлений этой кофейни" action as the
// quick-hide × on a BarUpdatesPanel announcement card, both routed through
// the same store so either surface immediately reflects the other.
export function ShopMuteToggle({ shopId }: { shopId: string }) {
  const { userId, isAuthenticated, ready } = useCurrentUser();
  const muted = useMutedShops().some((record) => record.userId === userId && record.shopId === shopId);

  if (!ready || !userId) return null;

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-ink-200 bg-parchment-100 px-4 py-3">
      <div>
        <p className="text-sm text-ink-900">Получать обновления о новых лотах</p>
        <p className="text-xs text-ink-400 mt-0.5">Новинки и лоты на выводе этой кофейни — в «Обновлениях на баре»</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!muted}
        aria-label="Получать обновления о новых лотах"
        onClick={() => (muted ? unmuteShop(userId, shopId, isAuthenticated) : muteShop(userId, shopId, isAuthenticated))}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full
                    transition-colors ${!muted ? 'bg-ink-900' : 'bg-ink-200'}`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-parchment-100
                      transition-transform ${!muted ? 'translate-x-6' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}
