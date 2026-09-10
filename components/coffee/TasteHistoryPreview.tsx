import Link from 'next/link';
import type { TastingRecord } from '@/lib/types/coffee';
import { BREWING_METHODS } from '@/lib/types/coffee';
import { getGuestDescriptorWords } from '@/lib/journey/tasteDescriptors';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { formatTastingDate } from '@/lib/utils/date';

// Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md, §8) — "One Lot
// — Many Cups" already exists as CoffeeJourney.tsx (Roaster → Lot →
// individual tastings, on /journey), it just wasn't discoverable from the
// one place a guest would look for it: the Passport of the lot they just
// tasted. This component does NOT reimplement that feature — it's a
// compact, read-only preview built from the same already-loaded `journey`
// data the passport page already has via useJourney() (zero new Supabase
// calls), promoted onto the Passport with a link into the full view.
//
// Deliberately a narrative list, not a table: each row already carries a
// one-line descriptor summary so the "same lot, different story" idea is
// visible without a click, matching the brief's own worked example
// ("Espresso · утро · ягоды, сладость").
// Exported for TasteHistoryPreview.test.ts — the sort/slice logic is the
// only part of this component with real behavior worth unit-testing
// without a DOM (this project has no jsdom/component-render infra; see
// COFFEE_PASSPORT_PRODUCTION_READINESS_AUDIT.md's test-strategy findings).
export function summarizeTasteHistory(
  records: TastingRecord[],
  maxVisible = 3
): { visible: TastingRecord[]; remaining: number } {
  const sorted = [...records].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const visible = sorted.slice(0, maxVisible);
  return { visible, remaining: sorted.length - visible.length };
}

export function TasteHistoryPreview({ records, maxVisible = 3 }: { records: TastingRecord[]; maxVisible?: number }) {
  if (records.length === 0) return null;

  const { visible, remaining } = summarizeTasteHistory(records, maxVisible);

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <p className="section-label mb-1">История вкуса</p>
      <p className="text-xs text-ink-400 mb-5">Как этот лот раскрывался для вас в других чашках</p>

      <div className="flex flex-col gap-3">
        {visible.map((record) => {
          const methodLabel = BREWING_METHODS.find((method) => method.id === record.brewingMethod)?.label;
          const shop = getCoffeeShopById(record.coffeeShopId);
          const words = getGuestDescriptorWords(record.sensoryTags, record.subDescriptors);
          return (
            <div key={record.id} className="border-t border-ink-100 pt-3 first:border-t-0 first:pt-0">
              <p className="text-xs text-ink-900">
                {methodLabel ?? 'Способ не указан'}
                {shop?.name ? ` · ${shop.name}` : ''}
                <span className="text-ink-300"> · {formatTastingDate(record.createdAt)}</span>
              </p>
              {words.length > 0 && <p className="text-xs text-ink-500 mt-0.5">{words.join(', ')}</p>}
            </div>
          );
        })}
      </div>

      <Link
        href="/journey"
        className="mt-4 inline-block text-xs text-ink-700 underline underline-offset-2 hover:text-ink-900"
      >
        {remaining > 0 ? `Ещё ${remaining} в полной истории →` : 'Открыть полную историю вкуса →'}
      </Link>
    </div>
  );
}
