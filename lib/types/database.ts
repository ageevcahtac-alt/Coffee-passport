// Hand-written against supabase/migrations/0005_recipes_equipment_checkins.sql
// (there's no service-role key configured for this project to run
// `supabase gen types` against — see lib/supabase/adminClient.ts). Only the
// three tables this app's client code actually queries are typed; every
// other live table (coffee_lots, partner_requests, review_replies,
// user_taste_profiles — none of which any store below touches) isn't
// referenced through the typed client at all, so it doesn't need an entry
// here.
//
// Two non-obvious constraints on every Row/Insert/Update/Table shape below,
// both found the hard way against @supabase/supabase-js 2.112.3's actual
// generic machinery (SupabaseClient's own `Schema` type parameter defaults
// to `never` — not `any` — whenever `Database['public']` fails to
// structurally match postgrest-js's internal `GenericSchema`):
//   1. Row/Insert/Update must be `type` aliases, not `interface`s. An
//      `interface` never gets TS's implicit-index-signature treatment when
//      checked against `Record<string, unknown>` in a conditional-type
//      `extends` (interfaces are "open"/declaration-mergeable, so TS won't
//      assume one), which is exactly how postgrest-js validates them — an
//      interface-typed Row silently makes every query builder method for
//      that table (insert/update included) collapse to `never`.
//   2. Every table needs an explicit `Relationships: []`, and the schema
//      needs `Views`/`Functions` (even empty) — GenericTable/GenericSchema
//      require them structurally, and a missing one is the same silent
//      `never`-collapse as (1), not a visible type error at the
//      declaration site.

export type RecipeRow = {
  id: string;
  lot_id: string;
  brewing_method_id: string;
  author_type: 'roaster' | 'coffee_shop' | 'barista' | 'enthusiast';
  author_id: string;
  author_name: string;
  is_benchmark: boolean;
  parent_recipe_id: string | null;
  dose_g: number;
  yield_g: number;
  measured_tds_percent: number | null;
  grinder_model: string;
  grinder_setting: string;
  water_temp_c: number;
  water_brand: string;
  water_tds: number | null;
  water_custom_mineralization: string;
  bloom_time_sec: number | null;
  pre_infusion_sec: number | null;
  flow_rate_g_per_sec: number | null;
  total_time_sec: number;
  equipment_model: string;
  pressure_bar: number | null;
  pressure_profile: string;
  notes: string;
  is_public: boolean;
  owner_user_id: string | null;
  created_at: string;
};
export type RecipeInsert = RecipeRow;

export type EquipmentGarageRow = {
  id: string;
  owner_kind: 'enthusiast' | 'roaster' | 'coffee_shop';
  owner_id: string;
  owner_user_id: string | null;
  espresso_grinder: string;
  espresso_machine: string;
  espresso_water: string;
  filter_grinder: string;
  filter_water: string;
  favorite_device_ids: string[];
  updated_at: string;
};
// Never sent with an id — equipment has no client-visible id concept (see
// EquipmentSetup in lib/types/coffee.ts), the DB default generates one on
// insert and upsert matches on the (owner_kind, owner_id) unique constraint.
export type EquipmentGarageUpsert = Omit<EquipmentGarageRow, 'id'>;

export type CheckinRow = {
  id: string;
  owner_user_id: string;
  lot_id: string;
  roaster_id: string;
  coffee_shop_id: string;
  brewing_method: string;
  rating: number;
  acidity: number;
  sweetness: number;
  body: number;
  bitterness: number;
  body_texture: string | null;
  sensory_tags: string[];
  sub_descriptors: Record<string, string[]>;
  defects: string[];
  liked: string;
  disliked: string;
  note: string;
  barista_id: string;
  barista_rating: number;
  barista_note: string;
  created_at: string;
};
export type CheckinInsert = CheckinRow;

