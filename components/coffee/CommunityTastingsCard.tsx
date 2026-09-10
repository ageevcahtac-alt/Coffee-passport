import type { CommunityTasting } from '@/lib/journey/store';
import { BREWING_METHODS, FLAVOR_AXES } from '@/lib/types/coffee';
import { descriptorsByBrewMethod, mostCommonDescriptors } from '@/lib/journey/communityAggregation';
import { StarRating } from './StarRating';
import { formatTastingDate } from '@/lib/utils/date';

// Community Layer, Category A (COMMUNITY_LAYER_PRODUCT_AUDIT.md) — the
// first guest-facing surface where one guest's blind-tasting experience
// becomes visible to another, on this exact Lot's own Passport ("PASSPORT"
// visibility tier, not a cross-Lot feed). Every entry here was explicitly
// opted into sharing by the guest who logged it (see the checkbox in
// /passport/[lotId]/taste) — nothing is shown that wasn't consented to.
// Anonymous by construction: no author name is rendered because none
// exists to render (see the migration's own comment) — same convention as
// every other "not fabricating data" card in this codebase, applied here
// to identity rather than a data value.
//
// Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md, §9) — the
// aggregate section above the flat list is deliberately conservative: both
// mostCommonDescriptors and descriptorsByBrewMethod render nothing below
// their own minimum-sample thresholds, so a lot with only 1-2 opted-in
// tastings never gets an invented "pattern." This is additive, never a
// replacement for the individual list below it — some guests want the
// aggregate, some want to read specific people's specific notes.
export function CommunityTastingsCard({ tastings }: { tastings: CommunityTasting[] }) {
  if (tastings.length === 0) return null;

  const commonDescriptors = mostCommonDescriptors(tastings);
  const byBrewMethod = descriptorsByBrewMethod(tastings);

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <p className="section-label mb-1">Как это восприняло сообщество</p>
      <p className="text-xs text-ink-400 mb-5">
        {tastings.length} {tastings.length === 1 ? 'человек попробовал' : 'человек попробовали'} этот лот и
        поделились впечатлением анонимно
      </p>

      {commonDescriptors.length > 0 && (
        <div className="mb-4 pb-4 border-b border-ink-200">
          <p className="text-xs text-ink-400 mb-1.5">Что чувствуют чаще всего</p>
          <p className="text-sm text-ink-900">{commonDescriptors.map((d) => d.label).join(' · ')}</p>
        </div>
      )}

      {byBrewMethod.length > 0 && (
        <div className="mb-4 pb-4 border-b border-ink-200">
          <p className="text-xs text-ink-400 mb-2">Восприятие меняется по способу приготовления</p>
          <div className="flex flex-col gap-1.5">
            {byBrewMethod.map((group) => (
              <p key={group.brewingMethodLabel} className="text-xs text-ink-700">
                <span className="text-ink-900 font-medium">{group.brewingMethodLabel}</span> →{' '}
                {group.descriptors.map((d) => d.label).join(', ')}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {tastings.map((tasting, index) => {
          const methodLabel = BREWING_METHODS.find((method) => method.id === tasting.brewingMethod)?.label;
          return (
            <div key={index} className="border-t border-ink-100 pt-4 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <StarRating value={tasting.rating} label={`Оценка гостя ${tasting.rating} из 5`} />
                <span className="text-[11px] text-ink-300">{formatTastingDate(tasting.createdAt)}</span>
              </div>
              {methodLabel && <p className="text-[11px] text-ink-400 mb-1">{methodLabel}</p>}
              <p className="text-[11px] text-ink-500 mb-1.5">
                {FLAVOR_AXES.map(({ key, label }) => `${label} ${tasting.guestFlavorProfile[key]}`).join(' · ')}
              </p>
              {tasting.liked && (
                <p className="text-xs text-ink-700">
                  <span className="text-ink-400">Понравилось:</span> {tasting.liked}
                </p>
              )}
              {tasting.disliked && (
                <p className="text-xs text-ink-500">
                  <span className="text-ink-400">Не понравилось:</span> {tasting.disliked}
                </p>
              )}
              {tasting.note && <p className="text-xs text-ink-500 mt-1">{tasting.note}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
