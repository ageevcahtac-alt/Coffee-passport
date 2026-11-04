import type { Lot } from '@/lib/types/coffee';
import { SUSTAINABILITY_BADGES } from '@/lib/types/coffee';
import {
  formatFermentationDays,
  hasProcessPassportContent,
  PROCESS_FAMILY_LABELS,
} from '@/lib/utils/processPassport';

// Process Passport read side (PRODUCT_BACKLOG.md #3) — the structured
// "Процесс" block next to ProducerRoasterCard, same reveal-gated placement.
// Renders nothing until the roaster actually entered data, so seed lots and
// untouched forms add no clutter. Badges are moss per DESIGN.md's
// quiet-secondary-accent convention (never gold — that stays the Q-score
// seal's color), and labeled roaster-asserted: declared by the roaster, not
// independently verified.
export function ProcessPassportCard({ lot }: { lot: Lot }) {
  const detail = lot.producer.processDetail;
  const badges = lot.producer.sustainabilityBadges;

  if (!hasProcessPassportContent(detail, badges)) return null;

  const badgeLabels = (badges ?? [])
    .map((id) => SUSTAINABILITY_BADGES.find((badge) => badge.id === id)?.label)
    .filter((label): label is string => Boolean(label));

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <p className="section-label mb-3">Процесс</p>
      {detail && (
        <dl className="grid gap-2.5 mb-6 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-400 shrink-0">Семья обработки</dt>
            <dd className="text-ink-900 text-right">{PROCESS_FAMILY_LABELS[detail.family]}</dd>
          </div>
          {detail.fermentationDays !== null && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-400 shrink-0">Ферментация</dt>
              <dd className="data-value text-ink-900 text-right">
                {formatFermentationDays(detail.fermentationDays)}
              </dd>
            </div>
          )}
          {detail.vessel.trim() && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink-400 shrink-0">Ёмкость</dt>
              <dd className="text-ink-900 text-right">{detail.vessel.trim()}</dd>
            </div>
          )}
        </dl>
      )}
      {detail?.roasterNote.trim() && (
        <>
          <p className="section-label mb-3">Почему этот процесс</p>
          <p className="text-sm text-ink-700 leading-relaxed mb-6">{detail.roasterNote.trim()}</p>
        </>
      )}
      {badgeLabels.length > 0 && (
        <div>
          <p className="section-label mb-3">Происхождение</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {badgeLabels.map((label) => (
              <span
                key={label}
                className="rounded-full border border-moss-300 text-moss-700 text-[11px]
                           uppercase tracking-widest2 px-2.5 py-1"
              >
                {label}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-ink-400 leading-relaxed">
            Значки заявлены обжарщиком и не проходят независимую проверку.
          </p>
        </div>
      )}
    </div>
  );
}
