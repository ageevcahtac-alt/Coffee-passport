export function RatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Оценка" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} из 5`}
          onClick={() => onChange(star)}
          className="text-3xl leading-none px-0.5"
          style={{ color: star <= value ? 'var(--color-rating)' : 'var(--color-ink-200)' }}
        >
          ★
        </button>
      ))}
    </div>
  );
}
