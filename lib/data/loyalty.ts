'use client';

import type {
  BeansLedgerRow,
  DepositCardLedgerRow,
  DepositCardRow,
  GuestShopStatusRow,
  LoyaltyConsumptionRow,
  ShopRankRow,
} from '@/lib/types/database';
import type {
  BeansEntry,
  Consumption,
  DepositCard,
  DepositCardLedgerEntry,
  GuestHallCard,
  GuestShopStatus,
  LoyaltyHistoryItem,
  ShopRank,
} from '@/lib/types/loyalty';
import { HALL_CIRCUIT, nextRankAbove } from '@/lib/types/loyalty';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { generateId } from '@/lib/utils/id';

// Loyalty stage 1 (контур «Зал») — see supabase/migrations/0039_loyalty_stage1_hall.sql.
// Fully Supabase-backed (see lib/types/loyalty.ts's own header for why),
// so every function here is a thin, defensively-failing wrapper: a failed
// read returns an empty result rather than throwing (same "offline/RLS
// reject degrades to empty" idiom as fetchAnonymizedCheckins et al.), and
// every write returns { ok, error? } so the caller can show what went
// wrong instead of guessing from a thrown exception. Rank percent, beans
// clamps and welcome-bonus rules live ONLY in the RPC bodies — the client
// never recomputes them, it just renders what the server returns.

function rowToRank(row: ShopRankRow): ShopRank {
  return {
    id: row.id,
    shopId: row.shop_id,
    circuit: row.circuit,
    rankName: row.rank_name,
    rankOrder: row.rank_order,
    colorHex: row.color_hex,
    beansPercent: row.beans_percent,
    requiredSpend30d: row.required_spend_30d,
  };
}

function rowToStatus(row: GuestShopStatusRow): GuestShopStatus {
  return {
    id: row.id,
    guestId: row.guest_id,
    shopId: row.shop_id,
    currentRankId: row.current_rank_id,
    ordenRankId: row.orden_rank_id,
    ordenPinned: row.orden_pinned,
    lastPurchaseAt: row.last_purchase_at,
  };
}

function rowToCard(row: DepositCardRow): DepositCard {
  return {
    id: row.id,
    guestId: row.guest_id,
    shopId: row.shop_id,
    balance: row.balance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToBeansEntry(row: BeansLedgerRow): BeansEntry {
  return {
    id: row.id,
    guestId: row.guest_id,
    shopId: row.shop_id,
    delta: row.delta,
    reason: row.reason,
    consumptionId: row.consumption_id,
    createdAt: row.created_at,
  };
}

function rowToConsumption(row: LoyaltyConsumptionRow): Consumption {
  return {
    id: row.id,
    guestId: row.guest_id,
    shopId: row.shop_id,
    baristaId: row.barista_id,
    rankId: row.rank_id,
    grossAmount: row.gross_amount,
    beansRedeemed: row.beans_redeemed,
    cardAmount: row.card_amount,
    cashAmount: row.cash_amount,
    beansEarned: row.beans_earned,
    welcomeGranted: row.welcome_granted,
    createdAt: row.created_at,
  };
}

function rowToCardLedger(row: DepositCardLedgerRow): DepositCardLedgerEntry {
  return {
    id: row.id,
    cardId: row.card_id,
    delta: row.delta,
    reason: row.reason,
    consumptionId: row.consumption_id,
    createdAt: row.created_at,
  };
}

// Профиль гостя для приветствия после скана QR — политика «staff read
// enthusiast display names» из 0012 (deliberately not scoped to a shop).
export async function fetchGuestProfile(
  guestId: string
): Promise<{ id: string; displayName: string | null; email: string | null } | null> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name, email')
      .eq('id', guestId)
      .eq('role', 'enthusiast')
      .maybeSingle();
    if (error || !data) return null;
    return { id: data.id, displayName: data.display_name, email: data.email };
  } catch {
    return null;
  }
}

// Batch guest-name lookup for the dashboard's registries — same "staff read
// enthusiast display names" RLS policy as fetchGuestProfile, for many ids.
export async function fetchGuestDisplayNames(guestIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(guestIds));
  if (uniqueIds.length === 0) return new Map();
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', uniqueIds);
    if (error || !data) return new Map();
    return new Map(data.map((row) => [row.id, row.display_name ?? row.id.slice(0, 8)]));
  } catch {
    return new Map();
  }
}

export async function updateOwnDisplayName(displayName: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Не удалось определить аккаунт.' };
    const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', user.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export async function fetchShopRanks(shopId: string, circuit: string = HALL_CIRCUIT): Promise<ShopRank[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('shop_ranks')
      .select('*')
      .eq('shop_id', shopId)
      .eq('circuit', circuit)
      .order('rank_order', { ascending: true });
    if (error || !data) return [];
    return (data as ShopRankRow[]).map(rowToRank);
  } catch {
    return [];
  }
}

