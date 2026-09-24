'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useStaffSession } from '@/lib/auth/staffSession';
import { getRoasterById } from '@/lib/data/roasters';
import { useStaffApi } from '@/lib/orders/useStaffApi';
import {
  PRODUCTION_STATUS_LABELS,
  SOURCE_FILTERS,
  describeDestination,
  describeSource,
  filterBySource,
  formatWeight,
  productionTone,
  sumUnits,
  type ProductionJob,
  type SourceFilter,
} from '@/lib/orders/roasteryOrders';
import { ApiErrorBlock, formatDateTime, LoadingBlock, StatusPill } from '@/components/orders/OrdersUi';
import { ProductionAction } from '@/components/orders/ProductionAction';

// Production queue of the existing roaster cabinet: what to roast/pack, for
// whom (Internet Store / a coffee shop), how much, where it goes, and the
// next step. The data is XO COFFEE Admin's authoritative production for the
// units mapped to this roaster only (a partner roaster never sees XO jobs).

const ACTIVE: ProductionJob['status'][] = ['queued', 'in_production', 'produced', 'ready_for_shipping'];

export default function RoasterProductionPage() {
  const { roasterId } = useStaffSession();
  const roaster = roasterId ? getRoasterById(roasterId) : undefined;
  const jobs = useStaffApi<ProductionJob[]>('/api/roaster/production');
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [showClosed, setShowClosed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => (jobs.status === 'ready' ? filterBySource(jobs.data, filter) : []), [jobs, filter]);
  const active = filtered.filter((job) => ACTIVE.includes(job.status));
  const closed = filtered.filter((job) => !ACTIVE.includes(job.status));

  async function settled(message: string | null) {
    setNotice(message);
    await jobs.reload();
  }

  return (
    <main className="min-h-dvh px-4 sm:px-6 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto w-full">
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-xs uppercase tracking-widest2 text-ink-400 font-body mb-2">{roaster?.name ?? 'Обжарщик'}</p>
            <h1 className="font-display text-3xl text-ink-900">Производство</h1>
            <Link href="/dashboard/roaster" className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900">
              ← Лоты
            </Link>
          </div>
          <button
            type="button"
            onClick={() => {
              setNotice(null);
              void jobs.reload();
            }}
            disabled={jobs.refreshing}
            className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 disabled:opacity-50 shrink-0 mt-1"
          >
            {jobs.refreshing ? 'Обновляем…' : 'Обновить'}
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="Источник заказа">
          {SOURCE_FILTERS.map((option) => {
            const selected = option.id === filter;
            const count = jobs.status === 'ready' ? filterBySource(jobs.data, option.id).filter((j) => ACTIVE.includes(j.status)).length : null;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setFilter(option.id)}
                className={`rounded-full border px-4 py-2 text-sm font-body transition-colors
                            ${selected ? 'border-gold-400 bg-parchment-50 text-ink-900' : 'border-ink-200 text-ink-500 hover:border-ink-400'}`}
              >
                {option.label}
                {count !== null ? <span className="ml-1.5 data-value text-ink-400">{count}</span> : null}
              </button>
            );
          })}
        </div>

        {notice ? (
          <p role="status" className="rounded-md border border-moss-300 bg-moss-100 px-4 py-3 text-sm text-moss-700 mb-4">
            {notice}
          </p>
        ) : null}

        {jobs.status === 'loading' ? <LoadingBlock label="Загружаем производственные задания…" /> : null}
        {jobs.status === 'error' ? (
          <ApiErrorBlock error={jobs.error} onRetry={jobs.reload} nextPath="/dashboard/roaster/production" />
        ) : null}

        {jobs.status === 'ready' ? (
          <>
            <p className="section-label mb-4">В работе</p>
            {active.length === 0 ? (
              <p className="text-sm text-ink-500 mb-8">
                Нет активных заданий{filter !== 'all' ? ' по этому источнику' : ''}. Новые появятся здесь после
                подтверждения заказа в XO COFFEE.
              </p>
            ) : (
              <ul className="flex flex-col gap-3 mb-8">
                {active.map((job) => (
                  <JobCard key={job.id} job={job} onSettled={settled} />
                ))}
              </ul>
            )}

            {closed.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowClosed((v) => !v)}
                  className="section-label w-full mb-4 text-left"
                  aria-expanded={showClosed}
                >
                  Отгружено и отменено ({closed.length}) {showClosed ? '▴' : '▾'}
                </button>
                {showClosed ? (
                  <ul className="flex flex-col gap-3">
                    {closed.map((job) => (
                      <JobCard key={job.id} job={job} onSettled={settled} />
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function JobCard({ job, onSettled }: { job: ProductionJob; onSettled: (message: string | null) => Promise<void> }) {
  const totals = sumUnits(job.items);
  return (
    <li className="rounded-md border border-ink-200 bg-parchment-50 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div>
          <Link
            href={`/dashboard/roaster/production/${job.id}`}
            className="data-value text-sm text-ink-900 underline underline-offset-2 hover:text-ink-600"
          >
            {job.production_number}
          </Link>
          <p className="text-xs text-ink-400">
            {job.order ? `Заказ ${job.order.number} · ` : ''}
            {formatDateTime(job.order?.accepted_at ?? job.created_at)}
          </p>
        </div>
        <StatusPill label={PRODUCTION_STATUS_LABELS[job.status]} tone={productionTone(job.status)} />
      </div>

      <p className="text-sm text-ink-900 font-medium mb-1">{describeSource(job)}</p>
      <p className="text-xs text-ink-500 mb-3">Куда: {describeDestination(job)}</p>

      <ul className="flex flex-col gap-1 mb-3">
        {job.items.map((item, index) => (
          <li key={`${item.passport_public_id}-${item.weight_grams}-${index}`} className="flex justify-between gap-3 text-sm">
            <span className="text-ink-700 min-w-0">
              {item.product_name} · {formatWeight(item.weight_grams)}
              <span className="ml-2 text-[11px] text-ink-400">{item.passport_public_id ?? '—'}</span>
            </span>
            <span className="data-value text-ink-900 shrink-0">
              × {item.quantity}
              {item.to_produce !== item.quantity ? <span className="text-ink-400"> (обжарить {item.to_produce})</span> : null}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-500">
          К производству: <span className="data-value text-ink-900">{totals.toProduce}</span> · со склада:{' '}
          <span className="data-value text-ink-900">{totals.fromStock}</span>
          {job.produced_units != null ? (
            <>
              {' '}· произведено: <span className="data-value text-ink-900">{job.produced_units}</span>
            </>
          ) : null}
          {job.shipped_units != null ? (
            <>
              {' '}· отгружено: <span className="data-value text-ink-900">{job.shipped_units}</span>
            </>
          ) : null}
        </p>
        <ProductionAction job={job} onSettled={onSettled} />
      </div>
      {job.order?.status === 'cancelled' ? (
        <p className="text-xs text-red-600 mt-2">Заказ отменён XO COFFEE — действия недоступны.</p>
      ) : null}
    </li>
  );
}
