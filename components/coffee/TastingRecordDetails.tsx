import {
  BODY_TEXTURE_OPTIONS,
  BREWING_METHODS,
  DEFECT_TAGS,
  SENSORY_TAGS,
  type TastingRecord,
} from '@/lib/types/coffee';
import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { getBaristaById } from '@/lib/data/baristas';
import { formatTastingDate } from '@/lib/utils/date';
import { StarRating } from './StarRating';
import { FlavorMeter } from './ProducerRoasterCard';

// Full, unabridged read of a single TastingRecord — every field the guest
// filled in during the blind-cupping flow (TastingForm), rendered without
// truncation or summarizing. Extracted out of TastingDetailModal so the same
// "the actual card the guest filled out" view can also be embedded,
// chrome-free, inside LotPassportModal's "Моя оценка" comparison panel —
// a trimmed-down re-summary there was the bug this component fixes.
export function TastingRecordDetails({ record }: { record: TastingRecord }) {
  const shop = getCoffeeShopById(record.coffeeShopId);
  const barista = getBaristaById(record.baristaId);
  const brewingMethod = BREWING_METHODS.find((method) => method.id === record.brewingMethod);
  const bodyTextureLabel = record.bodyTexture
    ? BODY_TEXTURE_OPTIONS.find((option) => option.id === record.bodyTexture)?.label
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-ink-900 mb-1">
          {shop?.name ?? record.coffeeShopId}
          {shop?.city ? ` · ${shop.city}` : ''}
        </p>
        <p className="text-xs text-ink-400">
          Попробовано {formatTastingDate(record.createdAt)}
          {brewingMethod ? ` · ${brewingMethod.label}` : ''}
        </p>
      </div>

      <div>
        <p className="section-label mb-3">Оценка чашки</p>
        <StarRating value={record.rating} label={`Оценка ${record.rating} из 5`} />
      </div>

      <div>
        <p className="section-label mb-3">Ваш вкусовой профиль</p>
        <div className="flex flex-col gap-3">
          <FlavorMeter label="Кислотность" value={record.guestFlavorProfile.acidity} />
          <FlavorMeter label="Сладость" value={record.guestFlavorProfile.sweetness} />
          <FlavorMeter label="Плотность" value={record.guestFlavorProfile.body} />
          <FlavorMeter label="Горечь" value={record.guestFlavorProfile.bitterness} />
        </div>
      </div>

      {bodyTextureLabel && (
        <div>
          <p className="section-label mb-2">Текстура тела</p>
          <p className="text-sm text-ink-700">{bodyTextureLabel}</p>
        </div>
      )}

      {record.sensoryTags.length > 0 && (
        <div>
          <p className="section-label mb-3">Вкусовые впечатления</p>
          <ul className="flex flex-col gap-1.5">
            {record.sensoryTags.map((tagId) => {
              const tag = SENSORY_TAGS.find((candidate) => candidate.id === tagId);
              const subs = record.subDescriptors[tagId];
              return (
                <li key={tagId} className="text-sm text-ink-700">
                  {tag?.label ?? tagId}
                  {subs && subs.length > 0 && <span className="text-ink-400"> ({subs.join(', ')})</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {record.defects.length > 0 && (
        <div>
          <p className="section-label mb-3">Дефекты во вкусе</p>
          <ul className="flex flex-wrap gap-2">
            {record.defects.map((defectId) => {
              const defect = DEFECT_TAGS.find((candidate) => candidate.id === defectId);
              return (
                <li
                  key={defectId}
                  className="rounded-full border border-ink-700 bg-ink-100 px-3 py-1.5 text-xs text-ink-900"
                >
                  {defect?.label ?? defectId}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {record.liked && (
        <div>
          <p className="section-label mb-2">Понравилось</p>
          <p className="text-sm text-ink-700">{record.liked}</p>
        </div>
      )}

      {record.disliked && (
        <div>
          <p className="section-label mb-2">Не понравилось</p>
          <p className="text-sm text-ink-700">{record.disliked}</p>
        </div>
      )}

      {record.note && (
        <div>
          <p className="section-label mb-2">Заметки</p>
          <p className="text-sm text-ink-700">{record.note}</p>
        </div>
      )}

      <div>
        <p className="section-label mb-3">Бариста</p>
        <p className="text-sm text-ink-900 mb-2">{barista?.name ?? 'Не указан'}</p>
        {record.baristaRating > 0 && (
          <div className="mb-2">
            <StarRating
              value={record.baristaRating}
              label={`Оценка бариста ${record.baristaRating} из 5`}
            />
          </div>
        )}
        {record.baristaNote && <p className="text-sm text-ink-700">{record.baristaNote}</p>}
      </div>
    </div>
  );
}
