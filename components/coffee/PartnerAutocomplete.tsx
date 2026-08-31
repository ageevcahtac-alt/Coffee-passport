'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface PartnerOption {
  id: string;
  name: string;
  subtitle?: string;
}

// Search-as-you-type picker for an accredited-partner list (coffee shops,
// roasters). Replaces the old fixed-plaque radio UI (only ever workable for
// a handful of hardcoded entries) with something that scales to the 100+
// accredited partners the platform is meant to hold — the `options` list is
// always pre-filtered to accredited partners by its caller (see
// CoffeeShopSelector / RoasterAutocomplete), this component only does the
// text filtering on top of that.
export function PartnerAutocomplete({
  label,
  emptyLabel,
  noMatchLabel = 'Ничего не найдено среди аккредитованных партнёров.',
  options,
  value,
  onChange,
  disabled = false,
  helperText,
}: {
  label: string;
  emptyLabel: string;
  noMatchLabel?: string;
  options: PartnerOption[];
  value: string | null;
  onChange: (id: string) => void;
  disabled?: boolean;
  helperText?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? options.find((option) => option.id === value) ?? null : null;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (option) =>
        option.name.toLowerCase().includes(q) || (option.subtitle ?? '').toLowerCase().includes(q)
    );
  }, [options, query]);

  function handleSelect(option: PartnerOption) {
    onChange(option.id);
    setQuery('');
    setOpen(false);
  }

  if (disabled) {
    return (
      <div>
        <label className="block text-xs text-ink-400 mb-1.5">{label}</label>
        <div className="w-full rounded-md border border-ink-200 bg-parchment-200 px-4 py-3 text-sm flex items-center justify-between gap-2">
          <span className="text-ink-900">{selected?.name ?? emptyLabel}</span>
          {selected && (
            <span className="text-[10px] uppercase tracking-widest2 text-gold-500 shrink-0">
              ✓ Аккредитован
            </span>
          )}
        </div>
        {helperText && <p className="text-[11px] text-ink-400 mt-1.5">{helperText}</p>}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs text-ink-400 mb-1.5">{label}</label>

      {selected && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-between gap-2 rounded-md border border-gold-400
                     bg-gold-400/10 px-4 py-3 text-left"
        >
          <span>
            <span className="block text-sm font-medium text-ink-900">{selected.name}</span>
            {selected.subtitle && <span className="block text-xs text-ink-400">{selected.subtitle}</span>}
          </span>
          <span className="text-[10px] uppercase tracking-widest2 text-gold-500 shrink-0">
            ✓ Изменить
          </span>
        </button>
      ) : (
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={emptyLabel}
          autoComplete="off"
          className="w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm
                     text-ink-900 placeholder:text-ink-300 focus:border-gold-400"
        />
      )}

      {open && (
        <div
          className="absolute z-10 mt-1.5 w-full max-h-64 overflow-y-auto rounded-md border
                     border-ink-200 bg-parchment-100 shadow-lg"
        >
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-ink-400">{noMatchLabel}</p>
          ) : (
            filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelect(option)}
                className={`w-full text-left px-4 py-3 text-sm transition-colors hover:bg-parchment-300
                            ${option.id === value ? 'bg-gold-400/10' : ''}`}
              >
                <span className="block text-ink-900 font-medium">{option.name}</span>
                {option.subtitle && <span className="block text-xs text-ink-400">{option.subtitle}</span>}
              </button>
            ))
          )}
        </div>
      )}
      {helperText && !open && <p className="text-[11px] text-ink-400 mt-1.5">{helperText}</p>}
    </div>
  );
}
