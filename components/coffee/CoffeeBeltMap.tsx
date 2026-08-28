import { COFFEE_BELT_POSITIONS } from '@/lib/data/coffeeBelt';
import { getRoasterById } from '@/lib/data/roasters';

const VIEW_W = 640;
const VIEW_H = 300;
const TROPIC_TOP = 95;
const TROPIC_BOTTOM = 205;
const EQUATOR = 150;
const FOG_FILL = '#C7C2B6';
const REVEAL_RADIUS = 78;

// Rough, stylized silhouettes (not surveyed coastlines) — enough to read as
// "South America" / "Africa" at a glance in the engraved-map aesthetic
// established by FarmerRevealCard's line-art illustration.
const SOUTH_AMERICA_PATH =
  'M175,78 C212,88 228,130 222,172 C216,212 196,252 175,258 ' +
  'C154,252 138,214 136,174 C134,130 148,93 175,78 Z';

const AFRICA_PATH =
  'M380,58 C422,64 438,100 432,142 C426,182 414,212 400,242 ' +
  'C390,260 374,260 366,242 C352,206 342,170 342,128 C342,92 354,68 380,58 Z';

// A country can carry more than one roaster's pin (see the task: "новая
// дегустация лота от другого обжарщика в том же регионе добавляет новую
// булавку ... сверху, снизу или сбоку от региона") — pins in the same
// country cluster around the base position using these offsets, in order.
const PIN_OFFSETS: [number, number][] = [
  [0, 0],
  [16, -13],
  [-16, -13],
  [16, 13],
  [-16, 13],
  [0, -22],
];

export interface ActivatedPin {
  country: string;
  roasterId: string;
  justActivated?: boolean;
}

export interface SelectedPin {
  country: string;
  roasterId: string;
}

export function CoffeeBeltMap({
  pins,
  selectedPin,
  onSelectPin,
}: {
  pins: ActivatedPin[];
  selectedPin: SelectedPin | null;
  onSelectPin: (pin: SelectedPin) => void;
}) {
  const byCountry = new Map<string, ActivatedPin[]>();
  for (const pin of pins) {
    const group = byCountry.get(pin.country) ?? [];
    group.push(pin);
    byCountry.set(pin.country, group);
  }
  // Stable order so re-renders don't jitter which pin sits at which offset.
  for (const group of byCountry.values()) group.sort((a, b) => a.roasterId.localeCompare(b.roasterId));

  const revealedCountries = Array.from(byCountry.keys()).filter((country) => COFFEE_BELT_POSITIONS[country]);
  const revealedByContinent = {
    africa: revealedCountries.filter((c) => COFFEE_BELT_POSITIONS[c].continent === 'africa'),
    'south-america': revealedCountries.filter((c) => COFFEE_BELT_POSITIONS[c].continent === 'south-america'),
  };

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-4">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full"
        role="img"
        aria-label="Карта Кофейного пояса Земли"
      >
        <defs>
          <clipPath id="belt-clip-africa">
            <path d={AFRICA_PATH} />
          </clipPath>
          <clipPath id="belt-clip-samerica">
            <path d={SOUTH_AMERICA_PATH} />
          </clipPath>
          <radialGradient id="belt-reveal-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--color-gold-300)" stopOpacity="1" />
            <stop offset="55%" stopColor="var(--color-gold-400)" stopOpacity="0.75" />
            <stop offset="100%" stopColor="var(--color-gold-400)" stopOpacity="0" />
          </radialGradient>
        </defs>

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

        {/* "Туман войны": континенты по умолчанию приглушённые/монохромные */}
        <path d={SOUTH_AMERICA_PATH} fill={FOG_FILL} fillOpacity={0.55} stroke="var(--color-ink-300)" strokeWidth={1} />
        <path d={AFRICA_PATH} fill={FOG_FILL} fillOpacity={0.55} stroke="var(--color-ink-300)" strokeWidth={1} />

        {/* Раскраска: тёплое пятно на месте каждой продегустированной страны,
            обрезанное по силуэту её континента, чтобы не "вытекать" за берег */}
        <g clipPath="url(#belt-clip-samerica)">
          {revealedByContinent['south-america'].map((country) => {
            const pos = COFFEE_BELT_POSITIONS[country];
            return (
              <circle key={country} cx={pos.x} cy={pos.y} r={REVEAL_RADIUS} fill="url(#belt-reveal-glow)" />
            );
          })}
        </g>
        <g clipPath="url(#belt-clip-africa)">
          {revealedByContinent.africa.map((country) => {
            const pos = COFFEE_BELT_POSITIONS[country];
            return (
              <circle key={country} cx={pos.x} cy={pos.y} r={REVEAL_RADIUS} fill="url(#belt-reveal-glow)" />
            );
          })}
        </g>

        {Array.from(byCountry.entries()).map(([country, group]) => {
          const base = COFFEE_BELT_POSITIONS[country];
          if (!base) return null;
          const topY = Math.min(...group.map((_, i) => base.y + (PIN_OFFSETS[i % PIN_OFFSETS.length]?.[1] ?? 0)));

          return (
            <g key={country}>
              <text
                x={base.x}
                y={topY - 13}
                textAnchor="middle"
                fontSize={11}
                fontWeight={500}
                fill="var(--color-ink-900)"
              >
                {country}
              </text>
              {group.map((pin, i) => {
                const [dx, dy] = PIN_OFFSETS[i % PIN_OFFSETS.length] ?? [0, 0];
                const x = base.x + dx;
                const y = base.y + dy;
                const roaster = getRoasterById(pin.roasterId);
                const color = roaster?.color ?? 'var(--color-gold-500)';
                const selected = selectedPin?.country === country && selectedPin?.roasterId === pin.roasterId;

                return (
                  <g key={pin.roasterId}>
                    {pin.justActivated && (
                      <text
                        x={x}
                        y={y - 16}
                        textAnchor="middle"
                        fontSize={16}
                        className="pin-farmer-drop"
                        aria-hidden="true"
                      >
                        🧑‍🌾
                      </text>
                    )}
                    <g
                      className={pin.justActivated ? 'pin-plant' : undefined}
                      onClick={() => onSelectPin({ country, roasterId: pin.roasterId })}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectPin({ country, roasterId: pin.roasterId });
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`${country}, ${roaster?.name ?? 'обжарщик'}${selected ? ', выбран' : ''}`}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle
                        cx={x}
                        cy={y}
                        r={selected ? 9 : 7}
                        fill={color}
                        stroke="var(--color-parchment-100)"
                        strokeWidth={1.5}
                      />
                      <circle cx={x} cy={y} r={2.5} fill="var(--color-parchment-100)" />
                      <title>{roaster?.name ?? pin.roasterId}</title>
                    </g>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      <p className="text-center text-[11px] text-ink-400 mt-3">
        {pins.length === 0
          ? 'Кофейный пояс Земли, 25° с.ш. – 30° ю.ш. Отсканируйте первый лот, чтобы рассеять туман.'
          : 'Кликните на булавку, чтобы увидеть последний угаданный лот региона.'}
      </p>
    </div>
  );
}
