'use client';

import { useState } from 'react';
import { DEFECT_TAGS, type DefectId } from '@/lib/types/coffee';

// Kept visually distinct from the flavor chips (no gold — these are quality
// flags, not delightful notes) and collapsed by default so a clean cup
// doesn't force guests through an extra step. Feeds straight into the
// roaster's and cafe's analytics (see LotGuestAnalytics, GuestFeedback) so
// extraction/roast problems surface where someone can act on them.
export function DefectsAccordion({
  selected,
  onChange,
}: {
  selected: DefectId[];
  onChange: (defects: DefectId[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(id: DefectId) {
    onChange(selected.includes(id) ? selected.filter((d) => d !== id) : [...selected, id]);
  }

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex items-center justify-between w-full px-4 py-3.5 text-left"
      >
        <span className="text-sm text-ink-900">Есть дефекты во вкусе?</span>
        <span className="data-value text-xs text-ink-400 shrink-0 ml-3">
          {selected.length > 0 ? `${selected.length} · ` : ''}
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-wrap gap-2 reveal-fade">
          {DEFECT_TAGS.map((tag) => {
            const active = selected.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag.id)}
                aria-pressed={active}
                className={`rounded-full border px-3.5 py-2 text-sm transition-colors
                            ${active
                              ? 'border-ink-700 bg-ink-100 text-ink-900'
                              : 'border-ink-200 bg-parchment-200 text-ink-500'}`}
              >
                {tag.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
