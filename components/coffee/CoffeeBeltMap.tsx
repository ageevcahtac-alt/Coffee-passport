import { COFFEE_BELT_POSITIONS } from '@/lib/data/coffeeBelt';

const VIEW_W = 640;
const VIEW_H = 300;
const TROPIC_TOP = 95;
const TROPIC_BOTTOM = 205;
const EQUATOR = 150;

// Rough, stylized silhouettes (not surveyed coastlines) — enough to read as
// "South America" / "Africa" at a glance in the engraved-map aesthetic
// established by FarmerRevealCard's line-art illustration.
const SOUTH_AMERICA_PATH =
  'M175,78 C212,88 228,130 222,172 C216,212 196,252 175,258 ' +
  'C154,252 138,214 136,174 C134,130 148,93 175,78 Z';

const AFRICA_PATH =
  'M380,58 C422,64 438,100 432,142 C426,182 414,212 400,242 ' +
  'C390,260 374,260 366,242 C352,206 342,170 342,128 C342,92 354,68 380,58 Z';

export interface ActivatedRegion {
  country: string;
  justActivated?: boolean;
}

export function CoffeeBeltMap({
  activatedCountries,
  selectedCountry,
  onSelectCountry,
}: {
  activatedCountries: ActivatedRegion[];
  selectedCountry: string | null;
  onSelectCountry: (country: string) => void;
}) {
  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-4">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full"
        role="img"
        aria-label="Карта Кофейного пояса Земли"
      >
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="var(--color-parchment-100)" />

        {Array.from({ length: 7 }, (_, i) => (
          <line
            key={`v${i}`}
            x1={((i + 1) * VIEW_W) / 8}
            y1={0}
            x2={((i + 1) * VIEW_W) / 8}
            y2={VIEW_H}
            stroke="var(--color-ink-100)"
            strokeWidth={0.5}
          />
        ))}
        {Array.from({ length: 3 }, (_, i) => (
          <line
            key={`h${i}`}
            x1={0}
            y1={((i + 1) * VIEW_H) / 4}
            x2={VIEW_W}
            y2={((i + 1) * VIEW_H) / 4}
            stroke="var(--color-ink-100)"
            strokeWidth={0.5}
          />
        ))}

        <rect
          x={0}
          y={TROPIC_TOP}
          width={VIEW_W}
          height={TROPIC_BOTTOM - TROPIC_TOP}
          fill="var(--color-gold-300)"
          fillOpacity={0.14}
        />
        <line
          x1={0}
          y1={TROPIC_TOP}
          x2={VIEW_W}
          y2={TROPIC_TOP}
          stroke="var(--color-gold-400)"
          strokeWidth={0.75}
          strokeDasharray="4 3"
        />
        <line
          x1={0}
          y1={TROPIC_BOTTOM}
          x2={VIEW_W}
          y2={TROPIC_BOTTOM}
          stroke="var(--color-gold-400)"
          strokeWidth={0.75}
          strokeDasharray="4 3"
        />
        <line
          x1={0}
          y1={EQUATOR}
          x2={VIEW_W}
          y2={EQUATOR}
          stroke="var(--color-ink-300)"
          strokeWidth={0.75}
          strokeDasharray="2 3"
        />

        <path d={SOUTH_AMERICA_PATH} fill="var(--color-ink-100)" stroke="var(--color-ink-300)" strokeWidth={1} />
        <path d={AFRICA_PATH} fill="var(--color-ink-100)" stroke="var(--color-ink-300)" strokeWidth={1} />

        {activatedCountries.map(({ country, justActivated }) => {
          const pos = COFFEE_BELT_POSITIONS[country];
          if (!pos) return null;
          const selected = selectedCountry === country;

          return (
            <g
              key={country}
              className={justActivated ? 'reveal-pop' : undefined}
              onClick={() => onSelectCountry(country)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectCountry(country);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`Регион ${country}${selected ? ', выбран' : ''}`}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={selected ? 9 : 7}
                fill="var(--color-gold-500)"
                stroke="var(--color-parchment-100)"
                strokeWidth={1.5}
              />
              <circle cx={pos.x} cy={pos.y} r={2.5} fill="var(--color-parchment-100)" />
              <text
                x={pos.x}
                y={pos.y - 13}
                textAnchor="middle"
                fontSize={11}
                fontWeight={selected ? 700 : 500}
                fill="var(--color-ink-900)"
              >
                {country}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="text-center text-[11px] text-ink-400 mt-3">
        {activatedCountries.length === 0
          ? 'Кофейный пояс Земли, 25° с.ш. – 30° ю.ш. Отсканируйте первый лот, чтобы отметить регион.'
          : 'Кликните на булавку, чтобы увидеть последний угаданный лот региона.'}
      </p>
    </div>
  );
}
