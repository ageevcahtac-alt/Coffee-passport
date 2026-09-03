'use client';

import type {
  GuestShopStatusRow,
  LoyaltyTransactionRow,
  ShopRankRow,
  SubscriptionRow,
} from '@/lib/types/database';
import type {
  GuestShopStatus,
  LoyaltyCard,
  LoyaltyTransaction,
  ShopRank,
  Subscription,
} from '@/lib/types/loyalty';
import { getBrowserSupabaseClient } from '@/lib/supabase/browserClient';
import { generateId } from '@/lib/utils/id';

// Loyalty, Ranks & Subscriptions — see supabase/migrations/0012_loyalty_module.sql.
// Fully Supabase-backed (see lib/types/loyalty.ts's own header for why),
// so every function here is a thin, defensively-failing wrapper: a failed
// read returns an empty result rather than throwing (same "offline/RLS
// reject degrades to empty" idiom as fetchAnonymizedCheckins et al.), and
// every write returns { ok, error? } so the caller can show what went
// wrong instead of guessing from a thrown exception.

function rowToRank(row: ShopRankRow): ShopRank {
  return {
    id: row.id,
    shopId: row.shop_id,
    rankName: row.rank_name,
    rankOrder: row.rank_order,
    discountPercent: row.discount_percent,
    requiredVisits: row.required_visits,
    requiredSpend: row.required_spend,
    retentionDays: row.retention_days,
  };
}

function rowToStatus(row: GuestShopStatusRow): GuestShopStatus {
  return {
    id: row.id,
    guestId: row.guest_id,
    shopId: row.shop_id,
    currentRankId: row.current_rank_id,
    visitsCount: row.visits_count,
    totalSpent: row.total_spent,
    lastVisitAt: row.last_visit_at,
    rankExpiresAt: row.rank_expires_at,
  };
}

function rowToSubscription(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    guestId: row.guest_id,
    shopId: row.shop_id,
    initialNominal: row.initial_nominal,
    currentBalance: row.current_balance,
    status: row.status,
    createdAt: row.created_at,
  };
}

function rowToTransaction(row: LoyaltyTransactionRow): LoyaltyTransaction {
  return {
    id: row.id,
    guestId: row.guest_id,
    shopId: row.shop_id,
    baristaId: row.barista_id,
    subscriptionId: row.subscription_id,
    type: row.type,
    grossAmount: row.gross_amount,
    discountApplied: row.discount_applied,
    netAmount: row.net_amount,
    createdAt: row.created_at,
  };
}

// The lowest-order rank the guest hasn't reached yet — the one the
// progress bar counts up toward. Null once they've already hit the top of
// the ladder (or the shop hasn't configured one).
function nextRankAbove(ranks: ShopRank[], status: GuestShopStatus | null): ShopRank | null {
  const visits = status?.visitsCount ?? 0;
  const spend = status?.totalSpent ?? 0;
  const above = ranks
    .filter((rank) => rank.requiredVisits > visits || rank.requiredSpend > spend)
    .sort((a, b) => a.rankOrder - b.rankOrder);
  return above[0] ?? null;
}

