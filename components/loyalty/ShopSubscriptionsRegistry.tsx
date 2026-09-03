import type { Subscription } from '@/lib/types/loyalty';

const STATUS_LABELS: Record<Subscription['status'], string> = {
  active: 'Активен',
  exhausted: 'Исчерпан',
  expired: 'Истёк',
};

const STATUS_CLASSES: Record<Subscription['status'], string> = {
  active: 'border-moss-500 text-moss-500',
  exhausted: 'border-ink-300 text-ink-500',
  expired: 'border-ink-300 text-ink-400',
};

// Dashboard's "Активные абонементы" registry — every subscription ever
// sold at this shop, any status, newest first (see lib/data/loyalty.ts's
// fetchShopSubscriptions). guestNames comes pre-fetched (batch lookup) so
// this stays a pure presentational table.
export function ShopSubscriptionsRegistry({
  subscriptions,
  guestNames,
}: {
  subscriptions: Subscription[];
  guestNames: Map<string, string>;
}) {
  if (subscriptions.length === 0) {
    return <p className="text-sm text-ink-400">Абонементы пока не продавались.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-ink-400 text-xs text-left">
            <th className="font-normal pb-2 pr-4">Гость</th>
            <th className="font-normal pb-2 pr-4">Номинал</th>
            <th className="font-normal pb-2 pr-4">Остаток</th>
            <th className="font-normal pb-2 pr-4">Статус</th>
            <th className="font-normal pb-2">Продан</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((sub) => (
            <tr key={sub.id} className="border-t border-ink-200">
              <td className="py-2.5 pr-4 text-ink-900">{guestNames.get(sub.guestId) ?? sub.guestId.slice(0, 8)}</td>
              <td className="py-2.5 pr-4 data-value text-ink-900">{sub.initialNominal.toLocaleString('ru-RU')} ₽</td>
              <td className="py-2.5 pr-4 data-value text-ink-900">{sub.currentBalance.toLocaleString('ru-RU')} ₽</td>
              <td className="py-2.5 pr-4">
                <span className={`rounded-full border text-[11px] px-2 py-0.5 ${STATUS_CLASSES[sub.status]}`}>
                  {STATUS_LABELS[sub.status]}
                </span>
              </td>
              <td className="py-2.5 text-xs text-ink-400">{new Date(sub.createdAt).toLocaleDateString('ru-RU')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
