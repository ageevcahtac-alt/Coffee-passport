'use client';

// Shared 1-5 flavor-axis input — used by the roaster's lot builder for the
// reference profile and by the guest's blind-tasting form for their own
// read, so both sides of TasteComparison come from the same control.
export function FlavorSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-sm text-ink-700">{label}</label>
        <span className="data-value text-sm text-ink-900">{value}/5</span>
      </div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: 'var(--color-gold-500)' }}
      />
    </div>
  );
}
