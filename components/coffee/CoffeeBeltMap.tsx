import { COFFEE_BELT_POSITIONS } from '@/lib/data/coffeeBelt';
import { getRoasterById } from '@/lib/data/roasters';

const VIEW_W = 640;
const VIEW_H = 300;
const TROPIC_TOP = 95;
const TROPIC_BOTTOM = 205;
const EQUATOR = 150;
const FOG_FILL = '#C7C2B6';
const REVEAL_RADIUS = 78;

// Simplified polygon coastlines (straight segments, softened with
// strokeLinejoin="round") tracing actual continent silhouettes — the Horn
// of Africa, Africa's Gulf of Guinea notch, South America's Brazil
// "shoulder" and Patagonia taper, India's subcontinent jut, Cape York on
// Australia — rather than abstract ovals. Coordinates are hand-plotted
// against this component's 640x300 viewBox, not a geographic projection.
const SOUTH_AMERICA_PATH =
  'M155,80 L172,70 L192,76 L208,88 L224,94 L219,113 L213,138 L206,163 ' +
  'L198,184 L189,208 L179,233 L172,254 L165,263 L159,249 L153,219 ' +
  'L147,189 L142,159 L140,134 L144,109 Z';

const AFRICA_PATH =
  'M365,48 L393,44 L416,50 L406,64 L434,71 L460,98 L446,121 L434,149 ' +
  'L421,176 L407,201 L393,226 L379,247 L363,236 L354,210 L346,182 ' +
  'L338,156 L332,132 L322,120 L334,105 L344,87 L336,68 L350,54 Z';

const NORTH_AMERICA_PATH =
  'M55,-40 L30,10 L35,35 L55,55 L75,68 L95,78 L115,85 L130,90 ' +
  'L140,75 L120,60 L135,45 L115,30 L95,15 L75,0 L60,-20 Z';

const EURASIA_PATH =
  'M335,-30 L330,10 L345,30 L365,20 L385,35 L400,55 L392,70 L410,60 ' +
  'L430,50 L445,65 L455,90 L468,70 L485,55 L505,65 L520,80 L540,60 ' +
  'L565,45 L590,25 L615,10 L625,-10 Z';

const AUSTRALIA_PATH =
  'M525,225 L545,215 L558,222 L568,235 L562,215 L572,205 L582,218 ' +
  'L592,240 L596,258 L585,270 L565,278 L545,275 L528,265 L520,248 Z';

// A few small islands between Southeast Asia and Australia — just enough
// dotting to read as an archipelago, not an attempt at Indonesia's real
// geography.
const ISLAND_DOTS: [number, number, number][] = [
  [510, 108, 4],
  [524, 116, 3],
  [538, 110, 3.5],
  [502, 130, 3],
];

// A country can carry more than one roaster's pin (see the task: "новая
// дегустация лота от другого обжарщика в том же регионе добавляет новую
// булавку ... сверху, снизу или сбоку от региона") — pins in the same
// country cluster around the base position using these offsets, in order.
const PIN_OFFSETS: [number, number][] = [
  [0, 0],
  [22, -4],
  [-22, -4],
  [22, 18],
  [-22, 18],
  [0, -26],
];

