import { BREWING_METHODS, type BrewingMethodId } from '@/lib/types/coffee';

export function BrewingMethodSelector({
  value,
  onChange,
  name = 'brewing-method',
}: {
  value: BrewingMethodId | null;
  onChange: (methodId: BrewingMethodId) => void;
  name?: string;
}) {
  return (
    <div role="radiogroup" aria-label="Способ приготовления" className="grid grid-cols-2 gap-3">
      {BREWING_METHODS.map((method) => {
        const checked = value === method.id;
        return (
          <label
            key={method.id}
            className={`flex items-center justify-center text-center rounded-md border
                        px-3 py-4 text-sm cursor-pointer transition-colors
                        ${checked
                          ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                          : 'border-ink-200 bg-parchment-100 text-ink-700'}`}
          >
            <input
              type="radio"
              name={name}
              value={method.id}
              checked={checked}
              onChange={() => onChange(method.id)}
              className="sr-only"
            />
            {method.label}
          </label>
        );
      })}
    </div>
  );
}
