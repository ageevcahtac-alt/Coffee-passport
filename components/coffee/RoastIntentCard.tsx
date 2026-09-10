import type { ActiveReferenceRoastProfile } from '@/lib/data/canonicalLotStore';
import { RoastCurveChart } from './RoastCurveChart';

// "Задумано обжарщиком" — the roaster's declared target approach for this
// Lot, distinct from RoastProfileSummaryCard/RoastingTab below it on the
// Passport (both fed by the most recent actual roast — see
// PUBLIC_ROAST_INTENT_VS_FACT.md). A new, minimal, purpose-built card
// rather than a RoastProfileSummaryCard rewrite: that card's own
// TargetCurve sub-component draws an illustrative curve from two
// temperature numbers (chargeTemp/dropTemp) — fields the declared-target
// data doesn't have at all (it stores a full curve instead). Reuses
// RoastCurveChart (already built for exactly a point-array curve, already
// used by RoastingTab) rather than inventing a second charting component.
//
// Only fields already part of the existing public roast-profile contract
// are shown here — machine model, curve shape, target roast degree
// (Agtron), roaster's notes. No batch dates, no batch numbers, no
// purchasing/production-internal data — this table doesn't even have those
// columns to begin with.
export function RoastIntentCard({ profile }: { profile: ActiveReferenceRoastProfile }) {
  const hasContent =
    profile.machineModel || profile.targetCurve.length > 0 || profile.agtronTarget !== null || profile.notes;
  if (!hasContent) return null;

  return (
    <div className="rounded-md border border-gold-400/50 bg-parchment-100 p-5">
      <p className="section-label mb-4">Задумано обжарщиком</p>

      {profile.targetCurve.length > 0 && <RoastCurveChart points={profile.targetCurve} />}

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm mt-5">
        {profile.machineModel && (
          <div className="col-span-2 flex justify-between">
            <dt className="text-ink-400">Машина</dt>
            <dd className="data-value text-ink-900">{profile.machineModel}</dd>
          </div>
        )}
        {profile.agtronTarget !== null && (
          <div className="flex justify-between col-span-2">
            <dt className="text-ink-400">Целевая степень обжарки (Agtron)</dt>
            <dd className="data-value text-ink-900">{profile.agtronTarget}</dd>
          </div>
        )}
      </dl>

      {profile.notes && (
        <p className="text-sm text-ink-700 leading-relaxed mt-5 pt-5 border-t border-ink-100">{profile.notes}</p>
      )}
    </div>
  );
}
