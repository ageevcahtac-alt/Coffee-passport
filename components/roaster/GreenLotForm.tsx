'use client';

import { useState, type FormEvent } from 'react';
import type { CanonicalGreenLot } from '@/lib/data/canonicalLotStore';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

const primaryButtonClasses =
  'flex-1 inline-flex items-center justify-center rounded-md bg-ink-900 text-parchment-100 ' +
  'font-body font-medium text-sm px-6 py-4 hover:bg-ink-800 transition-colors disabled:opacity-40 disabled:pointer-events-none';

const secondaryButtonClasses =
  'inline-flex items-center justify-center rounded-md border border-ink-200 text-ink-700 ' +
  'font-body font-medium text-sm px-6 py-4 hover:bg-parchment-300 transition-colors disabled:opacity-40 disabled:pointer-events-none';

export interface GreenLotFormValues {
  purchasedKg: number | null;
  purchaseDate: string | null;
  contractReference: string;
  notes: string;
}

// COFFEE_GREEN_LOT_EDIT_PATHS_IMPLEMENTATION.md — shared between creation
// (app/dashboard/roaster/new/page.tsx, blank/no initialGreenLot) and
// editing (components/roaster/CanonicalLotChain.tsx, pre-filled from the
// real row). Every field here is Green-Lot-owned only (purchase/contract/
// notes) — no Coffee identity field and no Canonical Lot field is
// collected or editable through this form.
export function GreenLotForm({
  initialGreenLot,
  saving,
  saveError,
  onSubmit,
  onCancel,
}: {
  initialGreenLot?: CanonicalGreenLot;
  saving: boolean;
  saveError: string | null;
  onSubmit: (values: GreenLotFormValues) => void;
  onCancel: () => void;
}) {
  const isEditing = Boolean(initialGreenLot);
  const [purchasedKg, setPurchasedKg] = useState(
    initialGreenLot?.purchasedKg != null ? String(initialGreenLot.purchasedKg) : ''
  );
  const [purchaseDate, setPurchaseDate] = useState(initialGreenLot?.purchaseDate ?? '');
  const [contractReference, setContractReference] = useState(initialGreenLot?.contractReference ?? '');
  const [notes, setNotes] = useState(initialGreenLot?.notes ?? '');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      purchasedKg: purchasedKg.trim() ? Number(purchasedKg) : null,
      purchaseDate: purchaseDate.trim() || null,
      contractReference: contractReference.trim(),
      notes: notes.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="section-label">{isEditing ? 'Редактировать партию' : 'Новая партия зелёного кофе'}</p>
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="gl-kg" className="block text-xs text-ink-400 mb-1.5">
            Закупленный вес, кг
          </label>
          <input
            id="gl-kg"
            type="number"
            step="0.1"
            min="0"
            value={purchasedKg}
            onChange={(e) => setPurchasedKg(e.target.value)}
            className={fieldClasses}
          />
        </div>
        <div>
          <label htmlFor="gl-date" className="block text-xs text-ink-400 mb-1.5">
            Дата закупки
          </label>
          <input
            id="gl-date"
            type="date"
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            className={fieldClasses}
          />
        </div>
      </div>
      <div>
        <label htmlFor="gl-contract" className="block text-xs text-ink-400 mb-1.5">
          Номер контракта
        </label>
        <input
          id="gl-contract"
          value={contractReference}
          onChange={(e) => setContractReference(e.target.value)}
          className={fieldClasses}
        />
      </div>
      <div>
        <label htmlFor="gl-notes" className="block text-xs text-ink-400 mb-1.5">
          Заметки
        </label>
        <textarea id="gl-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldClasses} />
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onCancel} disabled={saving} className={secondaryButtonClasses}>
          Отмена
        </button>
        <button type="submit" disabled={saving} className={primaryButtonClasses}>
          {saving ? 'Сохранение...' : isEditing ? 'Сохранить изменения' : 'Создать партию'}
        </button>
      </div>
    </form>
  );
}
