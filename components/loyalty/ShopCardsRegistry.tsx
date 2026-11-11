import type { DepositCard } from '@/lib/types/loyalty';

// Dashboard's "Карты гостей" registry — карта-депозит одна на гостя, так что
// это полный реестр проданных карт кофейни. guestNames приходит pre-fetched
// (batch lookup), чтобы таблица оставалась чисто презентационной.
export function ShopCardsRegistry({
  cards,
  guestNames,
}: {
  cards: DepositCard[];
  guestNames: Map<string, string>;
}) {
  if (cards.length === 0) {
    return <p className="text-sm text-ink-400">Карты пока не продавались.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-ink-400 text-xs text-left">
            <th className="font-normal pb-2 pr-4">Гость</th>
            <th className="font-normal pb-2 pr-4">Баланс карты</th>
            <th className="font-normal pb-2">Обновлена</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => (
            <tr key={card.id} className="border-t border-ink-200">
              <td className="py-2.5 pr-4 text-ink-900">{guestNames.get(card.guestId) ?? card.guestId.slice(0, 8)}</td>
              <td className="py-2.5 pr-4 data-value text-ink-900">{card.balance.toLocaleString('ru-RU')} ₽</td>
              <td className="py-2.5 text-xs text-ink-400">
                {new Date(card.updatedAt).toLocaleDateString('ru-RU')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
