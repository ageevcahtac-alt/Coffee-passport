import { getCoffeeShopById } from '@/lib/data/coffeeShops';
import {
  beansCountdown,
  pluralizeDays,
  spendToNextRank,
  type GuestHallCard,
} from '@/lib/types/loyalty';

// За сколько дней до сгорания зёрен показывать таймер предупреждением,
// а не нейтральной подписью.
const BEANS_COUNTDOWN_WARN_DAYS = 14;

export function LoyaltyCardView({ card }: { card: GuestHallCard }) {
  const shop = getCoffeeShopById(card.shopId);
  const rank = card.effectiveRank;
  const rankColor = rank?.colorHex ?? '#8a7a63';
  const next = card.nextRank;
  const remain = spendToNextRank(next, card.spend30d);
  const countdown = beansCountdown(card.beansExpireAt);
  const countdownWarn = Boolean(countdown && !countdown.expired && countdown.days <= BEANS_COUNTDOWN_WARN_DAYS);

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
          {rank ? (
            <p className="font-display text-lg leading-tight" style={{ color: rankColor }}>
              {rank.rankName}
              {card.isOrden && (
                <span className="ml-2 text-xs align-middle rounded-full border border-gold-400 text-gold-500 px-2 py-0.5">
                  🎖 орден
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-ink-500">Пока без ранга</p>
          )}
        </div>
        {rank && rank.beansPercent > 0 && (
          <span
            className="rounded-full border text-xs px-3 py-1.5 shrink-0"
            style={{ borderColor: rankColor, color: rankColor }}
          >
            кэшбэк {rank.beansPercent}%
          </span>
        )}
      </div>

      {card.isOrden ? (
        <p className="mb-4 rounded-md border border-gold-300 bg-parchment-100 px-3 py-2 text-xs text-gold-500">
          Ранг закреплён орденом 🎖 — не скользит по тратам за 30 дней
        </p>
      ) : next ? (
        <div className="mb-4">
          <div className="flex items-baseline justify-between mb-1.5 text-xs">
            <span className="text-ink-500">До статуса «{next.rankName}» осталось</span>
            <span className="data-value text-ink-900">{remain.toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="h-1.5 rounded-full bg-parchment-300">
            <div
              className="h-1.5 rounded-full"
              style={{
                width: `${Math.min(100, (card.spend30d / next.requiredSpend30d) * 100)}%`,
                backgroundColor: rankColor,
              }}
            />
          </div>
          <p className="text-[11px] text-ink-400 mt-1.5">
            Траты за 30 дней: {card.spend30d.toLocaleString('ru-RU')} ₽ из {next.requiredSpend30d.toLocaleString('ru-RU')} ₽
          </p>
        </div>
      ) : rank ? (
        <p className="text-xs text-ink-400 mb-4">Максимальный ранг 🏆</p>
      ) : null}

      <div className="pt-3 border-t border-ink-200 flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-ink-500">Зёрна</span>
          <span className="data-value text-ink-900">
            {card.beansBalance.toLocaleString('ru-RU')}
            {countdown && !countdown.expired && (
              <span className={`block text-[11px] text-right ${countdownWarn ? 'text-gold-600' : 'text-ink-400'}`}>
                {countdownWarn && '⏳ '}сгорят через {countdown.days} {pluralizeDays(countdown.days)}
              </span>
            )}
            {countdown?.expired && <span className="block text-[11px] text-ink-400">зёрна сгорели</span>}
          </span>
        </div>
        {card.card && (
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Карта</span>
            <span className="data-value text-ink-900">{card.card.balance.toLocaleString('ru-RU')} ₽</span>
          </div>
        )}
      </div>
    </div>
  );
}
