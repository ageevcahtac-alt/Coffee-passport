'use client';

import { useState } from 'react';

const OTHER_VALUE = '__other__';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Reused across the roasting/extraction forms for every "pick a known model
// or type your own" field (grinder, roast machine, brewer/espresso machine)
// instead of duplicating the select+custom-input pattern in each form.
export function ComboSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Другое — введите вручную',
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const isKnownOption = value === '' || options.includes(value);
  const [customMode, setCustomMode] = useState(!isKnownOption);

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
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={OTHER_VALUE}>Другое…</option>
      </select>
    </div>
  );
}
