'use client';

import { useState } from 'react';
import { postJson } from '@/lib/orders/useStaffApi';
import { NEXT_STEP, PRODUCTION_STATUS_LABELS, sumUnits, type ProductionJob } from '@/lib/orders/roasteryOrders';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

// The single next production step for one job (Start -> Complete -> Ready
// for shipping -> Ship), always behind an in-app confirmation. Complete and
// Ship ask for the real quantity. Whatever happens, `onSettled` re-reads the
// authoritative state from XO COFFEE Admin — including after a conflict
// (someone else already moved the job, another tab, a retried click).
export function ProductionAction({
  job,
  onSettled,
  size = 'regular',
}: {
  job: ProductionJob;
  onSettled: (message: string | null) => void | Promise<void>;
  size?: 'regular' | 'large';
}) {
  const step = NEXT_STEP[job.status];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState('');

  if (!step) return null;
  // Production is only actionable once XO COFFEE accepted the order (Admin
  // enforces this too; this only avoids offering a button that would fail).
  if (job.order && job.order.status !== 'accepted') return null;

  const totals = sumUnits(job.items);
  const needsUnits = step.to === 'produced' || step.to === 'shipped';
  const maxUnits = step.to === 'produced' ? totals.toProduce : (job.produced_units ?? 0) + totals.fromStock;
  const minUnits = step.to === 'shipped' ? 1 : 0;
  const parsedUnits = Number(units);
  const unitsValid = !needsUnits || (units.trim() !== '' && Number.isInteger(parsedUnits) && parsedUnits >= minUnits && parsedUnits <= maxUnits);

  function openDialog() {
    setError(null);
    setUnits(needsUnits ? String(maxUnits) : '');
    setOpen(true);
  }

  async function confirm() {
    if (busy || !step) return;
    setBusy(true);
    setError(null);
    const result = await postJson<{ already: boolean }>(`/api/roaster/production/${job.id}/transition`, {
      to: step.to,
      units: needsUnits ? parsedUnits : null,
    });
    if (result.ok) {
      setBusy(false);
      setOpen(false);
      await onSettled(
        result.data.already
          ? `Уже было выполнено ранее: ${PRODUCTION_STATUS_LABELS[step.to]}.`
          : `${job.production_number}: ${PRODUCTION_STATUS_LABELS[step.to]}.`
      );
      return;
    }
    setBusy(false);
    if (result.error.code === 'stale' || result.error.code === 'not_accepted' || result.error.kind === 'not_found') {
      setOpen(false);
      await onSettled(`${result.error.message} Данные обновлены.`);
      return;
    }
    setError(result.error.message);
  }

  const buttonClasses =
    size === 'large'
      ? 'w-full sm:w-auto px-6 py-4 text-base'
      : 'px-4 py-2.5 text-sm';

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={`inline-flex items-center justify-center rounded-md bg-ink-900 text-parchment-100
                    font-body font-medium hover:bg-ink-800 transition-colors ${buttonClasses}`}
      >
        {step.label}
      </button>
      {open ? (
        <ConfirmDialog
          title={step.label}
          confirmLabel={step.label}
          busy={busy}
          error={error}
          confirmDisabled={!unitsValid}
          onConfirm={() => void confirm()}
          onClose={() => setOpen(false)}
        >
          <p>
            {job.production_number} · {step.confirm}
          </p>
          {needsUnits ? (
            <div>
              <label htmlFor={`units-${job.id}`} className="block text-xs text-ink-400 mb-1.5">
                {step.to === 'produced'
                  ? `Произведено упаковок (к производству: ${totals.toProduce})`
                  : `Отгружено упаковок (доступно: ${maxUnits} = произведено ${job.produced_units ?? 0} + со склада ${totals.fromStock})`}
              </label>
              <input
                id={`units-${job.id}`}
                type="number"
                inputMode="numeric"
                min={minUnits}
                max={maxUnits}
                value={units}
                onChange={(event) => setUnits(event.target.value)}
                className="w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-base data-value text-ink-900 focus:border-gold-400"
              />
              {!unitsValid ? (
                <p className="text-xs text-red-600 mt-1">
                  Целое число от {minUnits} до {maxUnits}.
                </p>
              ) : null}
            </div>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
