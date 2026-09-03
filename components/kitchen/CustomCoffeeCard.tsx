import type { UserCustomCoffee } from '@/lib/types/kitchen';

// One shelf item on "Мой кофе" — reads like a small passport card, but
// every field is exactly what the user typed by hand (see
// lib/types/kitchen.ts — UserCustomCoffee), never a catalog lookup.
export function CustomCoffeeCard({
  coffee,
  cuppingCount,
  onClick,
}: {
  coffee: UserCustomCoffee;
  cuppingCount: number;
  onClick?: () => void;
}) {
  const origin = [coffee.region, coffee.farm].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-md border border-ink-200 bg-parchment-100 overflow-hidden
                 hover:border-gold-400 transition-colors"
    >
      <div className="aspect-[4/3] bg-parchment-200 flex items-center justify-center overflow-hidden">
        {coffee.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URL, not a Next-optimizable local asset
          <img src={coffee.photoUrl} alt={coffee.lotName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-3xl opacity-40" aria-hidden="true">
            ☕
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-display text-lg text-ink-900 leading-tight truncate">{coffee.lotName}</h3>
        {coffee.roasterName && (
          <p className="text-xs uppercase tracking-widest2 text-ink-400 mt-1 truncate">{coffee.roasterName}</p>
        )}
        {origin && <p className="text-sm text-ink-700 mt-2 truncate">{origin}</p>}
        {coffee.purchaseLocation && <p className="text-xs text-ink-400 mt-1 truncate">📍 {coffee.purchaseLocation}</p>}
        <p className="text-xs text-ink-300 mt-3">
          {cuppingCount === 0 ? 'Ещё не оценено' : `Оценок: ${cuppingCount}`}
        </p>
      </div>
    </button>
  );
}
