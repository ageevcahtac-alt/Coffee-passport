'use client';

import { useEffect, useState } from 'react';
import { findCanonicalLotByPublicId, updateCanonicalLotFields, type CanonicalLot } from '@/lib/data/canonicalLotStore';
import type { LotStatus } from '@/lib/types/database';

const STATUSES: LotStatus[] = ['draft', 'testing', 'active', 'archived'];

// Small, local duplicate of CanonicalLotChain's own STATUS_LABELS (Phase
// 4.5.3) rather than a shared export — four literal strings aren't worth
// coupling this control's file to that one's.
const STATUS_LABELS: Record<LotStatus, string> = {
  draft: 'Черновик',
  testing: 'Тестируется',
  active: 'Активен',
  archived: 'В архиве',
};

// Phase 4.5.10 — the only two REQUIRED-for-active fields the readiness
// audit found (PHASE_4.5.10_REPORT.md §2-3): `name` is already guaranteed
// non-empty by LotBuilderForm's own canSave gate for every save, creating
// or editing (this check is defense-in-depth, not the enforcement point);
// `qGrade` is not — LotBuilderForm collapses a blank Q-Score input to `0`
// (`Number(form.qGrade) || 0`) via its editing path (canSave doesn't gate
// on qGrade at all, only the creation wizard's step progression loosely
// does), and 0 is indistinguishable from "really scored zero." Unlike every
// other field the audit checked (descriptors/roastProfile/roastType/
// roasterFlavorProfile all already default to a sensible non-blank value in
// LotBuilderForm), a `0.0` Q-Score renders as the literal, prominent visual
// centerpiece of the guest passport (components/coffee/QGrade.tsx's "seal"),
// not a graceful empty state — so this is the one place a genuinely
// meaningless Canonical Lot could reach status='active' undetected.
// Exported for components/roaster/CanonicalLotStatusControl.test.ts — this
// gate had no test coverage at all (COFFEE_PASSPORT_PRODUCTION_READINESS_AUDIT.md).
export function isReadyForActive(lot: CanonicalLot): boolean {
  return Boolean(lot.name.trim()) && lot.qGrade != null && lot.qGrade > 0;
}

// Phase 4.5.4 — status is the one Canonical Lot field with no existing UI
// anywhere: the local Lot type (lib/types/coffee.ts) has no `status`
// concept at all, it's Supabase-only. Self-contained: fetches its own
// canonical row and writes straight through updateCanonicalLotFields
// (Phase 4.5.1), which only ever accepts { name, status, inRoasterCatalog }
// scoped to this Lot's own uuid — it structurally cannot touch Coffee,
// Green Lot, or any other Canonical Lot sharing that Green Lot.
export function CanonicalLotStatusControl({ publicId, onUpdated }: { publicId: string; onUpdated?: () => void }) {
  const [canonicalLot, setCanonicalLot] = useState<CanonicalLot | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    findCanonicalLotByPublicId(publicId).then((found) => {
      if (!cancelled) setCanonicalLot(found);
    });
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  async function selectStatus(status: LotStatus) {
    if (!canonicalLot || status === canonicalLot.status || saving) return;
    // Only the transition INTO active is gated — draft and testing remain
    // freely savable/incomplete (Phase 4.5.10 §2: a roaster must be able to
    // save an unfinished draft; testing never auto-promotes either), and
    // moving OUT of active (e.g. back to draft to fix something) is never
    // blocked by this check.
    if (status === 'active' && !isReadyForActive(canonicalLot)) {
      setError('Перед публикацией (статус «Активен») укажите название и реальный Q-Score лота — сейчас профиль ещё не готов.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateCanonicalLotFields(canonicalLot.id, { status });
      setCanonicalLot({ ...canonicalLot, status });
      onUpdated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить статус.');
    } finally {
      setSaving(false);
    }
  }

  // No canonical row for this Lot (not yet backfilled/created) — nothing to
  // edit here, same tolerance as CanonicalLotChain's own "not connected" state.
  if (!canonicalLot) return null;

  return (
    <div className="mt-3">
      <p className="text-xs text-ink-400 mb-2">Статус в каноническом каталоге</p>
      <div role="radiogroup" aria-label="Статус лота" className="grid grid-cols-4 gap-2">
        {STATUSES.map((status) => {
          const checked = canonicalLot.status === status;
          return (
            <label
              key={status}
              className={`flex items-center justify-center text-center rounded-md border
                          px-2 py-2 text-xs cursor-pointer transition-colors
                          ${checked ? 'border-gold-400 bg-gold-400/10 text-ink-900 font-medium' : 'border-ink-200 bg-parchment-100 text-ink-500'}
                          ${saving ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <input
                type="radio"
                name="canonical-lot-status"
                value={status}
                checked={checked}
                onChange={() => selectStatus(status)}
                className="sr-only"
              />
              {STATUS_LABELS[status]}
            </label>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
