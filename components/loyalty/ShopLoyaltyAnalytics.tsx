import type { Consumption } from '@/lib/types/loyalty';

// Журнал чеков кофейни — сверка с кассой Yuma. Платёжной интеграции у модуля
// нет (см. заголовок 0039): этот журнал существует, чтобы менеджер сверял
// «что записала лояльность» с отчётами кассы вручную.
export function ShopLoyaltyAnalytics({ consumptions }: { consumptions: Consumption[] }) {
  if (consumptions.length === 0) {
    return <p className="text-sm text-ink-400">Чеков пока не было.</p>;
  }

  const totalGross = consumptions.reduce((sum, c) => sum + c.grossAmount, 0);
  const totalEarned = consumptions.reduce((sum, c) => sum + c.beansEarned, 0);
  const totalRedeemed = consumptions.reduce((sum, c) => sum + c.beansRedeemed, 0);
  const totalCard = consumptions.reduce((sum, c) => sum + c.cardAmount, 0);
  const totalWelcome = consumptions.reduce((sum, c) => sum + c.welcomeGranted, 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-md border border-ink-200 bg-parchment-200 p-3">
          <p className="text-[11px] text-ink-400 mb-1">Оборот по чекам</p>
          <p className="data-value text-lg text-ink-900">{totalGross.toLocaleString('ru-RU')} ₽</p>
        </div>
        <div className="rounded-md border border-ink-200 bg-parchment-200 p-3">
          <p className="text-[11px] text-ink-400 mb-1">Кэшбэк начислено</p>
          <p className="data-value text-lg text-ink-900">{totalEarned.toLocaleString('ru-RU')} 🫘</p>
        </div>
        <div className="rounded-md border border-ink-200 bg-parchment-200 p-3">
          <p className="text-[11px] text-ink-400 mb-1">Зёрен списано</p>
          <p className="data-value text-lg text-ink-900">{totalRedeemed.toLocaleString('ru-RU')} 🫘</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-ink-400 text-xs text-left">
              <th className="font-normal pb-2 pr-4">Дата</th>
              <th className="font-normal pb-2 pr-4">Чек</th>
              <th className="font-normal pb-2 pr-4">Оплата</th>
              <th className="font-normal pb-2 pr-4">Кэшбэк</th>
              <th className="font-normal pb-2">Зёрна</th>
            </tr>
          </thead>
          <tbody>
            {consumptions.map((c) => (
              <tr key={c.id} className="border-t border-ink-200">
                <td className="py-2.5 pr-4 text-xs text-ink-400">
                  {new Date(c.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                </td>
                <td className="py-2.5 pr-4 data-value text-ink-900">{c.grossAmount.toLocaleString('ru-RU')} ₽</td>
                <td className="py-2.5 pr-4 text-ink-500 text-xs">
                  {[
                    c.cashAmount > 0 ? `${c.cashAmount.toLocaleString('ru-RU')} ₽ нал` : null,
                    c.cardAmount > 0 ? `${c.cardAmount.toLocaleString('ru-RU')} ₽ карта` : null,
                    c.beansRedeemed > 0 ? `${c.beansRedeemed} зёрен` : null,
                  ].filter(Boolean).join(' + ')}
                </td>
                <td className="py-2.5 pr-4 data-value text-moss-700">
                  {c.beansEarned > 0 ? `+${c.beansEarned}` : '—'}
                </td>
                <td className="py-2.5 data-value text-ink-900">
                  {c.welcomeGranted > 0 ? `+${c.welcomeGranted} 👋` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(totalCard > 0 || totalWelcome > 0) && (
        <p className="text-[11px] text-ink-400 mt-3">
          {totalCard > 0 && `С карт оплачено ${totalCard.toLocaleString('ru-RU')} ₽.`}{' '}
          {totalWelcome > 0 && `Приветственных начислено ${totalWelcome.toLocaleString('ru-RU')} зёрен.`}
        </p>
      )}
    </div>
  );
}
