// Зерно кофе — SVG-иконка рейтинга «зёрнами» (0052). Закрашенное/пустое
// состояние, цвет — токен `rating` из DESIGN.md (тот же акцент, что у
// личной оценки чашки; золото не трогаем — оно у Q-score и CTA).
// Дисплей (BeanRating) и тап-инпут (BeanRatingInput) — одна пара компонентов
// для публичной карточки на /map и кабинета кофейни.

export function BeanIcon({ filled, size = 20 }: { filled: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
      style={{ color: filled ? 'var(--color-rating)' : 'var(--color-ink-200)' }}
    >
      <ellipse
        cx="12"
        cy="12"
        rx="8"
        ry="11"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 3.2 C 9.2 7.8, 14.8 15.2, 12 20.8"
        fill="none"
        stroke={filled ? 'var(--color-parchment-100)' : 'currentColor'}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BeanRating({ value, size = 18 }: { value: number; size?: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Оценка ${filled} из 5`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <BeanIcon key={step} filled={step <= filled} size={size} />
      ))}
    </span>
  );
}

export function BeanRatingInput({ value, onChange }: { value: number; onChange: (score: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Оценка зёрнами" className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((score) => (
        <button
          key={score}
          type="button"
          role="radio"
          aria-checked={value === score}
          aria-label={`${score} из 5 зёрен`}
          onClick={() => onChange(score)}
          className="p-1 rounded-md transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-rating"
        >
          <BeanIcon filled={score <= value} size={30} />
        </button>
      ))}
    </div>
  );
}
