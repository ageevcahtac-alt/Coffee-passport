'use client';

import { useEffect, useState } from 'react';

const OTHER_VALUE = '__other__';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Reused across the roasting/extraction forms for every "pick a known model
// or type your own" field (grinder, roast machine, brewer/espresso machine)
// instead of duplicating the select+custom-input pattern in each form.
//
// `priorityOptions` — when given, renders as its own <optgroup> above the
// regular `options` (e.g. a user's Equipment Garage favorites ahead of the
// full device catalog). Omit it and this behaves exactly as before — a flat
// list — so every existing caller is unaffected.
export function ComboSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Другое — введите вручную',
  priorityOptions = [],
  priorityLabel = 'Из вашего гаража',
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  priorityOptions?: string[];
  priorityLabel?: string;
}) {
  const isKnownOption = value === '' || options.includes(value) || priorityOptions.includes(value);
  const [customMode, setCustomMode] = useState(!isKnownOption);

  // customMode is normally sticky — only the "Другое…" option and "К
  // списку" button change it, so it never fights the user mid-edit. But an
  // externally-driven value (e.g. ProRecipeForm's Equipment Garage
  // auto-fill landing the shop's saved grinder/machine model, which is
  // very likely NOT one of the ~5 curated options in PRO_GRINDER_MODELS/
  // ESPRESSO_MACHINE_MODELS) can set `value` to a real, non-empty, unlisted
  // string while still mounted in customMode=false — that combination is
  // only reachable from outside this component, never from its own
  // <select>'s onChange. Left uncorrected, the <select> silently renders
  // "Не выбрано" (no <option> matches the value) even though the field
  // already holds the correct auto-filled model underneath, so the guest/
  // barista/roaster has to notice nothing looks selected and re-pick it by
  // hand. This only ever switches INTO custom mode for that case — it
  // never switches back out on its own, so clearing/typing in an
  // already-open custom input stays entirely user-driven.
  useEffect(() => {
    if (!customMode && !isKnownOption) setCustomMode(true);
  }, [customMode, isKnownOption]);

  if (customMode) {
    return (
      <div>
        <label className="block text-xs text-ink-400 mb-1.5">{label}</label>
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={fieldClasses}
          />
          <button
            type="button"
            onClick={() => {
              setCustomMode(false);
              onChange('');
            }}
            className="text-xs text-ink-400 underline underline-offset-2 hover:text-ink-700 shrink-0"
          >
            К списку
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs text-ink-400 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === OTHER_VALUE) {
            setCustomMode(true);
            onChange('');
            return;
          }
          onChange(e.target.value);
        }}
        className={fieldClasses}
      >
        <option value="">Не выбрано</option>
        {priorityOptions.length > 0 ? (
          <>
            <optgroup label={priorityLabel}>
              {priorityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </optgroup>
            {options.length > 0 && (
              <optgroup label="Остальные варианты">
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </optgroup>
            )}
          </>
        ) : (
          options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))
        )}
        <option value={OTHER_VALUE}>Другое…</option>
      </select>
    </div>
  );
}
