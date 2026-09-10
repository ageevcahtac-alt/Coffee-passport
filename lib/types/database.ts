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

// =========================================================
// Recipe quota limits — see supabase/migrations/0016_recipe_quota_limits.sql.
// =========================================================

export type CustomBrewMethodRow = {
  id: string;
  owner_type: 'barista' | 'enthusiast';
  owner_id: string;
  label: string;
  created_at: string;
};
export type CustomBrewMethodInsert = CustomBrewMethodRow;

// Read-only from the app's point of view — the only writer is the
// enforce_recipe_quotas() trigger (security definer, no direct grant to
// authenticated/anon). Insert/Update are still declared, matching this
// file's own header note on why postgrest-js needs them structurally, but
// nothing in lib/data ever calls .insert()/.update() on this table.
export type RecipePublishEventRow = {
  id: string;
  recipe_id: string;
  author_type: string;
  author_id: string;
  brewing_method_id: string;
  published_at: string;
};
export type RecipePublishEventInsert = RecipePublishEventRow;

export type RecipeRow = {
  id: string;
  lot_id: string;
  // Canonical Lot FK — see supabase/migrations/0024_canonical_lot_fk_columns.sql.
  // Optional at insert (defaults to null), same reasoning as CheckinRow.lot_ref.
  lot_ref?: string | null;
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
  // Canonical Lot FK — see supabase/migrations/0024_canonical_lot_fk_columns.sql.
  // Optional at insert (defaults to null): existing write call sites don't
  // set it yet (Stage 4 Phase 4.4 covers reads only), and historical rows
  // predating this column are null forever, per Stage 4 §32.
  lot_ref?: string | null;
  // The reference_taste_profiles row that was `active` for this lot at the
  // moment this checkin was recorded — captured once, never updated later.
  reference_taste_profile_ref?: string | null;
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
  // Drink selection, picked before the blind taste assessment — see
  // supabase/migrations/0021_drink_evaluation.sql and
  // components/coffee/DrinkTypeSelector.tsx / MilkBaseSelector.tsx.
  // '' means "not specified" (rows recorded before this feature shipped).
  drink_category: string;
  drink_type: string;
  custom_drink_name: string;
  milk_base_type: string | null;
  cow_milk_type: string | null;
  is_lactose_free: boolean;
  fat_content_percent: number | null;
  plant_milk_type: string | null;
  // Adaptive taste axes, additive to acidity/sweetness/body/bitterness above
  // — only ever populated for the branch that produced them.
  milk_balance: number | null;
  coffee_readability: number | null;
  creaminess: number | null;
  aftertaste: number | null;
  // Explicit opt-in consent to list this tasting (anonymously) in Community
  // Tastings — see 0026_checkins_community_sharing.sql. Defaults false,
  // same "never automatic" rule as BrewingRecipe.isPublic.
  is_public: boolean;
  created_at: string;
};
export type CheckinInsert = CheckinRow;

// public.checkins_community_view — see
// supabase/migrations/0026_checkins_community_sharing.sql. Anonymous by
// construction: no owner_user_id, coffee_shop_id, roaster_id, barista_*,
// sub_descriptors, defects, or drink/milk axes — only what's meaningful to
// "how did the community perceive this coffee's taste," for rows the
// guest who saved them explicitly opted into sharing.
export type CheckinCommunityViewRow = {
  id: string;
  lot_id: string;
  brewing_method: string;
  rating: number;
  acidity: number;
  sweetness: number;
  body: number;
  bitterness: number;
  liked: string;
  disliked: string;
  note: string;
  created_at: string;
  // Contextual Taste (COFFEE_PASSPORT_CONTEXTUAL_TASTE_UX.md) — added by
  // 0031_checkins_community_sensory_tags.sql so "как его чувствовали
  // другие" can aggregate real descriptor words, not just the four numeric
  // axes. Same non-identifying category tags already exposed to staff via
  // checkins_roaster_view/checkins_cafe_benchmark_view (0007/0021) — never
  // sub_descriptors, which 0026's own comment deliberately keeps out of
  // this anonymous view. Optional because a Supabase project that hasn't
  // applied 0031 yet still returns valid rows shaped like before.
  sensory_tags?: string[];
};

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
  drink_category: string;
  drink_type: string;
  custom_drink_name: string;
  milk_base_type: string | null;
  cow_milk_type: string | null;
  is_lactose_free: boolean;
  fat_content_percent: number | null;
  plant_milk_type: string | null;
  milk_balance: number | null;
  coffee_readability: number | null;
  creaminess: number | null;
  aftertaste: number | null;
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
// Events — see supabase/migrations/0014_events_module.sql.
// =========================================================

