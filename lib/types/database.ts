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

export type ProfileRole = 'enthusiast' | 'barista' | 'cafe_admin' | 'roaster_admin';

export type ProfileRow = {
  id: string;
  role: ProfileRole;
  cafe_id: string | null;
  roaster_id: string | null;
  barista_id: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

// Loosely typed — the one other table the typed server client (see
// lib/supabase/server.ts) queries (app/dashboard/(members)/layout.tsx's
// `.from('roaster_members')`, already `as any`-cast at its one call site).
type UntypedRow = Record<string, unknown>;

type NoRelationships = { Relationships: [] };

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
      roaster_members: { Row: UntypedRow; Insert: UntypedRow; Update: Partial<UntypedRow> } & NoRelationships;
    };
    Views: {
      checkins_roaster_view: { Row: CheckinRoasterViewRow } & NoRelationships;
    };
    Functions: {
      // See supabase/migrations/0008_dev_seed_staff_profile.sql — dev-only,
      // self-targeting (auth.uid()), and only actually promotes one of the
      // three hardcoded pilot demo emails; no arguments.
      dev_seed_staff_profile: { Args: Record<string, never>; Returns: ProfileRow };
    };
  };
};
