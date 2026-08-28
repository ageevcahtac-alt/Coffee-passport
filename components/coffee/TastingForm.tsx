'use client';

import { useState } from 'react';
import type {
  BodyTexture,
  DefectId,
  FlavorSubDescriptors,
  RoasterFlavorProfile,
  SensoryTagId,
} from '@/lib/types/coffee';
import { RatingInput } from './RatingInput';
import { SensoryTagPicker } from './SensoryTagPicker';
import { FlavorSlider } from './FlavorSlider';
import { BodyTextureSelector } from './BodyTextureSelector';
import { DefectsAccordion } from './DefectsAccordion';

export interface TastingFormValues {
  rating: number;
  guestFlavorProfile: RoasterFlavorProfile;
  bodyTexture: BodyTexture | null;
  sensoryTags: SensoryTagId[];
  subDescriptors: FlavorSubDescriptors;
  defects: DefectId[];
  liked: string;
  disliked: string;
  note: string;
}

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

export function TastingForm({ onSave }: { onSave: (values: TastingFormValues) => void }) {
  const [rating, setRating] = useState(0);
  const [acidity, setAcidity] = useState(3);
  const [sweetness, setSweetness] = useState(3);
  const [body, setBody] = useState(3);
  const [bitterness, setBitterness] = useState(3);
  const [bodyTexture, setBodyTexture] = useState<BodyTexture | null>(null);
  const [sensoryTags, setSensoryTags] = useState<SensoryTagId[]>([]);
  const [subDescriptors, setSubDescriptors] = useState<FlavorSubDescriptors>({});
  const [defects, setDefects] = useState<DefectId[]>([]);
  const [liked, setLiked] = useState('');
  const [disliked, setDisliked] = useState('');
  const [note, setNote] = useState('');

  const canSave = rating > 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="section-label mb-4">Оценка</p>
        <RatingInput value={rating} onChange={setRating} />
      </div>

      <div>
        <p className="section-label mb-4">Ваш вкусовой профиль</p>
        <div className="flex flex-col gap-5">
          <FlavorSlider label="Кислотность" value={acidity} onChange={setAcidity} />
          <FlavorSlider label="Сладость" value={sweetness} onChange={setSweetness} />
          <FlavorSlider label="Плотность" value={body} onChange={setBody} />
          <FlavorSlider label="Горечь" value={bitterness} onChange={setBitterness} />
        </div>
      </div>

      <div>
        <p className="section-label mb-4">Текстура тела</p>
        <BodyTextureSelector value={bodyTexture} onChange={setBodyTexture} />
      </div>

      <div>
        <p className="section-label mb-4">Вкусовые впечатления</p>
        <SensoryTagPicker
          sensoryTags={sensoryTags}
          onSensoryTagsChange={setSensoryTags}
          subDescriptors={subDescriptors}
          onSubDescriptorsChange={setSubDescriptors}
        />
      </div>

      <DefectsAccordion selected={defects} onChange={setDefects} />

      <div>
        <label htmlFor="liked" className="section-label mb-4 block">
          Что вам понравилось?
        </label>
        <textarea
          id="liked"
          rows={2}
          value={liked}
          onChange={(event) => setLiked(event.target.value)}
          placeholder="Яркая кислотность, ароматное послевкусие…"
          className={fieldClasses}
        />
      </div>

      <div>
        <label htmlFor="disliked" className="section-label mb-4 block">
          Что не понравилось?
        </label>
        <textarea
          id="disliked"
          rows={2}
          value={disliked}
          onChange={(event) => setDisliked(event.target.value)}
          placeholder="Слишком терпко, не хватило сладости…"
          className={fieldClasses}
        />
      </div>

      <div>
        <label htmlFor="note" className="section-label mb-4 block">
          Заметки (необязательно)
        </label>
        <textarea
          id="note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Свободные впечатления о чашке"
          className={fieldClasses}
        />
      </div>

      <button
        type="button"
        disabled={!canSave}
        onClick={() =>
          onSave({
            rating,
            guestFlavorProfile: { acidity, sweetness, body, bitterness },
            bodyTexture,
            sensoryTags,
            subDescriptors,
            defects,
            liked,
            disliked,
            note,
          })
        }
        className="inline-flex items-center justify-center rounded-md bg-ink-900
                   text-parchment-100 font-body font-medium text-sm px-6 py-4
                   hover:bg-ink-800 transition-colors
                   disabled:opacity-40 disabled:pointer-events-none"
      >
        Сохранить дегустацию в дневник
      </button>
      {!canSave && (
        <p className="text-xs text-ink-400 -mt-4 text-center">Поставьте оценку, чтобы сохранить</p>
      )}
    </div>
  );
}