export type EventStatus = 'active' | 'archived' | 'pending_review';

export type EventRow = {
  id: string;
  title: string;
  location: string;
  description: string;
  start_date: string; // ISO date (yyyy-mm-dd)
  end_date: string;
  link: string;
  status: EventStatus;
  source: string;
  created_at: string;
  updated_at: string;
};
export type EventInsert = EventRow;

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

// =========================================================
// Barista profiles — see supabase/migrations/0015_barista_profiles.sql.
// =========================================================

export type BaristaProfileRow = {
  id: string;
  coffee_shop_id: string;
  name: string;
  favorite_origin: string;
  favorite_brew_method: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
};
export type BaristaProfileInsert = BaristaProfileRow;

// =========================================================
// Cafe menu entries — see supabase/migrations/0017_cafe_menu_entries.sql.
// =========================================================

export type LotMenuStatusRow = 'new' | 'active' | 'discontinuing';

export type CafeMenuEntryRow = {
  id: string;
  coffee_shop_id: string;
  lot_id: string;
  // Canonical Lot FK — see supabase/migrations/0024_canonical_lot_fk_columns.sql.
  // Optional at insert (defaults to null), same reasoning as CheckinRow.lot_ref.
  lot_ref?: string | null;
  is_active: boolean;
  status: LotMenuStatusRow;
  status_changed_at: string;
  // Set when status = 'discontinuing' — see
  // supabase/migrations/0018_cafe_menu_scheduled_removal.sql. Null for
  // every other status.
  scheduled_removal_at: string | null;
  created_at: string;
  updated_at: string;
};
export type CafeMenuEntryInsert = CafeMenuEntryRow;

// public.cafe_menu_entries_roaster_status_view — see
// supabase/migrations/0027_cafe_menu_entries_roaster_status_view.sql and
// CANONICAL_LOT_CAFE_MENU_INTEGRITY_DESIGN.md. Every CafeMenuEntryRow
// column, plus two read-only fields derived from the joined Canonical Lot
// (null if the Lot can't be resolved at all — never happens in practice,
// since Lots are never deleted, but the join is a LEFT JOIN so it's
// possible in principle). Never written to; not a Row/Insert/Update
// table entry, a Views entry only.
export type CafeMenuEntryRoasterStatusViewRow = CafeMenuEntryRow & {
  roaster_lot_status: LotStatus | null;
  roaster_in_catalog: boolean | null;
};

// =========================================================
// Shop mute preferences — see supabase/migrations/0019_shop_mute_preferences.sql.
// =========================================================

export type ShopMutePreferenceRow = {
  guest_id: string;
  shop_id: string;
  created_at: string;
};
export type ShopMutePreferenceInsert = ShopMutePreferenceRow;

// =========================================================
// Notification Center — see supabase/migrations/0032_notification_center.sql.
// =========================================================

export type NotificationPreferenceRow = {
  user_id: string;
  notify_new_lots: boolean;
  updated_at: string;
};
export type NotificationPreferenceInsert = NotificationPreferenceRow;

// One row per (user, occurrence) — an occurrence is a specific
// (coffee_shop_id, lot_id, status_changed_at) triple, matching
// lib/utils/shopAnnouncements.ts's "statusChangedAt resets the clock" rule.
// read_at/dismissed_at are independent: dismissing hides it from the
// dashboard preview only, reading marks it seen in the full center — see
// lib/data/lotNotificationReadsStore.ts.
export type LotNotificationReadRow = {
  user_id: string;
  coffee_shop_id: string;
  lot_id: string;
  status_changed_at: string;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};
