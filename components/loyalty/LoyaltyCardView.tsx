import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import { isRankActive, type LoyaltyCard } from '@/lib/types/loyalty';

const RETENTION_WARNING_DAYS = 5;

function ProgressBar({ label, current, required }: { label: string; current: number; required: number }) {
  if (required <= 0) return null;
  const percent = Math.max(0, Math.min(100, (current / required) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5 text-xs">
        <span className="text-ink-500">{label}</span>
        <span className="data-value text-ink-900">
          {Math.min(current, required)} / {required}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-parchment-300">
        <div className="h-1.5 rounded-full bg-gold-500" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function LoyaltyCardView({ card }: { card: LoyaltyCard }) {
  const shop = getCoffeeShopById(card.shopId);
  const active = isRankActive(card.status);
  const lapsed = Boolean(card.status?.currentRankId) && !active;

  const daysUntilExpiry = card.status?.rankExpiresAt
    ? Math.ceil((new Date(card.status.rankExpiresAt).getTime() - Date.now()) / 86_400_000)
    : null;
  const showRetentionWarning =
    active && daysUntilExpiry !== null && daysUntilExpiry >= 0 && daysUntilExpiry <= RETENTION_WARNING_DAYS;

  const activeSubscriptions = card.subscriptions.filter((s) => s.status === 'active');

  return (
    <div className="rounded-md border border-ink-200 bg-parchment-100 p-5">
      <div className="flex items-center gap-3 mb-4">
        <span
          className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-parchment-100 font-display text-sm"
          style={{ backgroundColor: shop?.brandColor ?? '#8a7a63' }}
          aria-hidden="true"
        >
          {(shop?.name ?? card.shopId).charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-lg text-ink-900 leading-tight truncate">{shop?.name ?? card.shopId}</h3>
          {shop?.city && <p className="text-xs text-ink-400">{shop.city}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-xs text-ink-400 mb-1">Ваш статус</p>
          {active && card.currentRank ? (
            <p className="font-display text-lg text-gold-500">{card.currentRank.rankName}</p>
          ) : lapsed ? (
            <p className="text-sm text-ink-500">Статус истёк</p>
          ) : (
            <p className="text-sm text-ink-500">Пока без ранга</p>
          )}
        </div>
        {active && card.currentRank && card.currentRank.discountPercent > 0 && (
          <span className="rounded-full border border-gold-400 text-gold-500 text-xs px-3 py-1.5 shrink-0">
            −{card.currentRank.discountPercent}%
          </span>
        )}
      </div>

      {showRetentionWarning && card.currentRank && (
        <p className="text-xs rounded-md border border-gold-400 bg-gold-400/10 text-ink-900 px-3 py-2.5 mb-4">
          ⏳ Загляните в течение {daysUntilExpiry} {pluralizeDays(daysUntilExpiry!)}, чтобы не потерять статус «
          {card.currentRank.rankName}».
        </p>
      )}

      {card.nextRank && (
        <div className="flex flex-col gap-3 mb-4">
          <p className="text-xs text-ink-400">До статуса «{card.nextRank.rankName}»:</p>
          <ProgressBar
            label="Визиты"
            current={card.status?.visitsCount ?? 0}
            required={card.nextRank.requiredVisits}
          />
          <ProgressBar
            label="Сумма покупок, ₽"
            current={card.status?.totalSpent ?? 0}
            required={card.nextRank.requiredSpend}
          />
        </div>
      )}

      {activeSubscriptions.length > 0 && (
        <div className="pt-3 border-t border-ink-200 flex flex-col gap-2">
          {activeSubscriptions.map((sub) => (
            <div key={sub.id} className="flex items-center justify-between text-sm">
              <span className="text-ink-500">Абонемент</span>
              <span className="data-value text-ink-900">
                {sub.currentBalance.toLocaleString('ru-RU')} ₽ из {sub.initialNominal.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function pluralizeDays(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
  return 'дней';
}
