// Loyalty, Ranks & Subscriptions — app-level (camelCase) mirror of
// supabase/migrations/0012_loyalty_module.sql's tables. This module is
// fully Supabase-backed, no localStorage fallback: unlike the rest of this
// app's personal journaling features, a loyalty balance/rank is shared,
// staff-mutated state that must be server-authoritative, not a per-browser
// cache. See lib/data/loyalty.ts for the read/write layer.

export const SUBSCRIPTION_NOMINALS = [1000, 1500, 3000, 5000] as const;

export interface ShopRank {
  id: string;
  shopId: string;
  rankName: string;
  rankOrder: number;
  discountPercent: number; // 0-15
  requiredVisits: number;
  requiredSpend: number;
  retentionDays: number; // 0 = never expires
}

export interface GuestShopStatus {
  id: string;
  guestId: string;
  shopId: string;
  currentRankId: string | null;
  visitsCount: number;
  totalSpent: number;
  lastVisitAt: string | null;
  rankExpiresAt: string | null;
}

export type SubscriptionStatus = 'active' | 'exhausted' | 'expired';

export interface Subscription {
  id: string;
  guestId: string;
  shopId: string;
  initialNominal: number;
  currentBalance: number;
  status: SubscriptionStatus;
  createdAt: string;
}

export type LoyaltyTransactionType = 'sell_subscription' | 'deduct_points';

export interface LoyaltyTransaction {
  id: string;
  guestId: string;
  shopId: string;
  baristaId: string | null;
  subscriptionId: string | null;
  type: LoyaltyTransactionType;
  grossAmount: number;
  discountApplied: number;
  netAmount: number;
  createdAt: string;
}

// One guest-facing card — everything "Мои карты" needs for one shop,
// pre-joined so the UI never has to reach across three tables itself.
export interface LoyaltyCard {
  shopId: string;
  status: GuestShopStatus | null;
  currentRank: ShopRank | null;
  nextRank: ShopRank | null; // null when already at the top tier (or no ladder configured)
  ranks: ShopRank[]; // this shop's full ladder, sorted by rankOrder — for the progress bar
  subscriptions: Subscription[]; // this guest's subscriptions at this shop, newest first
}

// A rank is only "held" while its retention window hasn't lapsed — see
// guest_shop_statuses.rank_expires_at's own comment in the migration for
// why this is a read-time check, not a stored/cron-maintained flag.
export function isRankActive(status: Pick<GuestShopStatus, 'currentRankId' | 'rankExpiresAt'> | null): boolean {
  if (!status || !status.currentRankId) return false;
  if (!status.rankExpiresAt) return true; // retention_days = 0 → never expires
  return new Date(status.rankExpiresAt).getTime() > Date.now();
}
