import type { LotBenchmark, LotBenchmarkEntry } from '@/lib/data/cafeLotBenchmarks';

// Three real, DB-derived ratings for this lot (see
// lib/data/cafeLotBenchmarks.ts): the two anonymized top-rated shops for
// it across the whole platform, and this cafe's own average — never a
// static/roaster-set number like lot.qGrade above it.
export function LotRatingBenchmarks({ benchmark, loading }: { benchmark: LotBenchmark | undefined; loading: boolean }) {
  if (loading) {
    return <p className="text-xs text-ink-400 mb-4">Загрузка оценок гостей…</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
      <RatingCell label="Топ-локация №1" entry={benchmark?.top1 ?? null} />
      <RatingCell label="Топ-локация №2" entry={benchmark?.top2 ?? null} />
      <RatingCell label="Ваша кофейня" entry={benchmark?.ownShop ?? null} highlight />
    </div>
  );
}

function RatingCell({
  label,
  entry,
  highlight = false,
}: {
  label: string;
  entry: LotBenchmarkEntry | null;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        highlight ? 'border-gold-400 bg-gold-400/10' : 'border-ink-200 bg-parchment-200'
      }`}
    >
      <p className="text-[10px] uppercase tracking-widest2 text-ink-400 mb-1">{label}</p>
      {entry ? (
        <p className="data-value text-base text-ink-900">
          {entry.avgRating.toFixed(1)}
          <span className="text-xs text-ink-400"> / 5</span>
          <span className="text-[11px] text-ink-400 ml-1.5">
            ({entry.reviewCount} {pluralizeReviews(entry.reviewCount)})
          </span>
        </p>
      ) : (
        <p className="text-xs text-ink-400">Нет данных</p>
      )}
    </div>
  );
}

function pluralizeReviews(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'отзыв';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'отзыва';
  return 'отзывов';
}