// Every shop the guest has a status row and/or a subscription at — "Мои
// карты" renders one LoyaltyCard per entry. A shop with a subscription but
// no status yet (shouldn't normally happen, loyalty_sell_subscription
// doesn't create one) is still included so a sold subscription is never
// silently invisible to its owner.
export async function fetchGuestLoyaltyCards(guestId: string): Promise<LoyaltyCard[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const [statusesRes, subsRes] = await Promise.all([
      supabase.from('guest_shop_statuses').select('*').eq('guest_id', guestId),
      supabase.from('subscriptions').select('*').eq('guest_id', guestId).order('created_at', { ascending: false }),
    ]);

    const statuses = ((statusesRes.data ?? []) as GuestShopStatusRow[]).map(rowToStatus);
    const subscriptions = ((subsRes.data ?? []) as SubscriptionRow[]).map(rowToSubscription);

    const shopIds = new Set<string>([...statuses.map((s) => s.shopId), ...subscriptions.map((s) => s.shopId)]);
    if (shopIds.size === 0) return [];

    const { data: rankRows } = await supabase.from('shop_ranks').select('*').in('shop_id', Array.from(shopIds));
    const ranksByShop = new Map<string, ShopRank[]>();
    for (const row of (rankRows ?? []) as ShopRankRow[]) {
      const rank = rowToRank(row);
      const list = ranksByShop.get(rank.shopId) ?? [];
      list.push(rank);
      ranksByShop.set(rank.shopId, list);
    }
    for (const list of ranksByShop.values()) list.sort((a, b) => a.rankOrder - b.rankOrder);

    return Array.from(shopIds)
      .map((shopId) => {
        const status = statuses.find((s) => s.shopId === shopId) ?? null;
        const ranks = ranksByShop.get(shopId) ?? [];
        const currentRank = status?.currentRankId ? ranks.find((r) => r.id === status.currentRankId) ?? null : null;
        return {
          shopId,
          status,
          currentRank,
          nextRank: nextRankAbove(ranks, status),
          ranks,
          subscriptions: subscriptions.filter((s) => s.shopId === shopId),
        };
      })
      .sort((a, b) => a.shopId.localeCompare(b.shopId));
  } catch {
    return [];
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

// Staff-side guest lookup after a QR scan — relies on the "staff read
// enthusiast display names" policy (0012_loyalty_module.sql), which is
// deliberately not scoped to any one shop: the guest may be a first-time
// visitor here with no guest_shop_statuses row yet.
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

// Batch guest-name lookup for the dashboard's subscriptions/transactions
// tables — same "staff read enthusiast display names" RLS policy as
// fetchGuestProfile, just for many ids in one round trip.
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

export async function fetchShopRanks(shopId: string): Promise<ShopRank[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('shop_ranks')
      .select('*')
      .eq('shop_id', shopId)
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
      rank_name: rank.rankName,
      rank_order: rank.rankOrder,
      discount_percent: rank.discountPercent,
      required_visits: rank.requiredVisits,
      required_spend: rank.requiredSpend,
      retention_days: rank.retentionDays,
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

// Barista's guest-lookup read: this shop's own status + ranks + active
// subscriptions for the scanned guest, in one call.
export async function fetchGuestShopContext(
  guestId: string,
  shopId: string
): Promise<{ status: GuestShopStatus | null; ranks: ShopRank[]; subscriptions: Subscription[] }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const [statusRes, ranksRes, subsRes] = await Promise.all([
      supabase.from('guest_shop_statuses').select('*').eq('guest_id', guestId).eq('shop_id', shopId).maybeSingle(),
      supabase.from('shop_ranks').select('*').eq('shop_id', shopId).order('rank_order', { ascending: true }),
      supabase
        .from('subscriptions')
        .select('*')
        .eq('guest_id', guestId)
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false }),
    ]);
    return {
      status: statusRes.data ? rowToStatus(statusRes.data as GuestShopStatusRow) : null,
      ranks: ((ranksRes.data ?? []) as ShopRankRow[]).map(rowToRank),
      subscriptions: ((subsRes.data ?? []) as SubscriptionRow[]).map(rowToSubscription),
    };
  } catch {
    return { status: null, ranks: [], subscriptions: [] };
  }
}

export async function sellSubscription(
  guestId: string,
  shopId: string,
  nominal: number
): Promise<{ ok: boolean; error?: string; subscription?: Subscription }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('loyalty_sell_subscription', {
      p_guest_id: guestId,
      p_shop_id: shopId,
      p_nominal: nominal,
    });
    if (error || !data) return { ok: false, error: error?.message ?? 'Не удалось продать абонемент.' };
    return { ok: true, subscription: rowToSubscription(data as SubscriptionRow) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

export async function redeemPoints(
  guestId: string,
  shopId: string,
  grossAmount: number,
  subscriptionId: string | null
): Promise<{ ok: boolean; error?: string; status?: GuestShopStatus }> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('loyalty_redeem', {
      p_guest_id: guestId,
      p_shop_id: shopId,
      p_gross_amount: grossAmount,
      p_subscription_id: subscriptionId,
    });
    if (error || !data) return { ok: false, error: error?.message ?? 'Не удалось списать баллы.' };
    return { ok: true, status: rowToStatus(data as GuestShopStatusRow) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Неизвестная ошибка' };
  }
}

// Dashboard's "Активные абонементы" registry — every subscription ever
// sold at this shop, any status.
export async function fetchShopSubscriptions(shopId: string): Promise<Subscription[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return (data as SubscriptionRow[]).map(rowToSubscription);
  } catch {
    return [];
  }
}

// Dashboard's reconciliation log — cross-checked by hand against the
// shop's own Yuma till reports (this module has no payment integration).
export async function fetchShopTransactions(shopId: string, limit = 200): Promise<LoyaltyTransaction[]> {
  try {
    const supabase = getBrowserSupabaseClient();
    const { data, error } = await supabase
      .from('loyalty_transactions')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as LoyaltyTransactionRow[]).map(rowToTransaction);
  } catch {
    return [];
  }
}
