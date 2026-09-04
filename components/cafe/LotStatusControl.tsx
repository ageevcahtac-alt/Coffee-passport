'use client';

import { LOT_MENU_STATUS_LABELS, type LotMenuStatus } from '@/lib/types/coffee';

const STATUSES: LotMenuStatus[] = ['new', 'active', 'discontinuing'];

const ACCENT_CLASSES: Record<LotMenuStatus, string> = {
  new: 'border-moss-500 bg-moss-100 text-moss-700',
  active: 'border-ink-400 bg-parchment-200 text-ink-700',
  discontinuing: 'border-scorch bg-scorch/10 text-scorch',
};

// The cafe-side lifecycle selector — "Новинка / Активен / Выводим" — only
// meaningful while the lot's "В меню кофейни" toggle is on (see
// lib/data/cafeMenuStore.ts's isActive/status split), so callers render
// this only in that state.
export function LotStatusControl({
  value,
  onChange,
}: {
  value: LotMenuStatus;
  onChange: (status: LotMenuStatus) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Статус лота в меню" className="grid grid-cols-3 gap-2">
      {STATUSES.map((status) => {
        const checked = value === status;
        return (
          <label
            key={status}
            className={`flex items-center justify-center text-center rounded-md border
                        px-2 py-2.5 text-xs cursor-pointer transition-colors
                        ${checked ? ACCENT_CLASSES[status] + ' font-medium' : 'border-ink-200 bg-parchment-100 text-ink-500'}`}
          >
            <input
              type="radio"
              name="lot-menu-status"
              value={status}
              checked={checked}
              onChange={() => onChange(status)}
              className="sr-only"
            />
            {LOT_MENU_STATUS_LABELS[status]}
          </label>
        );
      })}
    </div>
  );
}
