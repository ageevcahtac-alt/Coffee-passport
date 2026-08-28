import { getRoasterById } from '@/lib/data/roasters';
import type { ActivatedPin } from './CoffeeBeltMap';

// The pin dropped on the map is mirrored down here permanently — a medal
// shelf of every (country, roaster) pin the guest has ever earned. Clicking
// a badge opens the full roaster profile (see RoasterProfileCard), distinct
// from clicking the pin on the map itself, which opens just that pin's
// latest lot.
export function TrophyShelf({
  pins,
  selectedRoasterId,
  onSelectRoaster,
}: {
  pins: ActivatedPin[];
  selectedRoasterId: string | null;
  onSelectRoaster: (roasterId: string) => void;
}) {
  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-4">
      <p className="section-label mb-4">Трофейная витрина</p>
      {pins.length === 0 ? (
        <p className="text-xs text-ink-400">
          Здесь появятся булавки открытых регионов — по одной за каждую пару страна/обжарщик.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {pins.map((pin) => {
            const roaster = getRoasterById(pin.roasterId);
            const selected = selectedRoasterId === pin.roasterId;
            return (
              <button
                key={`${pin.country}::${pin.roasterId}`}
                type="button"
                onClick={() => onSelectRoaster(pin.roasterId)}
                aria-label={`${pin.country} · ${roaster?.name ?? 'обжарщик'}`}
                aria-pressed={selected}
                className={`flex flex-col items-center gap-1 ${pin.justActivated ? 'reveal-pop' : ''}`}
              >
                <span
                  className="flex items-center justify-center w-12 h-12 rounded-full border-2 shrink-0
                             text-[10px] font-medium text-parchment-100 uppercase tracking-wide
                             transition-transform hover:scale-105"
                  style={{
                    backgroundColor: roaster?.color ?? 'var(--color-gold-500)',
                    borderColor: selected ? 'var(--color-ink-900)' : 'var(--color-parchment-100)',
                    boxShadow: '0 1px 3px 0 rgba(26,20,16,0.25)',
                  }}
                >
                  {pin.country.slice(0, 3)}
                </span>
                <span className="text-[10px] text-ink-400 max-w-[3.5rem] truncate">
                  {roaster?.name.split(' ')[0] ?? pin.roasterId}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