// Classic teardrop map-marker silhouette in a 24x24 local box, tip near
// (12, 22) — placed so the tip touches the actual geographic point.
const PIN_MARKER_PATH =
  'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z';

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
          <filter id="belt-paper-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise" />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0.62  0 0 0 0 0.55  0 0 0 0 0.4  0 0 0 0.05 0"
            />
          </filter>
        </defs>

        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="var(--color-parchment-100)" />
        <rect x={0} y={0} width={VIEW_W} height={VIEW_H} filter="url(#belt-paper-grain)" />

        {/* Приглушённый контекст остального мира — никогда не "раскрашивается",
            для этих регионов пока нет лотов */}
        <path d={NORTH_AMERICA_PATH} fill={FOG_FILL} fillOpacity={0.3} stroke="var(--color-ink-200)" strokeWidth={0.75} strokeLinejoin="round" />
        <path d={EURASIA_PATH} fill={FOG_FILL} fillOpacity={0.3} stroke="var(--color-ink-200)" strokeWidth={0.75} strokeLinejoin="round" />
        <path d={AUSTRALIA_PATH} fill={FOG_FILL} fillOpacity={0.3} stroke="var(--color-ink-200)" strokeWidth={0.75} strokeLinejoin="round" />
        {ISLAND_DOTS.map(([ix, iy, ir]) => (
          <circle key={`${ix}-${iy}`} cx={ix} cy={iy} r={ir} fill={FOG_FILL} fillOpacity={0.3} stroke="var(--color-ink-200)" strokeWidth={0.5} />
        ))}

        <rect
          x={0}
          y={TROPIC_TOP}
          width={VIEW_W}
          height={TROPIC_BOTTOM - TROPIC_TOP}
          fill="var(--color-gold-300)"
          fillOpacity={0.14}
        />
        <line x1={0} y1={TROPIC_TOP} x2={VIEW_W} y2={TROPIC_TOP} stroke="var(--color-gold-400)" strokeWidth={0.75} strokeDasharray="4 3" />
        <line x1={0} y1={TROPIC_BOTTOM} x2={VIEW_W} y2={TROPIC_BOTTOM} stroke="var(--color-gold-400)" strokeWidth={0.75} strokeDasharray="4 3" />
        <line x1={0} y1={EQUATOR} x2={VIEW_W} y2={EQUATOR} stroke="var(--color-ink-300)" strokeWidth={0.75} strokeDasharray="2 3" />

        {/* "Туман войны": континенты кофейного пояса по умолчанию приглушённые */}
        <path d={SOUTH_AMERICA_PATH} fill={FOG_FILL} fillOpacity={0.55} stroke="var(--color-ink-300)" strokeWidth={1} strokeLinejoin="round" />
        <path d={AFRICA_PATH} fill={FOG_FILL} fillOpacity={0.55} stroke="var(--color-ink-300)" strokeWidth={1} strokeLinejoin="round" />

        {/* Раскраска: тёплое пятно на месте каждой продегустированной страны,
            обрезанное по силуэту её континента, чтобы не "вытекать" за берег */}
        <g clipPath="url(#belt-clip-samerica)">
          {revealedByContinent['south-america'].map((country) => {
            const pos = COFFEE_BELT_POSITIONS[country];
            return <circle key={country} cx={pos.x} cy={pos.y} r={REVEAL_RADIUS} fill="url(#belt-reveal-glow)" />;
          })}
        </g>
        <g clipPath="url(#belt-clip-africa)">
          {revealedByContinent.africa.map((country) => {
            const pos = COFFEE_BELT_POSITIONS[country];
            return <circle key={country} cx={pos.x} cy={pos.y} r={REVEAL_RADIUS} fill="url(#belt-reveal-glow)" />;
          })}
        </g>

        {/* Виньетка старинной карты */}
        <rect x={5} y={5} width={VIEW_W - 10} height={VIEW_H - 10} fill="none" stroke="var(--color-ink-300)" strokeWidth={2} />
        <rect x={9} y={9} width={VIEW_W - 18} height={VIEW_H - 18} fill="none" stroke="var(--color-ink-300)" strokeWidth={0.5} />
        <text x={18} y={24} fontSize={9} letterSpacing={2} fill="var(--color-ink-400)">
          MAPPA MUNDI · COFFEE BELT
        </text>
        <CompassRose cx={VIEW_W - 34} cy={34} />

        {Array.from(byCountry.entries()).map(([country, group]) => {
          const base = COFFEE_BELT_POSITIONS[country];
          if (!base) return null;
          const topY = Math.min(...group.map((_, i) => base.y + (PIN_OFFSETS[i % PIN_OFFSETS.length]?.[1] ?? 0)));

          return (
            <g key={country}>
              <text
                x={base.x}
                y={topY - 28}
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
                const scale = selected ? 1.05 : 0.85;

                return (
                  <g key={pin.roasterId}>
                    {pin.justActivated && (
                      <text
                        x={x}
                        y={y - 40}
                        textAnchor="middle"
                        fontSize={16}
                        className="pin-farmer-drop"
                        aria-hidden="true"
                      >
                        🧑‍🌾
                      </text>
                    )}
                    {/* Positioning (SVG transform attribute) is kept on this
                        outer <g>, separate from the pin-plant CSS animation
                        below — a CSS `transform` animation on the same
                        element replaces the attribute-based transform
                        outright and the marker jumps to the map's origin. */}
                    <g
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
                      transform={`translate(${x - 12 * scale}, ${y - 22 * scale}) scale(${scale})`}
                    >
                      <g className={pin.justActivated ? 'pin-plant' : undefined}>
                        <path
                          d={PIN_MARKER_PATH}
                          fill={color}
                          stroke="var(--color-parchment-100)"
                          strokeWidth={1}
                        />
                        <circle cx={12} cy={9} r={2.6} fill="var(--color-parchment-100)" />
                      </g>
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

function CompassRose({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g transform={`translate(${cx}, ${cy})`} aria-hidden="true" opacity={0.65}>
      <circle r={16} fill="none" stroke="var(--color-ink-300)" strokeWidth={0.75} />
      <path d="M0,-14 L4,0 L0,14 L-4,0 Z" fill="var(--color-ink-300)" />
      <path d="M-14,0 L0,4 L14,0 L0,-4 Z" fill="var(--color-ink-200)" />
      <text y={-19} textAnchor="middle" fontSize={7} fill="var(--color-ink-400)">N</text>
    </g>
  );
}
