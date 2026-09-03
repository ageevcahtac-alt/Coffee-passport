'use client';

import { useRef, useState, type ReactNode } from 'react';

export interface ComparePanel {
  id: string;
  label: string;
  content: ReactNode;
}

// Swipeable/tabbed "Профиль обжарщика" ↔ "Моя оценка" (↔ "Сравнить") switcher
// for the enthusiast's lot/tasting detail modals — a horizontal filmstrip
// moved with a CSS transform (no animation library needed; matches this
// app's existing handmade-transition idiom, see reveal-fade/reveal-rise in
// globals.css) so it stays lightweight and themeable with the rest of the
// app's Tailwind tokens.
//
// Direction is deliberately spec'd, not the usual carousel convention:
// swiping/clicking RIGHT advances to the next (rightward) panel, LEFT goes
// back — same as a plain "next/prev" reading order, not the "swipe left to
// see what's next" gesture some carousels use.
const SWIPE_THRESHOLD_PX = 40;

export function ProfileCompareCarousel({ panels }: { panels: ComparePanel[] }) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  function goTo(next: number) {
    setIndex(Math.max(0, Math.min(panels.length - 1, next)));
  }

  function onTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: React.TouchEvent) {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;
    const deltaX = (event.changedTouches[0]?.clientX ?? startX) - startX;
    if (deltaX > SWIPE_THRESHOLD_PX) goTo(index - 1);
    else if (deltaX < -SWIPE_THRESHOLD_PX) goTo(index + 1);
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Профили для сравнения"
        className="flex items-center gap-1 mb-4 rounded-md border border-ink-200 bg-parchment-200 p-1"
      >
        {panels.map((panel, i) => (
          <button
            key={panel.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => goTo(i)}
            className={`flex-1 rounded px-2 py-2 text-xs font-medium transition-colors ${
              i === index ? 'bg-ink-900 text-parchment-100' : 'text-ink-500 hover:text-ink-900'
            }`}
          >
            {panel.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{
            width: `${panels.length * 100}%`,
            transform: `translateX(-${(100 / panels.length) * index}%)`,
          }}
        >
          {panels.map((panel) => (
            <div key={panel.id} style={{ width: `${100 / panels.length}%` }} className="shrink-0 px-0.5">
              {panel.content}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 mt-4">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          disabled={index === 0}
          aria-label="Предыдущий профиль"
          className="text-ink-400 text-lg leading-none px-1 hover:text-ink-900
                     disabled:opacity-30 disabled:pointer-events-none"
        >
          ‹
        </button>
        <div className="flex items-center gap-1.5">
          {panels.map((panel, i) => (
            <button
              key={panel.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Показать: ${panel.label}`}
              aria-current={i === index}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === index ? 'bg-gold-500' : 'bg-ink-200'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo(index + 1)}
          disabled={index === panels.length - 1}
          aria-label="Следующий профиль"
          className="text-ink-400 text-lg leading-none px-1 hover:text-ink-900
                     disabled:opacity-30 disabled:pointer-events-none"
        >
          ›
        </button>
      </div>
    </div>
  );
}
