'use client';

import Link from 'next/link';
import { useStaffApi } from '@/lib/orders/useStaffApi';
import {
  DESTINATION_TYPE_LABELS,
  formatMoney,
  formatWeight,
  shopOrderStage,
  type ShopOrder,
} from '@/lib/orders/roasteryOrders';
import { ApiErrorBlock, formatDateTime, LoadingBlock, StatusPill } from '@/components/orders/OrdersUi';

// "Заказы в ростерию" tab of the existing cafe cabinet: this shop's own
// orders to XO COFFEE's roastery, with the authoritative status from XO
// COFFEE Admin (order acceptance + production progress). Read-only here —
// a new order is placed from /dashboard/cafe/orders/new.
export default function CafeRoasteryOrdersPage() {
  const orders = useStaffApi<ShopOrder[]>('/api/cafe/roastery-orders');

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-8">
        <p className="section-label flex-1">Заказы в ростерию</p>
        <Link
          href="/dashboard/cafe/orders/new"
          className="inline-flex items-center justify-center rounded-md bg-ink-900
                     text-parchment-100 font-body font-medium text-sm px-5 py-3
                     hover:bg-ink-800 transition-colors shrink-0"
        >
          + Создать заказ
        </Link>
      </div>

      {orders.status === 'loading' ? <LoadingBlock label="Загружаем заказы…" /> : null}
      {orders.status === 'error' ? (
        <ApiErrorBlock error={orders.error} onRetry={orders.reload} nextPath="/dashboard/cafe/orders" />
      ) : null}

      {orders.status === 'ready' && orders.data.length === 0 ? (
        <p className="text-ink-500 text-sm">
          Заказов пока нет. Создайте первый — зерно XO COFFEE обжарят и отгрузят в вашу кофейню.
        </p>
      ) : null}

      {orders.status === 'ready' && orders.data.length > 0 ? (
        <>
          <div className="flex justify-end mb-3">
            <button
              type="button"
              onClick={() => void orders.reload()}
              disabled={orders.refreshing}
              className="text-xs text-ink-500 underline underline-offset-2 hover:text-ink-900 disabled:opacity-50"
            >
              {orders.refreshing ? 'Обновляем…' : 'Обновить статусы'}
            </button>
          </div>
          <ul className="flex flex-col gap-3">
            {orders.data.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}

function OrderCard({ order }: { order: ShopOrder }) {
  const stage = shopOrderStage(order);
  const production = order.production;
  return (
    <li className="rounded-md border border-ink-200 bg-parchment-50 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <p className="data-value text-sm text-ink-900">{order.number}</p>
          <p className="text-xs text-ink-400">{formatDateTime(order.created_at)}</p>
        </div>
        <StatusPill label={stage.label} tone={stage.tone} />
      </div>

      <ul className="flex flex-col gap-1 mb-3">
        {order.items.map((item, index) => (
          <li key={`${item.passport_public_id ?? item.product_name}-${item.weight_grams}-${index}`} className="flex justify-between gap-3 text-sm">
            <span className="text-ink-700 min-w-0">
              {item.product_name} · {formatWeight(item.weight_grams)}
              {item.passport_public_id ? (
                <Link
                  href={`/passport/${encodeURIComponent(item.passport_public_id)}`}
                  className="ml-2 text-[11px] text-ink-400 underline underline-offset-2 hover:text-ink-900"
                >
                  {item.passport_public_id}
                </Link>
              ) : null}
            </span>
            <span className="data-value text-ink-900 shrink-0">× {item.quantity}</span>
          </li>
        ))}
      </ul>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-500">
        <div>
          <dt className="inline">Получение: </dt>
          <dd className="inline text-ink-700">
            {order.destination_type ? DESTINATION_TYPE_LABELS[order.destination_type] : '—'}
            {order.destination_label ? ` · ${order.destination_label}` : ''}
            {order.destination_address ? ` · ${order.destination_address}` : ''}
          </dd>
        </div>
        <div>
          <dt className="inline">Сумма: </dt>
          <dd className="inline data-value text-ink-700">{formatMoney(order.total)}</dd>
        </div>
        {production?.produced_units != null ? (
          <div>
            <dt className="inline">Произведено: </dt>
            <dd className="inline data-value text-ink-700">{production.produced_units} уп.</dd>
          </div>
        ) : null}
        {production?.shipped_units != null ? (
          <div>
            <dt className="inline">Отгружено: </dt>
            <dd className="inline data-value text-ink-700">
              {production.shipped_units} уп. · {formatDateTime(production.shipped_at)}
            </dd>
          </div>
        ) : null}
        {order.cancellation_reason ? (
          <div className="sm:col-span-2">
            <dt className="inline">Причина отмены: </dt>
            <dd className="inline text-ink-700">{order.cancellation_reason}</dd>
          </div>
        ) : null}
      </dl>
    </li>
  );
}
