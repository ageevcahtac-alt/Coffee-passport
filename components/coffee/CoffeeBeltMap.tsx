'use client';

import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps';
import { geoEqualEarth } from 'd3-geo';
import worldTopology from '@/lib/data/worldAtlas110m.json';
import { COFFEE_BELT_COORDINATES } from '@/lib/data/coffeeBelt';
import { getRoasterById } from '@/lib/data/roasters';

// A real world atlas (Natural Earth 110m via the world-atlas package,
// lib/data/worldAtlas110m.json) rendered through react-simple-maps/d3-geo
// — actual country coastlines and proportions, not hand-drawn shapes.
// Equal Earth is react-simple-maps' own default projection; parallels are
// straight horizontal lines under it, which is what lets the coffee-belt
// band below be a plain rect instead of a curved path.
const WIDTH = 800;
const HEIGHT = 450;
const SCALE = 140;
const PROJECTION_CONFIG = { scale: SCALE, center: [0, 0] as [number, number] };

const FOG_FILL = '#C7C2B6';
const TROPIC_LAT_TOP = 25; // ° с.ш.
const TROPIC_LAT_BOTTOM = -30; // ° ю.ш.

// Standalone projection with the exact same config as <ComposableMap>
// below, used only to compute pixel Y for the coffee-belt band.
const beltProjection = geoEqualEarth().scale(SCALE).translate([WIDTH / 2, HEIGHT / 2]);
const beltTopY = beltProjection([0, TROPIC_LAT_TOP])![1];
const beltBottomY = beltProjection([0, TROPIC_LAT_BOTTOM])![1];
const equatorY = beltProjection([0, 0])![1];

// A country can carry more than one roaster's pin — pins in the same
// country cluster around its real coordinate using small degree offsets.
const PIN_OFFSETS_DEG: [number, number][] = [
  [0, 0],
  [3.2, -1.6],
  [-3.2, -1.6],
  [3.2, 1.6],
  [-3.2, 1.6],
  [0, -3],
];

// Classic teardrop map-marker, drawn tip-at-origin (translate(-12,-22) puts
// the path's tip at local (0,0)) so it anchors exactly on the Marker's
// projected geographic point regardless of scale.
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
  const activatedCountryNames = new Set(byCountry.keys());

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-4">
      <ComposableMap
        width={WIDTH}
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        projection="geoEqualEarth"
        projectionConfig={PROJECTION_CONFIG}
        className="w-full h-auto"
        role="img"
        aria-label="Карта Кофейного пояса Земли"
      >
        <defs>
          <radialGradient id="belt-reveal-gradient">
            <stop offset="0%" stopColor="var(--color-gold-300)" />
            <stop offset="60%" stopColor="var(--color-gold-400)" />
            <stop offset="100%" stopColor="var(--color-gold-500)" />
          </radialGradient>
          <filter id="belt-paper-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency={0.85} numOctaves={2} seed={7} result="noise" />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="0 0 0 0 0.62  0 0 0 0 0.55  0 0 0 0 0.4  0 0 0 0.05 0"
            />
          </filter>
        </defs>

        <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="var(--color-parchment-100)" />
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} filter="url(#belt-paper-grain)" />

        {/* Кофейный пояс: 25° с.ш. – 30° ю.ш. */}
        <rect
          x={0}
          y={beltTopY}
          width={WIDTH}
          height={beltBottomY - beltTopY}
          fill="var(--color-gold-300)"
          fillOpacity={0.16}
        />
        <line x1={0} y1={beltTopY} x2={WIDTH} y2={beltTopY} stroke="var(--color-gold-400)" strokeWidth={0.75} strokeDasharray="4 3" />
        <line x1={0} y1={beltBottomY} x2={WIDTH} y2={beltBottomY} stroke="var(--color-gold-400)" strokeWidth={0.75} strokeDasharray="4 3" />
        <line x1={0} y1={equatorY} x2={WIDTH} y2={equatorY} stroke="var(--color-ink-300)" strokeWidth={0.75} strokeDasharray="2 3" />

        {/* Туман войны на реальных контурах стран; открытые страны
            закрашиваются золотым градиентом прямо по их силуэту */}
        <Geographies geography={worldTopology}>
          {({ geographies }) =>
            geographies.map((geo) => {
              const isActivated = activatedCountryNames.has(geo.properties.name);
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isActivated ? 'url(#belt-reveal-gradient)' : FOG_FILL}
                  stroke={isActivated ? 'var(--color-gold-500)' : 'var(--color-ink-300)'}
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none' },
                    hover: { outline: 'none' },
                    pressed: { outline: 'none' },
                  }}
                />
              );
            })
          }
        </Geographies>

        <rect x={5} y={5} width={WIDTH - 10} height={HEIGHT - 10} fill="none" stroke="var(--color-ink-300)" strokeWidth={2} />
        <rect x={9} y={9} width={WIDTH - 18} height={HEIGHT - 18} fill="none" stroke="var(--color-ink-300)" strokeWidth={0.5} />
        <text x={18} y={26} fontSize={11} letterSpacing={2} fill="var(--color-ink-400)">
          MAPPA MUNDI · COFFEE BELT
        </text>
        <CompassRose cx={WIDTH - 40} cy={40} />

        {Array.from(byCountry.entries()).map(([country, group]) => {
          const base = COFFEE_BELT_COORDINATES[country];
          if (!base) return null;

          return group.map((pin, i) => {
            const [dLon, dLat] = PIN_OFFSETS_DEG[i % PIN_OFFSETS_DEG.length] ?? [0, 0];
            const coordinates: [number, number] = [base[0] + dLon, base[1] + dLat];
            const roaster = getRoasterById(pin.roasterId);
            const color = roaster?.color ?? 'var(--color-gold-500)';
            const selected = selectedPin?.country === country && selectedPin?.roasterId === pin.roasterId;
            const scale = selected ? 1.3 : 1;

            return (
              <Marker key={`${country}-${pin.roasterId}`} coordinates={coordinates}>
                {pin.justActivated && (
                  <text
                    y={-42}
                    textAnchor="middle"
                    fontSize={16}
                    className="pin-farmer-drop"
                    aria-hidden="true"
                  >
                    🧑‍🌾
                  </text>
                )}
                {/* Positioning transform lives on this group, separate from
                    the pin-plant CSS animation below — a CSS `transform`
                    animation on the same element would replace the
                    attribute-based transform outright and the marker would
                    jump away from its geographic point. */}
                <g
                  transform={`scale(${scale}) translate(-12,-22)`}
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
                  <g className={pin.justActivated ? 'pin-plant' : undefined}>
                    <path d={PIN_MARKER_PATH} fill={color} stroke="var(--color-parchment-100)" strokeWidth={1} />
                    <circle cx={12} cy={9} r={2.6} fill="var(--color-parchment-100)" />
                  </g>
                  <title>{roaster?.name ?? pin.roasterId}</title>
                </g>
              </Marker>
            );
          });
        })}
      </ComposableMap>

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
