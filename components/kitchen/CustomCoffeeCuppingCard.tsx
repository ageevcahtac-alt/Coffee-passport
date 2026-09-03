import { BREWING_METHODS, SENSORY_TAGS } from '@/lib/types/coffee';
import type { CustomCoffeeCupping } from '@/lib/types/kitchen';
import { StarRating } from '@/components/coffee/StarRating';
import { formatDate } from '@/lib/utils/date';

// Summary of one past cupping evaluation of a UserCustomCoffee. Deliberately
// its own small presentational component rather than reusing
// TastingRecordDetails — that one resolves a Lot/coffee-shop/barista from
// the public catalog to render its header, which a CustomCoffeeCupping
// (by design) has none of.
export function CustomCoffeeCuppingCard({
  cupping,
  onDelete,
}: {
  cupping: CustomCoffeeCupping;
  onDelete?: () => void;
}) {
  const method = BREWING_METHODS.find((candidate) => candidate.id === cupping.brewingMethod);
  const { acidity, sweetness, body, bitterness } = cupping.sensory.guestFlavorProfile;

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-xs text-ink-400 mb-1.5">{formatDate(cupping.createdAt)}</p>
          <StarRating value={cupping.sensory.rating} label={`Оценка ${cupping.sensory.rating} из 5`} />
        </div>
        <span className="data-value text-lg text-gold-500 shrink-0">{cupping.cuppingScore.toFixed(1)}</span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-3">
        <div className="flex items-baseline justify-between">
          <dt className="text-ink-400">Кислотность</dt>
          <dd className="data-value text-ink-900">{acidity}/5</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-ink-400">Сладость</dt>
          <dd className="data-value text-ink-900">{sweetness}/5</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-ink-400">Тело</dt>
          <dd className="data-value text-ink-900">{body}/5</dd>
        </div>
        <div className="flex items-baseline justify-between">
          <dt className="text-ink-400">Горечь</dt>
          <dd className="data-value text-ink-900">{bitterness}/5</dd>
        </div>
      </dl>

      <p className="text-xs text-ink-400 mb-2">
        {method?.label ?? cupping.brewingMethod}
        {cupping.grinderModel && ` · ${cupping.grinderModel}`}
        {cupping.doseG > 0 && cupping.waterG > 0 && ` · ${cupping.doseG}г → ${cupping.waterG}г`}
      </p>

      {cupping.sensory.sensoryTags.length > 0 && (
        <p className="text-xs text-ink-500 mb-2">
          {cupping.sensory.sensoryTags
            .map((tagId) => SENSORY_TAGS.find((tag) => tag.id === tagId)?.label ?? tagId)
            .join(' · ')}
        </p>
      )}

      {cupping.sensory.liked && <p className="text-sm text-ink-700 mb-1">👍 {cupping.sensory.liked}</p>}
      {cupping.sensory.disliked && <p className="text-sm text-ink-500 mb-1">👎 {cupping.sensory.disliked}</p>}
      {cupping.sensory.note && <p className="text-sm text-ink-700 mt-2">{cupping.sensory.note}</p>}

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 mt-3"
        >
          Удалить оценку
        </button>
      )}
    </div>
  );
}
