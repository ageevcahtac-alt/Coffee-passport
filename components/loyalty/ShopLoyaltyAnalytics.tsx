import type { LoyaltyTransaction } from '@/lib/types/loyalty';

const TYPE_LABELS: Record<LoyaltyTransaction['type'], string> = {
  sell_subscription: 'Продажа абонемента',
  deduct_points: 'Списание по чеку',
};

// Reconciliation log for the shop's own Yuma till reports — this module
// has no payment integration (see the migration's own header note), so
// this table exists purely so a manager can cross-check "what loyalty
// recorded" against "what the till actually rang up".
export function ShopLoyaltyAnalytics({ transactions }: { transactions: LoyaltyTransaction[] }) {
  if (transactions.length === 0) {
    return <p className="text-sm text-ink-400">Операций пока не было.</p>;
  }

  const totalNet = transactions.reduce((sum, tx) => sum + tx.netAmount, 0);
  const totalSold = transactions
    .filter((tx) => tx.type === 'sell_subscription')
    .reduce((sum, tx) => sum + tx.netAmount, 0);
  const totalRedeemed = transactions
    .filter((tx) => tx.type === 'deduct_points')
    .reduce((sum, tx) => sum + tx.netAmount, 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-md border border-ink-200 bg-parchment-200 p-3">
          <p className="text-[11px] text-ink-400 mb-1">Всего движений</p>
          <p className="data-value text-lg text-ink-900">{totalNet.toLocaleString('ru-RU')} ₽</p>
        </div>
        <div className="rounded-md border border-ink-200 bg-parchment-200 p-3">
          <p className="text-[11px] text-ink-400 mb-1">Продано абонементов</p>
          <p className="data-value text-lg text-ink-900">{totalSold.toLocaleString('ru-RU')} ₽</p>
        </div>
        <div className="rounded-md border border-ink-200 bg-parchment-200 p-3">
          <p className="text-[11px] text-ink-400 mb-1">Списано по чекам</p>
          <p className="data-value text-lg text-ink-900">{totalRedeemed.toLocaleString('ru-RU')} ₽</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-ink-400 text-xs text-left">
              <th className="font-normal pb-2 pr-4">Дата</th>
              <th className="font-normal pb-2 pr-4">Тип</th>
              <th className="font-normal pb-2 pr-4">Чек</th>
              <th className="font-normal pb-2 pr-4">Скидка</th>
              <th className="font-normal pb-2">Списано</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <tr key={tx.id} className="border-t border-ink-200">
                <td className="py-2.5 pr-4 text-xs text-ink-400">
                  {new Date(tx.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="py-2.5 pr-4 text-ink-900">{TYPE_LABELS[tx.type]}</td>
                <td className="py-2.5 pr-4 data-value text-ink-900">{tx.grossAmount.toLocaleString('ru-RU')} ₽</td>
                <td className="py-2.5 pr-4 data-value text-ink-500">
                  {tx.discountApplied > 0 ? `−${tx.discountApplied}%` : '—'}
                </td>
                <td className="py-2.5 data-value text-ink-900">{tx.netAmount.toLocaleString('ru-RU')} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
