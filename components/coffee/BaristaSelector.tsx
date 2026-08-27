import type { Barista } from '@/lib/types/coffee';

export function BaristaSelector({
  baristas,
  value,
  onChange,
  name = 'barista',
}: {
  baristas: Barista[];
  value: string | null;
  onChange: (baristaId: string) => void;
  name?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Бариста" className="flex flex-col gap-3">
      {baristas.map((barista) => {
        const checked = value === barista.id;
        return (
          <label
            key={barista.id}
            className={`flex items-center justify-between rounded-md border px-4 py-4
                        cursor-pointer transition-colors
                        ${checked ? 'border-gold-400 bg-gold-400/10' : 'border-ink-200 bg-parchment-100'}`}
          >
            <span className="text-sm font-medium text-ink-900">{barista.name}</span>
            <input
              type="radio"
              name={name}
              value={barista.id}
              checked={checked}
              onChange={() => onChange(barista.id)}
              className="h-4 w-4 accent-current text-gold-500"
            />
          </label>
        );
      })}
    </div>
  );
}