export async function saveShopRank(
  rank: Omit<ShopRank, 'id'> & { id?: string }
): Promise<{ ok: boolean; error?: string; rank?: ShopRank }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const now = new Date().toISOString();
    const fields = {
      shop_id: rank.shopId,
      circuit: rank.circuit,
      rank_name: rank.rankName,
      rank_order: rank.rankOrder,
      color_hex: rank.colorHex,
      beans_percent: rank.beansPercent,
      required_spend_30d: rank.requiredSpend30d,
    };
    // .select().single() on both branches so a freshly-inserted rank comes
    // back with its stored id — without it, the client would hold a rank
    // with an empty id and re-save it as a second insert (a duplicate row)
    // the next time it's edited, instead of an update. created_at is only
    // ever set on insert — an update must never touch it.
    const { data, error } = rank.id
      ? await supabase.from('shop_ranks').update({ ...fields, updated_at: now }).eq('id', rank.id).select().single()
      : await supabase
          .from('shop_ranks')
          .insert({ ...fields, id: generateId(), created_at: now, updated_at: now })
          .select()
          .single();
    if (error || !data) return { ok: false, error: error?.message ?? 'Не удалось сохранить ранг.' };
    return { ok: true, rank: rowToRank(data as ShopRankRow) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export async function deleteShopRank(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { error } = await supabase.from('shop_ranks').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

// Read-time метрики одного гостя в одной кофейне — все три величины
// считает Postgres (loyalty_spend_30d / loyalty_beans_alive /
// loyalty_beans_expire_at / loyalty_effective_rank_id), клиент их не
// пересчитывает: это и есть read-time понижение ранга и сгорание зёрен.
async function fetchGuestMetrics(
  guestId: string,
  shopId: string
): Promise<{ spend30d: number; beansBalance: number; beansExpireAt: string | null; effectiveRankId: string | null }> {
  const empty = { spend30d: 0, beansBalance: 0, beansExpireAt: null, effectiveRankId: null as string | null };
  try {
    const supabase = getBrowserSupabaseClient();
    const [spendRes, beansRes, expireRes, rankRes] = await Promise.all([
      supabase.rpc('loyalty_spend_30d', { p_guest_id: guestId, p_shop_id: shopId }),
      supabase.rpc('loyalty_beans_alive', { p_guest_id: guestId, p_shop_id: shopId }),
      supabase.rpc('loyalty_beans_expire_at', { p_guest_id: guestId, p_shop_id: shopId }),
      supabase.rpc('loyalty_effective_rank_id', { p_guest_id: guestId, p_shop_id: shopId, p_circuit: HALL_CIRCUIT }),
    ]);
    return {
      spend30d: Number(spendRes.data ?? 0),
      beansBalance: Number(beansRes.data ?? 0),
      beansExpireAt: (expireRes.data as string | null) ?? null,
      effectiveRankId: (rankRes.data as string | null) ?? null,
    };
  } catch {
    return empty;
  }
}

// Barista's guest-lookup read after a QR scan: this shop's status + hall
// ladder + card + read-time метрики (effective-ранг, траты 30д, живые зёрна).
export async function fetchGuestShopContext(
  guestId: string,
  shopId: string
): Promise<{
  status: GuestShopStatus | null;
  ranks: ShopRank[];
  card: DepositCard | null;
  effectiveRank: ShopRank | null;
  spend30d: number;
  beansBalance: number;
  beansExpireAt: string | null;
}> {
  const empty = {
    status: null as GuestShopStatus | null,
    ranks: [] as ShopRank[],
    card: null as DepositCard | null,
    effectiveRank: null as ShopRank | null,
    spend30d: 0,
    beansBalance: 0,
    beansExpireAt: null as string | null,
  };
  try {
    const supabase = getBrowserSupabaseClient();
    const [statusRes, cardRes, metrics, ranks] = await Promise.all([
      supabase.from('guest_shop_statuses').select('*').eq('guest_id', guestId).eq('shop_id', shopId).maybeSingle(),
      supabase.from('deposit_cards').select('*').eq('guest_id', guestId).eq('shop_id', shopId).maybeSingle(),
      fetchGuestMetrics(guestId, shopId),
      fetchShopRanks(shopId),
    ]);
    return {
      status: statusRes.data ? rowToStatus(statusRes.data as GuestShopStatusRow) : null,
      ranks,
      card: cardRes.data ? rowToCard(cardRes.data as DepositCardRow) : null,
      effectiveRank: ranks.find((rank) => rank.id === metrics.effectiveRankId) ?? null,
      spend30d: metrics.spend30d,
      beansBalance: metrics.beansBalance,
      beansExpireAt: metrics.beansExpireAt,
    };
  } catch {
    return empty;
  }
}

// Покупка/пополнение карты-депозита. Никакого влияния на ранг и зёрна
// (правило живёт в теле RPC, см. миграцию 0039).
export async function purchaseCard(
  guestId: string,
  shopId: string,
  amount: number
): Promise<{ ok: boolean; error?: string; card?: DepositCard }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('loyalty_purchase_card', {
      p_guest_id: guestId,
      p_shop_id: shopId,
      p_amount: amount,
    });
    if (error || !data) return { ok: false, error: error?.message ?? 'Не удалось продать карту.' };
    const card = (data as { card?: DepositCardRow }).card;
    return { ok: true, card: card ? rowToCard(card) : undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export interface ConsumeResult {
  consumption: Consumption;
  beansBalanceAfter: number;
  beansExpireAt: string | null;
  card: DepositCard | null;
}

// Проведение чека (потребление). Состав оплаты: зёрна (≤ 50% чека и ≤ живого
// баланса — сервер сам clamp'ит к доступному), карта (≤ баланса карты),
// остаток — наличные. Кэшбэк и прогресс ранга — внутри той же транзакции.
export async function consume(
  guestId: string,
  shopId: string,
  grossAmount: number,
  beansRedeem: number,
  cardPay: number
): Promise<{ ok: boolean; error?: string; result?: ConsumeResult }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('loyalty_consume', {
      p_guest_id: guestId,
      p_shop_id: shopId,
      p_gross_amount: grossAmount,
      p_beans_redeem: beansRedeem,
      p_card_pay: cardPay,
    });
    if (error || !data) return { ok: false, error: error?.message ?? 'Не удалось провести чек.' };
    const payload = data as {
      consumption?: LoyaltyConsumptionRow;
      beans_balance_after?: number;
      beans_expire_at?: string | null;
      card?: DepositCardRow | null;
    };
    if (!payload.consumption) return { ok: false, error: 'Пустой ответ сервера.' };
    return {
      ok: true,
      result: {
        consumption: rowToConsumption(payload.consumption),
        beansBalanceAfter: Number(payload.beans_balance_after ?? 0),
        beansExpireAt: payload.beans_expire_at ?? null,
        card: payload.card ? rowToCard(payload.card) : null,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

// Орден: ручное назначение/снятие ранга гостю (только cafe_admin — проверка
// внутри RPC). rankId null — снять орден.
export async function assignOrden(
  guestId: string,
  shopId: string,
  rankId: string | null,
  pinned: boolean
): Promise<{ ok: boolean; error?: string; status?: GuestShopStatus }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('loyalty_assign_orden', {
      p_guest_id: guestId,
      p_shop_id: shopId,
      p_rank_id: rankId,
      p_pinned: pinned,
    });
    if (error || !data) return { ok: false, error: error?.message ?? 'Не удалось назначить орден.' };
    const status = (data as { status?: GuestShopStatusRow }).status;
    return { ok: true, status: status ? rowToStatus(status) : undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

// ЛК гостя: по карточке на каждую кофейню контура «Зал», где есть статус
// и/или карта. Effective-ранг/зёрна/сгорание — read-time из RPC.
export async function fetchGuestHallCards(guestId: string): Promise<GuestHallCard[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const [statusesRes, cardsRes] = await Promise.all([
      supabase.from('guest_shop_statuses').select('*').eq('guest_id', guestId),
      supabase.from('deposit_cards').select('*').eq('guest_id', guestId),
    ]);

    const statuses = ((statusesRes.data ?? []) as GuestShopStatusRow[]).map(rowToStatus);
    const cards = ((cardsRes.data ?? []) as DepositCardRow[]).map(rowToCard);

    const shopIds = Array.from(new Set([...statuses.map((s) => s.shopId), ...cards.map((c) => c.shopId)]));
    if (shopIds.length === 0) return [];

    const { data: rankRows } = await supabase
      .from('shop_ranks')
      .select('*')
      .eq('circuit', HALL_CIRCUIT)
      .in('shop_id', shopIds);
    const ranksByShop = new Map<string, ShopRank[]>();
    for (const row of (rankRows ?? []) as ShopRankRow[]) {
      const rank = rowToRank(row);
      const list = ranksByShop.get(rank.shopId) ?? [];
      list.push(rank);
      ranksByShop.set(rank.shopId, list);
    }
    for (const list of ranksByShop.values()) list.sort((a, b) => a.rankOrder - b.rankOrder);

    return Promise.all(
      shopIds.map(async (shopId) => {
        const status = statuses.find((s) => s.shopId === shopId) ?? null;
        const card = cards.find((c) => c.shopId === shopId) ?? null;
        const ranks = ranksByShop.get(shopId) ?? [];
        const metrics = await fetchGuestMetrics(guestId, shopId);
        const effectiveRank = ranks.find((rank) => rank.id === metrics.effectiveRankId) ?? null;
        const isOrden = Boolean(status?.ordenRankId && status.ordenPinned);
        return {
          shopId,
          status,
          effectiveRank,
          ordenRank: isOrden ? ranks.find((rank) => rank.id === status?.ordenRankId) ?? null : null,
          isOrden,
          ranks,
          nextRank: nextRankAbove(ranks, metrics.spend30d),
          spend30d: metrics.spend30d,
          beansBalance: metrics.beansBalance,
          beansExpireAt: metrics.beansExpireAt,
          card,
        };
      })
    ).then((cardsOut) => cardsOut.sort((a, b) => a.shopId.localeCompare(b.shopId)));
  } catch {
    return [];
  }
}

// История операций гостя для ЛК: чеки + движения зёрен + движения карты,
// склеенные в один список по времени (новые первыми).
export async function fetchGuestHistory(guestId: string, limit = 30): Promise<LoyaltyHistoryItem[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const [consumptionsRes, beansRes, cardsRes, ledgerRes] = await Promise.all([
      supabase.from('loyalty_consumptions').select('*').eq('guest_id', guestId).order('created_at', { ascending: false }).limit(limit),
      supabase.from('beans_ledger').select('*').eq('guest_id', guestId).order('created_at', { ascending: false }).limit(limit),
      supabase.from('deposit_cards').select('*').eq('guest_id', guestId),
      supabase.from('deposit_card_ledger').select('*').order('created_at', { ascending: false }).limit(limit),
    ]);
    const cardShopById = new Map(((cardsRes.data ?? []) as DepositCardRow[]).map((row) => [row.id, row.shop_id]));
    const items: LoyaltyHistoryItem[] = [];
    for (const row of (consumptionsRes.data ?? []) as LoyaltyConsumptionRow[]) {
      const c = rowToConsumption(row);
      items.push({
        id: `consumption-${c.id}`,
        at: c.createdAt,
        kind: 'consumption',
        label: `Чек ${c.grossAmount.toLocaleString('ru-RU')} ₽`,
        detail: [
          c.beansEarned > 0 ? `+${c.beansEarned} зёрен` : null,
          c.beansRedeemed > 0 ? `−${c.beansRedeemed} зёрен` : null,
          c.welcomeGranted > 0 ? `приветственные +${c.welcomeGranted}` : null,
          c.cardAmount > 0 ? `карта ${c.cardAmount.toLocaleString('ru-RU')} ₽` : null,
          c.cashAmount > 0 ? `наличные ${c.cashAmount.toLocaleString('ru-RU')} ₽` : null,
        ].filter(Boolean).join(' · '),
        shopId: c.shopId,
      });
    }
    for (const row of (beansRes.data ?? []) as BeansLedgerRow[]) {
      const entry = rowToBeansEntry(row);
      const label = entry.reason === 'welcome' ? 'Приветственные зёрна' : entry.reason === 'earn' ? 'Кэшбэк зёрнами' : 'Списание зёрен';
      items.push({
        id: `beans-${entry.id}`,
        at: entry.createdAt,
        kind: 'beans',
        label,
        detail: `${entry.delta > 0 ? '+' : ''}${entry.delta} зёрен`,
        shopId: entry.shopId,
      });
    }
    for (const row of (ledgerRes.data ?? []) as DepositCardLedgerRow[]) {
      const entry = rowToCardLedger(row);
      const shopId = cardShopById.get(entry.cardId);
      if (!shopId) continue;
      items.push({
        id: `card-${entry.id}`,
        at: entry.createdAt,
        kind: 'card',
        label: entry.reason === 'topup' ? 'Пополнение карты' : 'Оплата картой',
        detail: `${entry.delta > 0 ? '+' : ''}${entry.delta.toLocaleString('ru-RU')} ₽`,
        shopId,
      });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  } catch {
    return [];
  }
}

// Dashboard's "Карты гостей" registry — every deposit card ever sold at this
// shop (карта одна на гостя — это и есть полный реестр).
export async function fetchShopCards(shopId: string): Promise<DepositCard[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('deposit_cards')
      .select('*')
      .eq('shop_id', shopId)
      .order('updated_at', { ascending: false });
    if (error || !data) return [];
    return (data as DepositCardRow[]).map(rowToCard);
  } catch {
    return [];
  }
}

// Dashboard's журнал чеков — сверка с кассой Yuma (интеграции оплаты нет,
// этот журнал существует, чтобы менеджер сверялся с отчётами кассы вручную).
export async function fetchShopConsumptions(shopId: string, limit = 200): Promise<Consumption[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('loyalty_consumptions')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as LoyaltyConsumptionRow[]).map(rowToConsumption);
  } catch {
    return [];
  }
}