export type LotNotificationReadInsert = LotNotificationReadRow;

// =========================================================
// Canonical Lot — see supabase/migrations/0022_canonical_lot_core.sql,
// 0023_canonical_lot_profiles.sql. Stage 3 Canonical Lot Architecture /
// Stage 4 implementation. `roasters`/`coffee_shops` here are thin identity
// anchors only (id + slug + name) — not the full localStorage Roaster/
// CoffeeShop profile shape from lib/types/coffee.ts, which is unrelated
// and untouched by this migration.
// =========================================================

export type RoasterOrgRow = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
};
export type RoasterOrgInsert = Omit<RoasterOrgRow, 'id' | 'created_at'>;

export type CoffeeShopOrgRow = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
};
export type CoffeeShopOrgInsert = Omit<CoffeeShopOrgRow, 'id' | 'created_at'>;

export type CoffeeRow = {
  id: string;
  roaster_id: string;
  country: string;
  region: string;
  farm: string;
  producer: string;
  variety: string;
  altitude: string;
  processing: string;
  harvest_year: string;
  created_at: string;
  updated_at: string;
};
export type CoffeeInsert = Omit<CoffeeRow, 'id' | 'created_at' | 'updated_at'>;

export type GreenLotRow = {
  id: string;
  coffee_id: string;
  roaster_id: string;
  purchased_kg: number | null;
  purchase_date: string | null;
  contract_reference: string;
  notes: string;
  created_at: string;
};
export type GreenLotInsert = Omit<GreenLotRow, 'id' | 'created_at'>;

export type LotStatus = 'draft' | 'testing' | 'active' | 'archived';

export type LotRow = {
  id: string;
  public_id: string;
  roaster_id: string;
  green_lot_id: string;
  name: string;
  descriptors: string[];
  q_grade: number | null;
  roast_type: string;
  roast_profile_label: string;
  status: LotStatus;
  in_roaster_catalog: boolean;
  legacy_text_id: string | null;
  created_at: string;
  updated_at: string;
};
export type LotInsert = Omit<LotRow, 'id' | 'created_at' | 'updated_at'>;

export type ReferenceProfileStatusRow = 'draft' | 'active' | 'superseded';

export type ReferenceRoastProfileRow = {
  id: string;
  lot_id: string;
  version: number;
  status: ReferenceProfileStatusRow;
  machine_model: string;
  target_curve: { timeSec: number; bt: number | null; et: number | null; ror: number | null }[];
  agtron_target: number | null;
  notes: string;
  effective_from: string;
  created_at: string;
  created_by: string | null;
};
export type ReferenceRoastProfileInsert = Omit<ReferenceRoastProfileRow, 'id' | 'created_at'>;

export type RoastBatchRow = {
  id: string;
  lot_id: string;
  reference_roast_profile_id: string | null;
  batch_number: string;
  roasted_at: string;
  machine_model: string;
  green_kg: number | null;
  charge_temp: number | null;
  drop_temp: number | null;
  first_crack_time_sec: number | null;
  total_time_sec: number | null;
  dtr_percent: number | null;
  agtron_number: number | null;
  curve: { timeSec: number; bt: number | null; et: number | null; ror: number | null }[];
  notes: string;
  created_by: string | null;
  created_at: string;
};
// roast_batches rows are immutable (enforced by a DB trigger, see 0023) —
// there is deliberately no Update type; nothing may ever call .update() on
// this table.
export type RoastBatchInsert = Omit<RoastBatchRow, 'id' | 'created_at'>;

export type ReferenceTasteProfileRow = {
  id: string;
  lot_id: string;
  version: number;
  status: ReferenceProfileStatusRow;
  acidity: number;
  sweetness: number;
  body: number;
  bitterness: number;
  effective_from: string;
  created_at: string;
  created_by: string | null;
};
export type ReferenceTasteProfileInsert = Omit<ReferenceTasteProfileRow, 'id' | 'created_at'>;

