// Read-only star display — used wherever a saved rating (coffee or barista)
// needs to be shown, as opposed to RatingInput which is the interactive
// picker used while filling out the tasting form.
export function StarRating({ value, label }: { value: number; label?: string }) {
  return (
    <div className="flex items-center gap-1" aria-label={label ?? `Оценка ${value} из 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          style={{ color: star <= value ? 'var(--color-rating)' : 'var(--color-ink-200)' }}
        >
          ★
        </span>
      ))}
    </div>
  );
}
