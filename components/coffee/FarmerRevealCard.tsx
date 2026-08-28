import type { Lot } from '@/lib/types/coffee';

// Simple single-stroke "engraving" motif — a coffee branch inside a seal
// ring — standing in for a photo we don't have. Kept intentionally light so
// it reads as a woodcut rather than clip art.
function EngravingIllustration() {
  return (
    <svg viewBox="0 0 120 120" className="w-20 h-20" aria-hidden="true">
      <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="0.75" />
      <path
        d="M60 92 C58 70, 62 55, 60 30"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M60 70 C48 66, 40 56, 42 44 C54 46, 60 56, 60 70 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M60 55 C72 51, 80 41, 78 29 C66 31, 60 41, 60 55 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="47" cy="80" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="58" cy="86" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="69" cy="79" r="5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <g stroke="currentColor" strokeWidth="1" strokeLinecap="round">
        <line x1="60" y1="14" x2="60" y2="22" />
        <line x1="44" y1="19" x2="48" y2="26" />
        <line x1="76" y1="19" x2="72" y2="26" />
      </g>
    </svg>
  );
}

export function FarmerRevealCard({
  lot,
  animate = false,
}: {
  lot: Lot;
  animate?: boolean;
}) {
  const { producer } = lot;

  return (
    <div
      className={`max-w-md mx-auto w-full rounded-md border border-gold-300 bg-parchment-100
                  px-6 py-8 text-center ${animate ? 'reveal-rise' : ''}`}
    >
      <div className="text-ink-700 flex justify-center mb-4">
        <EngravingIllustration />
      </div>
      <p className="text-xs uppercase tracking-widest2 text-gold-500 mb-2">
        Кто вырастил этот кофе
      </p>
      <h2 className="font-display text-xl text-ink-900 mb-1">{producer.farmerName}</h2>
      <p className="text-sm text-ink-500">
        {producer.farmName} · {lot.region}, {lot.country}
      </p>
    </div>
  );
}