export type Database = {
  public: {
    Tables: {
      recipes: { Row: RecipeRow; Insert: RecipeInsert; Update: Partial<RecipeInsert> } & NoRelationships;
      shop_mute_preferences: {
        Row: ShopMutePreferenceRow;
        Insert: ShopMutePreferenceInsert;
        Update: Partial<ShopMutePreferenceInsert>;
      } & NoRelationships;
      notification_preferences: {
        Row: NotificationPreferenceRow;
        Insert: NotificationPreferenceInsert;
        Update: Partial<NotificationPreferenceInsert>;
      } & NoRelationships;
      lot_notification_reads: {
        Row: LotNotificationReadRow;
        Insert: LotNotificationReadInsert;
        Update: Partial<LotNotificationReadInsert>;
      } & NoRelationships;
      cafe_menu_entries: {
        Row: CafeMenuEntryRow;
        Insert: CafeMenuEntryInsert;
        Update: Partial<CafeMenuEntryInsert>;
      } & NoRelationships;
      custom_brew_methods: {
        Row: CustomBrewMethodRow;
        Insert: CustomBrewMethodInsert;
        Update: Partial<CustomBrewMethodInsert>;
      } & NoRelationships;
      recipe_publish_events: {
        Row: RecipePublishEventRow;
        Insert: RecipePublishEventInsert;
        Update: Partial<RecipePublishEventInsert>;
      } & NoRelationships;
      barista_profiles: {
        Row: BaristaProfileRow;
        Insert: BaristaProfileInsert;
        Update: Partial<BaristaProfileInsert>;
      } & NoRelationships;
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
      events: { Row: EventRow; Insert: EventInsert; Update: Partial<EventInsert> } & NoRelationships;
      roasters: { Row: RoasterOrgRow; Insert: RoasterOrgInsert; Update: Partial<RoasterOrgInsert> } & NoRelationships;
      coffee_shops: {
        Row: CoffeeShopOrgRow;
        Insert: CoffeeShopOrgInsert;
        Update: Partial<CoffeeShopOrgInsert>;
      } & NoRelationships;
      coffees: { Row: CoffeeRow; Insert: CoffeeInsert; Update: Partial<CoffeeInsert> } & NoRelationships;
      green_lots: { Row: GreenLotRow; Insert: GreenLotInsert; Update: Partial<GreenLotInsert> } & NoRelationships;
      lots: { Row: LotRow; Insert: LotInsert; Update: Partial<LotInsert> } & NoRelationships;
      reference_roast_profiles: {
        Row: ReferenceRoastProfileRow;
        Insert: ReferenceRoastProfileInsert;
        Update: Partial<ReferenceRoastProfileInsert>;
      } & NoRelationships;
      roast_batches: { Row: RoastBatchRow; Insert: RoastBatchInsert; Update: never } & NoRelationships;
      reference_taste_profiles: {
        Row: ReferenceTasteProfileRow;
        Insert: ReferenceTasteProfileInsert;
        Update: Partial<ReferenceTasteProfileInsert>;
      } & NoRelationships;
    };
    Views: {
      checkins_roaster_view: { Row: CheckinRoasterViewRow } & NoRelationships;
      checkins_cafe_benchmark_view: { Row: CheckinsCafeBenchmarkRow } & NoRelationships;
      checkins_community_view: { Row: CheckinCommunityViewRow } & NoRelationships;
      cafe_menu_entries_roaster_status_view: { Row: CafeMenuEntryRoasterStatusViewRow } & NoRelationships;
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
      // See supabase/migrations/0018_cafe_menu_scheduled_removal.sql.
      cafe_menu_expire_discontinuing: { Args: Record<string, never>; Returns: number };
      // See supabase/migrations/0014_events_module.sql.
      events_archive_expired: { Args: Record<string, never>; Returns: number };
      events_ingest_candidate: {
        Args: {
          p_title: string;
          p_location: string;
          p_description: string;
          p_start_date: string;
          p_end_date: string;
          p_link: string;
          p_source: string;
        };
        Returns: boolean;
      };
    };
  };
};
