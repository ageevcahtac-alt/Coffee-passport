'use client';

import type { BrewingRecipe } from '@/lib/types/coffee';
import { computeExtraction } from '@/lib/utils/extraction';
import { ExtractionChart, type ExtractionPoint } from '@/components/coffee/ExtractionChart';

// Side-by-side parameter diff between the guest's own recipe and the
// roaster's official benchmark for the same lot + brewing method — the
// "удобное прямое сравнение" called for in ExtractionTab's "Мои рецепты"
// tab. Both recipes are guaranteed same-method by the caller (see
// ExtractionTab), so every row is a fair apples-to-apples comparison.
export function RecipeCompare({ mine, benchmark }: { mine: BrewingRecipe; benchmark: BrewingRecipe }) {
  const myRatio = mine.doseG > 0 ? mine.yieldG / mine.doseG : null;
  const benchmarkRatio = benchmark.doseG > 0 ? benchmark.yieldG / benchmark.doseG : null;

  const benchmarkResult = benchmark.measuredTdsPercent
    ? computeExtraction({ doseG: benchmark.doseG, yieldG: benchmark.yieldG, tdsPercent: benchmark.measuredTdsPercent })
    : null;
  const myResult = mine.measuredTdsPercent
    ? computeExtraction({ doseG: mine.doseG, yieldG: mine.yieldG, tdsPercent: mine.measuredTdsPercent })
    : null;

  const extractionPoints: ExtractionPoint[] = [
    ...(benchmarkResult
      ? [{ label: `${benchmark.authorName}, ${benchmark.measuredTdsPercent}%`, ...benchmarkResult, color: '#B8863B' }]
      : []),
    ...(myResult ? [{ label: `Мой рецепт, ${mine.measuredTdsPercent}%`, ...myResult, color: '#A0522D' }] : []),
  ];

  return (
    <div className="rounded-md border border-dashed border-gold-400/60 bg-gold-50/40 p-4 mt-3">
      <p className="text-xs uppercase tracking-widest2 text-ink-400 mb-3">
        Сравнение с бенчмарком · {benchmark.authorName}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-[11px] text-ink-400 uppercase tracking-widest2">
              <th className="pb-2 pr-3 font-normal">Параметр</th>
              <th className="pb-2 pr-3 font-normal">Обжарщик</th>
              <th className="pb-2 font-normal">Мой</th>
            </tr>
          </thead>
          <tbody>
            <CompareRow label="Доза" a={`${benchmark.doseG} г`} b={`${mine.doseG} г`} />
            <CompareRow label="Выход" a={`${benchmark.yieldG} г`} b={`${mine.yieldG} г`} />
            <CompareRow
              label="Соотношение"
              a={benchmarkRatio ? `1:${benchmarkRatio.toFixed(1)}` : '—'}
              b={myRatio ? `1:${myRatio.toFixed(1)}` : '—'}
            />
            <CompareRow label="Кофемолка" a={benchmark.grinderModel || '—'} b={mine.grinderModel || '—'} />
            <CompareRow label="Помол" a={benchmark.grinderSetting || '—'} b={mine.grinderSetting || '—'} />
            <CompareRow
              label="Вода"
              a={benchmark.waterTempC ? `${benchmark.waterTempC}°C` : '—'}
              b={mine.waterTempC ? `${mine.waterTempC}°C` : '—'}
            />
            <CompareRow
              label="Общее время"
              a={benchmark.totalTimeSec ? `${benchmark.totalTimeSec} сек` : '—'}
              b={mine.totalTimeSec ? `${mine.totalTimeSec} сек` : '—'}
            />
            <CompareRow
              label="TDS чашки"
              a={benchmark.measuredTdsPercent !== null ? `${benchmark.measuredTdsPercent}%` : '—'}
              b={mine.measuredTdsPercent !== null ? `${mine.measuredTdsPercent}%` : '—'}
            />
            <CompareRow
              label="EY (экстракция)"
              a={benchmarkResult ? `${benchmarkResult.extractionYieldPercent}%` : '—'}
              b={myResult ? `${myResult.extractionYieldPercent}%` : '—'}
            />
          </tbody>
        </table>
      </div>

      {extractionPoints.length > 0 && (
        <div className="mt-4">
          <ExtractionChart brewingMethodId={mine.brewingMethodId} points={extractionPoints} />
        </div>
      )}
    </div>
  );
}

function CompareRow({ label, a, b }: { label: string; a: string; b: string }) {
  const differs = a !== '—' && b !== '—' && a !== b;
  return (
    <tr className="border-t border-ink-100">
      <td className="py-2 pr-3 text-ink-400 text-xs">{label}</td>
      <td className="py-2 pr-3 data-value text-ink-900">{a}</td>
      <td className={`py-2 data-value ${differs ? 'text-gold-500 font-medium' : 'text-ink-900'}`}>{b}</td>
    </tr>
  );
}
