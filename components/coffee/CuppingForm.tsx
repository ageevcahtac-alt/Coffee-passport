'use client';

import { useState } from 'react';
import {
  CUPPING_SCORE_DEFAULT,
  CUPPING_SCORE_MAX,
  CUPPING_SCORE_MIN,
  type CuppingRecord,
  type FlavorSubDescriptors,
  type SensoryTagId,
} from '@/lib/types/coffee';
import { FlavorSlider } from './FlavorSlider';
import { SensoryTagPicker } from './SensoryTagPicker';

export type CuppingFormValues = Omit<CuppingRecord, 'id' | 'userId' | 'createdAt'>;

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

const todayIso = () => new Date().toISOString().slice(0, 10);

export function CuppingForm({
  onSave,
  onCancel,
}: {
  onSave: (values: CuppingFormValues) => void;
  onCancel?: () => void;
}) {
  const [originCountry, setOriginCountry] = useState('');
  const [originRegion, setOriginRegion] = useState('');
  const [beanName, setBeanName] = useState('');
  const [roasterName, setRoasterName] = useState('');
  const [cuppingDate, setCuppingDate] = useState(todayIso());
  const [location, setLocation] = useState('');
  const [acidity, setAcidity] = useState(3);
  const [body, setBody] = useState(3);
  const [brightness, setBrightness] = useState(3);
  const [sensoryTags, setSensoryTags] = useState<SensoryTagId[]>([]);
  const [subDescriptors, setSubDescriptors] = useState<FlavorSubDescriptors>({});
  const [liked, setLiked] = useState('');
  const [disliked, setDisliked] = useState('');
  const [notes, setNotes] = useState('');
  const [finalScore, setFinalScore] = useState(CUPPING_SCORE_DEFAULT);

  const canSave = beanName.trim().length > 0;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="section-label mb-4">Зерно и происхождение</p>
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="cupping-bean" className="block text-xs text-ink-400 mb-1.5">
              Наименование зерна
            </label>
            <input
              id="cupping-bean"
              value={beanName}
              onChange={(e) => setBeanName(e.target.value)}
              placeholder="Ethiopia Guji Natural"
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor="cupping-roaster" className="block text-xs text-ink-400 mb-1.5">
              Обжарщик
            </label>
            <input
              id="cupping-roaster"
              value={roasterName}
              onChange={(e) => setRoasterName(e.target.value)}
              placeholder="Название обжарочной"
              className={fieldClasses}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="cupping-country" className="block text-xs text-ink-400 mb-1.5">
                Страна
              </label>
              <input
                id="cupping-country"
                value={originCountry}
                onChange={(e) => setOriginCountry(e.target.value)}
                placeholder="Эфиопия"
                className={fieldClasses}
              />
            </div>
            <div>
              <label htmlFor="cupping-region" className="block text-xs text-ink-400 mb-1.5">
                Регион
              </label>
              <input
                id="cupping-region"
                value={originRegion}
                onChange={(e) => setOriginRegion(e.target.value)}
                placeholder="Гуджи"
                className={fieldClasses}
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="section-label mb-4">Дата и место каппинга</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cupping-date" className="block text-xs text-ink-400 mb-1.5">
              Дата
            </label>
            <input
              id="cupping-date"
              type="date"
              value={cuppingDate}
              onChange={(e) => setCuppingDate(e.target.value)}
              className={fieldClasses}
            />
          </div>
          <div>
            <label htmlFor="cupping-location" className="block text-xs text-ink-400 mb-1.5">
              Место
            </label>
            <input
              id="cupping-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Кофейня, фестиваль…"
              className={fieldClasses}
            />
          </div>
        </div>
      </div>

      <div>
        <p className="section-label mb-4">Характеристики</p>
        <div className="flex flex-col gap-5">
          <FlavorSlider label="Кислотность" value={acidity} onChange={setAcidity} />
          <FlavorSlider label="Тело / Плотность" value={body} onChange={setBody} />
          <FlavorSlider label="Яркость" value={brightness} onChange={setBrightness} />
        </div>
      </div>

      <div>
        <p className="section-label mb-4">Аромат / Вкус</p>
        <SensoryTagPicker
          sensoryTags={sensoryTags}
          onSensoryTagsChange={setSensoryTags}
          subDescriptors={subDescriptors}
          onSubDescriptorsChange={setSubDescriptors}
        />
      </div>

      <div>
        <label htmlFor="cupping-liked" className="section-label mb-4 block">
          Что понравилось?
        </label>
        <textarea
          id="cupping-liked"
          rows={2}
          value={liked}
          onChange={(e) => setLiked(e.target.value)}
          placeholder="Яркая кислотность, чистый профиль…"
          className={fieldClasses}
        />
      </div>

      <div>
        <label htmlFor="cupping-disliked" className="section-label mb-4 block">
          Что не понравилось?
        </label>
        <textarea
          id="cupping-disliked"
          rows={2}
          value={disliked}
          onChange={(e) => setDisliked(e.target.value)}
          placeholder="Плоское послевкусие, дефект обжарки…"
          className={fieldClasses}
        />
      </div>

      <div>
        <label htmlFor="cupping-notes" className="section-label mb-4 block">
          Заметки (необязательно)
        </label>
        <textarea
          id="cupping-notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Свободные впечатления"
          className={fieldClasses}
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <label htmlFor="cupping-score" className="section-label">
            Финальная оценка
          </label>
          <span className="data-value text-sm text-gold-500">{finalScore}</span>
        </div>
        <input
          id="cupping-score"
          type="range"
          min={CUPPING_SCORE_MIN}
          max={CUPPING_SCORE_MAX}
          step={0.25}
          value={finalScore}
          onChange={(e) => setFinalScore(Number(e.target.value))}
          className="w-full"
          style={{ accentColor: 'var(--color-gold-500)' }}
        />
      </div>

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md border border-ink-200
                       text-ink-700 font-body font-medium text-sm px-6 py-4 flex-1
                       hover:bg-parchment-300 transition-colors"
          >
            Отмена
          </button>
        )}
        <button
          type="button"
          disabled={!canSave}
          onClick={() =>
            onSave({
              originCountry: originCountry.trim(),
              originRegion: originRegion.trim(),
              beanName: beanName.trim(),
              roasterName: roasterName.trim(),
              cuppingDate,
              location: location.trim(),
              acidity,
              body,
              brightness,
              sensoryTags,
              subDescriptors,
              liked: liked.trim(),
              disliked: disliked.trim(),
              notes: notes.trim(),
              finalScore,
            })
          }
          className="inline-flex items-center justify-center rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4 flex-[2]
                     hover:bg-ink-800 transition-colors
                     disabled:opacity-40 disabled:pointer-events-none"
        >
          Сохранить каппинг
        </button>
      </div>
      {!canSave && (
        <p className="text-xs text-ink-400 -mt-4 text-center">Укажите наименование зерна, чтобы сохранить</p>
      )}
    </div>
  );
}
