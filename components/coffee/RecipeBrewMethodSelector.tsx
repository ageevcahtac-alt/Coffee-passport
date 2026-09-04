'use client';

import { useEffect, useState } from 'react';
import { RECIPE_LIMITS, STANDARD_BREW_METHOD_CATEGORIES, type CustomBrewMethod } from '@/lib/types/coffee';
import { useCustomBrewMethods } from '@/lib/data/useCustomBrewMethods';
import {
  addCustomBrewMethod,
  getCustomBrewMethodsForOwner,
  syncCustomBrewMethodsFromSupabase,
} from '@/lib/data/customBrewMethodsStore';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Method picker for barista/enthusiast RECIPE authoring only — the 10
// STANDARD_BREW_METHOD_CATEGORIES plus this owner's own custom methods
// (max RECIPE_LIMITS.maxCustomMethods), with a "+ Добавить свой метод
// (X/5)" button. Deliberately not the same component as
// BrewingMethodSelector, which stays the guest tasting flow's own
// espresso/filter picker over the (different, unlimited) BrewingMethodId
// set — see lib/types/coffee.ts's own note on why these two lists are
// kept separate.
export function RecipeBrewMethodSelector({
  ownerType,
  ownerId,
  value,
  onChange,
}: {
  ownerType: CustomBrewMethod['ownerType'];
  ownerId: string;
  value: string | null;
  onChange: (methodId: string) => void;
}) {
  useEffect(() => {
    void syncCustomBrewMethodsFromSupabase(ownerType, ownerId);
  }, [ownerType, ownerId]);

  const customMethods = useCustomBrewMethods().filter(
    (method) => method.ownerType === ownerType && method.ownerId === ownerId
  );
  const atCap = customMethods.length >= RECIPE_LIMITS.maxCustomMethods;

  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleAddCustomMethod() {
    const trimmed = label.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    const result = await addCustomBrewMethod({ ownerType, ownerId, label: trimmed });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setLabel('');
    setAdding(false);
    if (result.method) onChange(result.method.id);
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Способ приготовления" className="flex flex-wrap gap-2">
        {STANDARD_BREW_METHOD_CATEGORIES.map((method) => (
          <MethodPill key={method.id} label={method.label} checked={value === method.id} onClick={() => onChange(method.id)} />
        ))}
        {customMethods.map((method) => (
          <MethodPill key={method.id} label={method.label} checked={value === method.id} onClick={() => onChange(method.id)} />
        ))}
      </div>

      <div className="mt-3">
        {adding ? (
          <div className="flex flex-col gap-2 max-w-xs">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Название своего метода"
              className={fieldClasses}
              autoFocus
            />
            {error && <p className="text-xs text-rating">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddCustomMethod}
                disabled={!label.trim() || saving}
                className="text-sm text-ink-900 underline underline-offset-2 hover:text-ink-700 disabled:opacity-40 disabled:pointer-events-none"
              >
                {saving ? 'Сохранение…' : 'Добавить'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                  setLabel('');
                }}
                className="text-sm text-ink-400 underline underline-offset-2 hover:text-ink-700"
              >
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={atCap}
            className="text-sm text-ink-700 underline underline-offset-2 hover:text-ink-900 disabled:opacity-40 disabled:pointer-events-none disabled:no-underline"
          >
            + Добавить свой метод (занято {customMethods.length}/{RECIPE_LIMITS.maxCustomMethods})
          </button>
        )}
      </div>
    </div>
  );
}

function MethodPill({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <label
      className={`flex items-center justify-center text-center rounded-full border
                  px-3 py-1.5 text-xs cursor-pointer transition-colors
                  ${checked
                    ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium'
                    : 'border-ink-200 bg-parchment-100 text-ink-700'}`}
    >
      <input type="radio" name="recipe-brew-method" checked={checked} onChange={onClick} className="sr-only" />
      {label}
    </label>
  );
}

// Exposed for callers that just need the count without subscribing to the
// live store (e.g. a parent computing "can this owner add one more" before
// even mounting the picker).
export function getCustomMethodCount(ownerType: CustomBrewMethod['ownerType'], ownerId: string): number {
  return getCustomBrewMethodsForOwner(ownerType, ownerId).length;
}
