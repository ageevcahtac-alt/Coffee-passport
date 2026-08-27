'use client';

import { useState } from 'react';
import type { SensoryTagId } from '@/lib/types/coffee';
import { RatingInput } from './RatingInput';
import { SensoryTagPicker } from './SensoryTagPicker';

export interface TastingFormValues {
  rating: number;
  sensoryTags: SensoryTagId[];
  liked: string;
  disliked: string;
  note: string;
}

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

export function TastingForm({ onSave }: { onSave: (values: TastingFormValues) => void }) {
  const [rating, setRating] = useState(0);
  const [sensoryTags, setSensoryTags] = useState<SensoryTagId[]>([]);
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
        <p className="section-label mb-4">Вкусовые впечатления</p>
        <SensoryTagPicker value={sensoryTags} onChange={setSensoryTags} />
      </div>

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
        onClick={() => onSave({ rating, sensoryTags, liked, disliked, note })}
        className="inline-flex items-center justify-center rounded-md bg-ink-900
                   text-parchment-100 font-body font-medium text-sm px-6 py-4
                   hover:bg-ink-800 transition-colors
                   disabled:opacity-40 disabled:pointer-events-none"
      >
        Сохранить в моё кофейное путешествие
      </button>
      {!canSave && (
        <p className="text-xs text-ink-400 -mt-4 text-center">Поставьте оценку, чтобы сохранить</p>
      )}
    </div>
  );
}
