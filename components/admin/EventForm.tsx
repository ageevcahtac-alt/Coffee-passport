'use client';

import { useState } from 'react';
import type { CoffeeEvent } from '@/lib/types/coffee';
import type { EventFormValues } from '@/lib/data/events';

const fieldClasses =
  'w-full rounded-md border border-ink-200 bg-parchment-100 px-4 py-3 text-sm ' +
  'text-ink-900 placeholder:text-ink-300 focus:border-gold-400';

// Manual add/edit form for /dashboard/admin/events — a new event is saved
// directly as status='active' (see saveEvent in lib/data/events.ts), an
// edit leaves status untouched (moderation actions live on the row itself,
// not in this form).
export function EventForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: CoffeeEvent;
  onSave: (values: EventFormValues) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [link, setLink] = useState(initial?.link ?? '');

  const canSave = title.trim().length > 0 && startDate.length > 0 && endDate.length > 0;

  function handleSubmit() {
    if (!canSave) return;
    onSave({
      title: title.trim(),
      location: location.trim(),
      description: description.trim(),
      startDate,
      endDate: endDate < startDate ? startDate : endDate,
      link: link.trim(),
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div>
        <label htmlFor="event-title" className="block text-xs text-ink-400 mb-1.5">
          Название
        </label>
        <input
          id="event-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="World of Coffee"
          className={fieldClasses}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="event-start" className="block text-xs text-ink-400 mb-1.5">
            Дата начала
          </label>
          <input
            id="event-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className={fieldClasses}
          />
        </div>
        <div>
          <label htmlFor="event-end" className="block text-xs text-ink-400 mb-1.5">
            Дата окончания
          </label>
          <input
            id="event-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={fieldClasses}
          />
        </div>
      </div>

      <div>
        <label htmlFor="event-location" className="block text-xs text-ink-400 mb-1.5">
          Город / площадка
        </label>
        <input
          id="event-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Милан, Fiera Milano"
          className={fieldClasses}
        />
      </div>

      <div>
        <label htmlFor="event-description" className="block text-xs text-ink-400 mb-1.5">
          Описание
        </label>
        <textarea
          id="event-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={fieldClasses}
        />
      </div>

      <div>
        <label htmlFor="event-link" className="block text-xs text-ink-400 mb-1.5">
          Ссылка на регистрацию / подробнее
        </label>
        <input
          id="event-link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://…"
          className={fieldClasses}
        />
      </div>

      <div className="flex gap-3 mt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-md border border-ink-200
                       text-ink-700 font-body font-medium text-sm px-5 py-3 flex-1
                       hover:bg-parchment-300 transition-colors"
          >
            Отмена
          </button>
        )}
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSubmit}
          className="inline-flex items-center justify-center rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-5 py-3 flex-[2]
                     hover:bg-ink-800 transition-colors
                     disabled:opacity-40 disabled:pointer-events-none"
        >
          {initial ? 'Сохранить изменения' : 'Добавить мероприятие'}
        </button>
      </div>
    </div>
  );
}
