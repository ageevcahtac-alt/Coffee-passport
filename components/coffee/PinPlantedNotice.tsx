import Link from 'next/link';
import type { Lot, Roaster } from '@/lib/types/coffee';

// The bridge beat between "profile unlocked" and the Coffee Belt map on
// /journey — confirms the pin the farmer just planted (see CoffeeBeltMap's
// pin-farmer-drop/pin-plant animation) without literally animating a
// farmer walking between pages.
export function PinPlantedNotice({
  lot,
  roaster,
  animate = false,
}: {
  lot: Lot;
  roaster: Roaster;
  animate?: boolean;
}) {
  return (
    <div
      className={`rounded-md border border-ink-200 bg-parchment-100 p-5 text-center ${animate ? 'reveal-fade' : ''}`}
    >
      <p className="text-3xl mb-2" aria-hidden="true">
        📍
      </p>
      <p className="text-sm text-ink-900 leading-relaxed mb-1">
        Фермер отметил <strong className="font-medium">{lot.country}</strong> булавкой{' '}
        <span
          className="w-2.5 h-2.5 rounded-full inline-block align-middle mx-0.5"
          style={{ backgroundColor: roaster.color }}
          aria-hidden="true"
        />{' '}
        <strong className="font-medium">{roaster.name}</strong> на карте Кофейного пояса.
      </p>
      <p className="text-xs text-ink-400 mb-4">Оценка уже улетела в аналитику обжарщика.</p>
      <Link
        href="/journey"
        className="inline-flex items-center justify-center rounded-md bg-ink-900
                   text-parchment-100 font-body font-medium text-sm px-5 py-3
                   hover:bg-ink-800 transition-colors"
      >
        Посмотреть на карте
      </Link>
    </div>
  );
}
