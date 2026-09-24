'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useStaffApi } from '@/lib/orders/useStaffApi';
import {
  ACTOR_LABELS,
  EVENT_LABELS,
  PRODUCTION_STATUS_LABELS,
  describeDestination,
  describeSource,
  formatWeight,
  productionTone,
  sumUnits,
  type ProductionJob,
} from '@/lib/orders/roasteryOrders';
import { ApiErrorBlock, formatDateTime, LoadingBlock, StatusPill } from '@/components/orders/OrdersUi';
import { ProductionAction } from '@/components/orders/ProductionAction';

// One production job in the roaster cabinet: source (who ordered), items
// with their Canonical Lot, quantities, destination, the next step, and the
// authoritative timeline journaled by XO COFFEE Admin.
export default function ProductionJobPage({ params }: { params: { id: string } }) {
  const job = useStaffApi<ProductionJob>(`/api/roaster/production/${encodeURIComponent(params.id)}`);
  const [notice, setNotice] = useState<string | null>(null);

  async function settled(message: string | null) {
    setNotice(message);
    await job.reload();
  }

  return (
    <main className="min-h-dvh px-4 sm:px-6 py-12 sm:py-16">
      <div className="max-w-3xl mx-auto w-full">
        <Link
          href="/dashboard/roaster/production"
          className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
        >
          ← Производство
        </Link>

        {job.status === 'loading' ? (
          <div className="mt-6">
            <LoadingBlock label="Загружаем задание…" />
          </div>
        ) : null}
        {job.status === 'error' ? (
          <div className="mt-6">
            <ApiErrorBlock error={job.error} onRetry={job.reload} nextPath={`/dashboard/roaster/production/${params.id}`} />
          </div>
        ) : null}

        {job.status === 'ready' ? <JobDetail job={job.data} notice={notice} onSettled={settled} /> : null}
      </div>
    </main>
  );
}

function JobDetail({
  job,
  notice,
  onSettled,
}: {
  job: ProductionJob;
  notice: string | null;
  onSettled: (message: string | null) => Promise<void>;
}) {
  const totals = sumUnits(job.items);
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 mt-4 mb-8">
        <div>
          <h1 className="font-display text-3xl text-ink-900 data-value">{job.production_number}</h1>
          <p className="text-sm text-ink-500 mt-1">
            {describeSource(job)}
            {job.order ? ` · заказ ${job.order.number}` : ''}
          </p>
        </div>
        <StatusPill label={PRODUCTION_STATUS_LABELS[job.status]} tone={productionTone(job.status)} />
      </div>

      {notice ? (
        <p role="status" className="rounded-md border border-moss-300 bg-moss-100 px-4 py-3 text-sm text-moss-700 mb-6">
          {notice}
        </p>
      ) : null}

      <section className="mb-8">
        <ProductionAction job={job} onSettled={onSettled} size="large" />
        {job.order?.status === 'cancelled' ? (
          <p className="text-sm text-red-600 mt-2">Заказ отменён XO COFFEE — действия недоступны.</p>
        ) : null}
      </section>

      <section className="mb-8">
        <p className="section-label mb-4">Что произвести</p>
        <div className="overflow-x-auto rounded-md border border-ink-200 bg-parchment-50">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-400">
                <th className="px-4 py-2 font-normal">Кофе / лот</th>
                <th className="px-4 py-2 font-normal">Фасовка</th>
                <th className="px-4 py-2 font-normal text-right">Заказано</th>
                <th className="px-4 py-2 font-normal text-right">Со склада</th>
                <th className="px-4 py-2 font-normal text-right">Обжарить</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {job.items.map((item, index) => (
                <tr key={`${item.passport_public_id}-${item.weight_grams}-${index}`}>
                  <td className="px-4 py-3">
                    <span className="text-ink-900">{item.product_name}</span>
                    {item.passport_public_id ? (
                      <Link
                        href={`/passport/${encodeURIComponent(item.passport_public_id)}`}
                        className="block text-[11px] text-ink-400 underline underline-offset-2 hover:text-ink-900"
                      >
                        {item.passport_public_id}
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-ink-700">{formatWeight(item.weight_grams)}</td>
                  <td className="px-4 py-3 text-right data-value">{item.quantity}</td>
                  <td className="px-4 py-3 text-right data-value">{item.from_stock}</td>
                  <td className="px-4 py-3 text-right data-value text-ink-900">{item.to_produce}</td>
                </tr>
              ))}
              <tr className="text-ink-500">
                <td className="px-4 py-3" colSpan={2}>
                  Итого
                </td>
                <td className="px-4 py-3 text-right data-value">{totals.quantity}</td>
                <td className="px-4 py-3 text-right data-value">{totals.fromStock}</td>
                <td className="px-4 py-3 text-right data-value text-ink-900">{totals.toProduce}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <p className="section-label mb-4">Для кого и куда</p>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-ink-400">Источник</dt>
            <dd className="text-ink-900">{describeSource(job)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Назначение</dt>
            <dd className="text-ink-900">{describeDestination(job)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Произведено</dt>
            <dd className="data-value text-ink-900">{job.produced_units ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Отгружено</dt>
            <dd className="data-value text-ink-900">{job.shipped_units ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-400">Площадка</dt>
            <dd className="text-ink-900">{job.unit?.name ?? '—'}</dd>
          </div>
          {job.cancellation_reason ? (
            <div>
              <dt className="text-xs text-ink-400">Причина отмены</dt>
              <dd className="text-ink-900">{job.cancellation_reason}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section>
        <p className="section-label mb-4">История (XO COFFEE)</p>
        {job.events && job.events.length > 0 ? (
          <ol className="flex flex-col gap-3 border-l border-ink-200 pl-4">
            {job.events.map((event, index) => (
              <li key={`${event.event_type}-${event.created_at}-${index}`} className="text-sm">
                <p className="text-ink-900">{EVENT_LABELS[event.event_type] ?? event.event_type}</p>
                <p className="text-xs text-ink-400">
                  {formatDateTime(event.created_at)} · {ACTOR_LABELS[event.actor_role] ?? event.actor_role}
                  {typeof event.metadata.produced_units === 'number' ? ` · произведено ${event.metadata.produced_units}` : ''}
                  {typeof event.metadata.shipped_units === 'number' ? ` · отгружено ${event.metadata.shipped_units}` : ''}
                </p>
                {event.reason ? <p className="text-xs text-ink-500">{event.reason}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-ink-500">История пока пуста.</p>
        )}
      </section>
    </>
  );
}
