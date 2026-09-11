'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CoffeeShop, Lot } from '@/lib/types/coffee';
import { useBaristaProfiles } from '@/lib/data/useBaristaProfiles';
import { UNSPECIFIED_BARISTA_ID } from '@/lib/data/baristas';
import { useCurrentUser } from '@/lib/auth/currentUser';
import { BaristaProfileCard } from '@/components/barista/BaristaProfileCard';

// Same teardrop marker silhouette as CoffeeBeltMap's real pins, reused here
// so the ritual visually foreshadows the actual map.
const PIN_MARKER_PATH =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z';

// The "Печать Фермера" reward moment — intercepts the taste flow right
// after a save, before any navigation happens (see taste/page.tsx). All
// four beats stagger in via animation-delay (same reveal-pop/rise/fade
// idiom as the passport page's own unlock sequence) rather than a manual
// timer state machine — simpler and nothing to get out of sync.
//
// Deliberately not dismissible by backdrop click: the close (×) sends the
// guest to the lot's own passport page (where the fuller unlock/comparison
// already lives), the gold CTA sends them to the Coffee Belt map instead —
// both are real destinations, there's no plain "cancel" once the tasting
// is already saved.
export function FarmerPinningModal({
  lot,
  shop,
  baristaId,
}: {
  lot: Lot;
  shop: CoffeeShop;
  // Optional — only barista's own card (Кадр 3.5) renders when this points
  // at a real, named barista (not the "Не указан" placeholder every shop
  // roster carries — see lib/data/baristas.ts).
  baristaId?: string | null;
}) {
  const router = useRouter();
  const barista = useBaristaProfiles().find((candidate) => candidate.id === baristaId);
  const showBarista = Boolean(barista && barista.id !== UNSPECIFIED_BARISTA_ID);

  // P16 — the tasting this ritual is celebrating was just saved locally
  // (see addTastingRecord in taste/page.tsx): for a signed-in Guest that
  // already reached Supabase, but for an anonymous guest it only lives in
  // this browser's localStorage under their per-device anon id until they
  // log in (claimAnonymousUserData in lib/auth/currentUser.tsx then
  // re-owns it automatically — already wired, not touched here). Offering
  // the save CTA only to !isAuthenticated is what keeps a signed-in Guest
  // from ever seeing an irrelevant "create an account" prompt (§16).
  const { isAuthenticated } = useCurrentUser();
  const [saveDismissed, setSaveDismissed] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/75 backdrop-blur-md p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Печать Фермера"
    >
      <div className="relative w-full max-w-sm rounded-md bg-parchment-100 px-6 py-10 text-center shadow-xl">
        <button
          type="button"
          onClick={() => router.push(`/passport/${lot.id}`)}
          aria-label="Закрыть"
          className="absolute top-3 right-3 text-ink-400 text-2xl leading-none px-1 hover:text-ink-700"
        >
          ×
        </button>

        {/* Кадр 1 — заголовок и рука с булавкой */}
        <div className="reveal-pop mb-6">
          <span className="text-5xl inline-block animate-bounce" aria-hidden="true">
            🖐️📍
          </span>
          <h2 className="font-display text-2xl text-ink-900 mt-3">Печать Фермера</h2>
        </div>

        {/* Кадр 2 — булавка втыкается в карту региона, импульс цвета бренда */}
        <div className="reveal-rise mb-6" style={{ animationDelay: '0.6s' }}>
          <svg viewBox="0 0 120 120" className="w-24 h-24 mx-auto" aria-hidden="true">
            <circle
              cx={60}
              cy={64}
              r={12}
              fill="none"
              stroke={shop.brandColor}
              strokeWidth={2}
              className="animate-ping"
              style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
            />
            <g transform="translate(48,42) scale(1.4)">
              <path d={PIN_MARKER_PATH} fill={shop.brandColor} stroke="var(--color-parchment-100)" strokeWidth={1} />
              <circle cx={12} cy={9} r={2.6} fill="var(--color-parchment-100)" />
            </g>
          </svg>
          <p className="font-display text-lg text-ink-900 mt-1">{lot.country}</p>
        </div>

        {/* Кадр 3 — текст подтверждения */}
        <div className="reveal-fade mb-8" style={{ animationDelay: '1.4s' }}>
          <p className="text-sm text-ink-700 leading-relaxed">
            Фермер отметил <strong className="font-medium">{lot.country}</strong> булавкой{' '}
            <span
              className="inline-block w-2.5 h-2.5 rounded-full align-middle mx-0.5"
              style={{ backgroundColor: shop.brandColor }}
              aria-hidden="true"
            />{' '}
            <strong className="font-medium">{shop.name}</strong> на карте Кофейного пояса!
          </p>
        </div>

        {/* Кадр 3.5 — кто приготовил чашку, опционально */}
        {showBarista && barista && (
          <div className="reveal-fade mb-8" style={{ animationDelay: '1.7s' }}>
            <BaristaProfileCard barista={barista} />
          </div>
        )}

        {/* Кадр 3.7 — "Сохранить в Coffee Passport" (P16) — offered only to
            an anonymous guest, only once, right after they've already seen
            their result: this is the value-first registration moment
            §4/§5 of P16 require, never a gate the guest has to pass through
            to get here. Dismissing it just hides this block; Кадр 4 below
            (already the guest's existing "continue anonymously" path)
            stays fully available either way — nothing here blocks it. */}
        {!isAuthenticated && !saveDismissed && (
          <div className="reveal-fade mb-6 rounded-md border border-gold-400 bg-gold-50 p-4" style={{ animationDelay: '1.85s' }}>
            <p className="text-sm text-ink-900 leading-relaxed mb-3">
              Сохрани эту дегустацию в своём Coffee Passport — и собирай свою историю кофе.
            </p>
            <button
              type="button"
              onClick={() => router.push(`/auth/login?next=${encodeURIComponent(`/passport/${lot.id}`)}`)}
              className="inline-flex items-center justify-center w-full rounded-md bg-gold-500
                         text-parchment-100 font-body font-semibold text-sm px-6 py-4
                         hover:bg-gold-400 transition-colors"
            >
              Сохранить в Coffee Passport
            </button>
            <button
              type="button"
              onClick={() => setSaveDismissed(true)}
              className="mt-3 text-xs text-ink-400 underline underline-offset-2 hover:text-ink-700"
            >
              Не сейчас
            </button>
          </div>
        )}

        {/* Кадр 4 — золотая кнопка перехода к карте */}
        <div className="reveal-fade" style={{ animationDelay: '2s' }}>
          <button
            type="button"
            onClick={() => router.push('/journey')}
            className="inline-flex items-center justify-center w-full rounded-md bg-gold-500
                       text-parchment-100 font-body font-semibold text-sm px-6 py-4
                       hover:bg-gold-400 transition-colors"
          >
            Перейти к карте путешествия
          </button>
        </div>
      </div>
    </div>
  );
}
