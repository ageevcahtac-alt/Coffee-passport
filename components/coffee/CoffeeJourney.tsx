import Link from 'next/link';
import type { TastingRecord } from '@/lib/types/coffee';
import { TastingRecordCard } from './TastingRecordCard';

export function CoffeeJourney({ records }: { records: TastingRecord[] }) {
  if (records.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-ink-500 text-sm mb-6 max-w-xs mx-auto">
          Здесь появятся кофе, которые вы попробовали. Отсканируйте первый, чтобы начать
          свой путь.
        </p>
        <Link
          href="/scan"
          className="inline-flex items-center justify-center rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-6 py-4
                     hover:bg-ink-800 transition-colors"
        >
          Сканировать кофе
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-md mx-auto w-full">
      {records.map((record) => (
        <TastingRecordCard key={record.id} record={record} />
      ))}
    </div>
  );
}
