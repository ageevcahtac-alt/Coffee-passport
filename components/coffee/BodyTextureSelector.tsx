import { BODY_TEXTURE_OPTIONS, type BodyTexture } from '@/lib/types/coffee';

// A categorical read on mouthfeel alongside the 1-5 body slider — the
// slider captures intensity, this captures texture (a light cup can still
// feel syrupy, a heavy one can still feel thin).
export function BodyTextureSelector({
  value,
  onChange,
}: {
  value: BodyTexture | null;
  onChange: (value: BodyTexture) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {BODY_TEXTURE_OPTIONS.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={selected}
            className={`rounded-md border px-2 py-3 text-xs text-center transition-colors
                        ${selected
                          ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                          : 'border-ink-200 bg-parchment-100 text-ink-700'}`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
