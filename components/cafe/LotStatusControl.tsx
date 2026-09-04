'use client';

import { useState } from 'react';
import { LOT_MENU_STATUS_LABELS, type LotMenuStatus } from '@/lib/types/coffee';
import { CountdownTimer } from '@/components/coffee/CountdownTimer';

const STATUSES: LotMenuStatus[] = ['new', 'active', 'discontinuing'];

const ACCENT_CLASSES: Record<LotMenuStatus, string> = {
  new: 'border-moss-500 bg-moss-100 text-moss-700',
  active: 'border-ink-400 bg-parchment-200 text-ink-700',
  discontinuing: 'border-scorch bg-scorch/10 text-scorch',
};

const fieldClasses =
  'rounded-md border border-ink-200 bg-parchment-100 px-3 py-2 text-sm ' +
  'text-ink-900 focus:border-gold-400';

function addDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// The cafe-side lifecycle selector — "Новинка / Активен / Выводим" — plus,
// once "Выводим" is picked, the removal-timeframe sub-picker the spec asks
// for ("через 1 неделю, 1 месяц или конкретной даты"), computing
// scheduled_removal_at from whichever preset (or custom date) the cafe
// chooses. Only meaningful while the lot's "В меню кофейни" toggle is on
// (see lib/data/cafeMenuStore.ts's isActive/status split), so callers
// render this only in that state.
export function LotStatusControl({
  value,
  scheduledRemovalAt,
  onChange,
}: {
  value: LotMenuStatus;
  scheduledRemovalAt: string | null;
  onChange: (status: LotMenuStatus, scheduledRemovalAt: string | null) => void;
}) {
  // Local-only draft for the custom-date input — only committed via
  // onChange once the cafe actually picks "Своя дата", same "don't fire on
  // every keystroke" restraint as the rest of this app's forms.
  const [customDate, setCustomDate] = useState('');

  function selectStatus(status: LotMenuStatus) {
    if (status !== 'discontinuing') {
      onChange(status, null);
      return;
    }
    // Picking "Выводим" fresh (wasn't already discontinuing) defaults to
    // the 1-week preset rather than leaving scheduled_removal_at empty —
    // the control always needs SOME target for the countdown to have
    // anything to show.
    onChange('discontinuing', scheduledRemovalAt ?? addDays(7));
  }

  return (
    <div>
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
                onChange={() => selectStatus(status)}
                className="sr-only"
              />
              {LOT_MENU_STATUS_LABELS[status]}
            </label>
          );
        })}
      </div>

      {value === 'discontinuing' && (
        <div className="mt-3 rounded-md border border-scorch/40 bg-scorch/5 p-3">
          <p className="text-xs text-ink-500 mb-2">Когда убрать лот из меню?</p>
          <div className="flex flex-wrap gap-2 mb-2">
            <PresetButton label="Через неделю" onClick={() => onChange('discontinuing', addDays(7))} />
            <PresetButton label="Через месяц" onClick={() => onChange('discontinuing', addDays(30))} />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setCustomDate(event.target.value)}
              className={fieldClasses}
            />
            <button
              type="button"
              disabled={!customDate}
              onClick={() => onChange('discontinuing', new Date(customDate).toISOString())}
              className="text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900
                         disabled:opacity-40 disabled:pointer-events-none"
            >
              Применить дату
            </button>
          </div>
          {scheduledRemovalAt && (
            <div className="mt-2">
              <CountdownTimer targetDate={scheduledRemovalAt} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-ink-200 bg-parchment-100 px-3 py-1.5 text-xs
                 text-ink-700 hover:border-scorch hover:text-scorch transition-colors"
    >
      {label}
    </button>
  );
}