// Anonymous grain/extraction read for a roaster_admin — see
// public.checkins_roaster_view in 0007_staff_profiles_rls.sql. Never
// carries owner_user_id, coffee_shop_id, barista_id, barista_rating or
// barista_note — those columns don't exist on this view at all, not just
// hidden client-side.
export type CheckinRoasterViewRow = {
  id: string;
  lot_id: string;
  roaster_id: string;
  brewing_method: string;
  rating: number;
  acidity: number;
  sweetness: number;
  body: number;
  bitterness: number;
  sensory_tags: string[];
  sub_descriptors: Record<string, string[]>;
  defects: string[];
  liked: string;
  disliked: string;
  note: string;
  created_at: string;
};

export type ProfileRole = 'enthusiast' | 'barista' | 'cafe_admin' | 'roaster_admin' | 'admin';

export type ProfileRow = {
  id: string;
  role: ProfileRole;
  cafe_id: string | null;
  roaster_id: string | null;
  barista_id: string | null;
  display_name: string | null;
  // Mirrored from auth.users on signup (see 0012_loyalty_module.sql) — lets
  // staff-facing queries read a guest's email without joining auth.users
  // directly, which PostgREST can't do.
  email: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformFeedbackType = 'bug' | 'ui' | 'idea';
export type PlatformFeedbackStatus = 'new' | 'in_progress' | 'closed';

export type PlatformFeedbackRow = {
  id: string;
  user_id: string;
  user_role: ProfileRole;
  feedback_type: PlatformFeedbackType;
  message: string;
  status: PlatformFeedbackStatus;
  created_at: string;
};
export type PlatformFeedbackInsert = Pick<PlatformFeedbackRow, 'user_id' | 'user_role' | 'feedback_type' | 'message'>;

// public.checkins_cafe_benchmark_view — see
// supabase/migrations/0010_cafe_lot_benchmark_view.sql. Anonymized
// cross-shop leaderboard: rank 1/2 per lot_id, never coffee_shop_id.
export type CheckinsCafeBenchmarkRow = {
  lot_id: string;
  rank: number;
  avg_rating: number;
  review_count: number;
};

// public.checkin_replies — see supabase/migrations/0011_checkin_replies.sql.
// A coffee-shop/roaster reply to a guest's checkin (components/shared/
// ReviewReplyThread.tsx); checkin_id references public.checkins.id, not
// the unrelated, unused public.reviews table from 0004_taste_profile.sql.
export type CheckinReplyRow = {
  id: string;
  checkin_id: string;
  responder_type: 'coffee_shop' | 'roaster';
  responder_id: string;
  responder_name: string;
  message: string;
  created_at: string;
};
export type CheckinReplyInsert = CheckinReplyRow;

// Loosely typed — the one other table the typed server client (see
// lib/supabase/server.ts) queries (app/dashboard/(members)/layout.tsx's
// `.from('roaster_members')`, already `as any`-cast at its one call site).
type UntypedRow = Record<string, unknown>;

type NoRelationships = { Relationships: [] };

// =========================================================
// Loyalty, Ranks & Subscriptions — see supabase/migrations/0012_loyalty_module.sql.
// shop_id is plain text everywhere here, same as cafe_id/coffee_shop_id
// elsewhere in this file — there is no public.shops table.
// =========================================================

export type ShopRankRow = {
  id: string;
  shop_id: string;
  rank_name: string;
  rank_order: number;
  discount_percent: number;
  required_visits: number;
  required_spend: number;
  retention_days: number;
  created_at: string;
  updated_at: string;
};
export type ShopRankInsert = ShopRankRow;

export type GuestShopStatusRow = {
  id: string;
  guest_id: string;
  shop_id: string;
  current_rank_id: string | null;
  visits_count: number;
  total_spent: number;
  last_visit_at: string | null;
  rank_expires_at: string | null;
  created_at: string;
  updated_at: string;
};
// Never written directly by a client (see loyalty_redeem/
// loyalty_sell_subscription) — Insert/Update mirror Row purely to satisfy
// postgrest-js's GenericTable shape (see this file's own header note);
// nothing in lib/data/loyalty.ts ever calls .insert()/.update() on this table.
export type GuestShopStatusInsert = GuestShopStatusRow;

export type SubscriptionRow = {
  id: string;
  guest_id: string;
  shop_id: string;
  initial_nominal: number;
  current_balance: number;
  status: 'active' | 'exhausted' | 'expired';
  created_at: string;
  updated_at: string;
};
export type SubscriptionInsert = SubscriptionRow;

export type LoyaltyTransactionRow = {
  id: string;
  guest_id: string;
  shop_id: string;
  barista_id: string | null;
  subscription_id: string | null;
  type: 'sell_subscription' | 'deduct_points';
  gross_amount: number;
  discount_applied: number;
  net_amount: number;
  created_at: string;
};
export type LoyaltyTransactionInsert = LoyaltyTransactionRow;

export type Database = {
  public: {
    Tables: {
      recipes: { Row: RecipeRow; Insert: RecipeInsert; Update: Partial<RecipeInsert> } & NoRelationships;
      equipment_garage: {
        Row: EquipmentGarageRow;
        Insert: EquipmentGarageUpsert;
        Update: Partial<EquipmentGarageUpsert>;
      } & NoRelationships;
      checkins: { Row: CheckinRow; Insert: CheckinInsert; Update: Partial<CheckinInsert> } & NoRelationships;
      profiles: { Row: ProfileRow; Insert: Partial<ProfileRow>; Update: Partial<ProfileRow> } & NoRelationships;
      platform_feedback: {
        Row: PlatformFeedbackRow;
        Insert: PlatformFeedbackInsert;
        Update: Partial<PlatformFeedbackRow>;
      } & NoRelationships;
      roaster_members: { Row: UntypedRow; Insert: UntypedRow; Update: Partial<UntypedRow> } & NoRelationships;
      checkin_replies: {
        Row: CheckinReplyRow;
        Insert: CheckinReplyInsert;
        Update: Partial<CheckinReplyInsert>;
      } & NoRelationships;
      shop_ranks: { Row: ShopRankRow; Insert: ShopRankInsert; Update: Partial<ShopRankInsert> } & NoRelationships;
      guest_shop_statuses: {
        Row: GuestShopStatusRow;
        Insert: GuestShopStatusInsert;
        Update: Partial<GuestShopStatusInsert>;
      } & NoRelationships;
      subscriptions: {
        Row: SubscriptionRow;
        Insert: SubscriptionInsert;
        Update: Partial<SubscriptionInsert>;
      } & NoRelationships;
      loyalty_transactions: {
        Row: LoyaltyTransactionRow;
        Insert: LoyaltyTransactionInsert;
        Update: Partial<LoyaltyTransactionInsert>;
      } & NoRelationships;
    };
    Views: {
      checkins_roaster_view: { Row: CheckinRoasterViewRow } & NoRelationships;
      checkins_cafe_benchmark_view: { Row: CheckinsCafeBenchmarkRow } & NoRelationships;
    };
    Functions: {
      // See supabase/migrations/0008_dev_seed_staff_profile.sql — dev-only,
      // self-targeting (auth.uid()), and only actually promotes one of the
      // three hardcoded pilot demo emails; no arguments.
      dev_seed_staff_profile: { Args: Record<string, never>; Returns: ProfileRow };
      // See supabase/migrations/0012_loyalty_module.sql.
      loyalty_rank_for: {
        Args: { p_shop_id: string; p_visits: number; p_spend: number };
        Returns: string | null;
      };
      loyalty_sell_subscription: {
        Args: { p_guest_id: string; p_shop_id: string; p_nominal: number };
        Returns: SubscriptionRow;
      };
      loyalty_redeem: {
        Args: {
          p_guest_id: string;
          p_shop_id: string;
          p_gross_amount: number;
          p_subscription_id?: string | null;
        };
        Returns: GuestShopStatusRow;
      };
    };
  };
};
