// Core domain types for the consumer tasting flow.
//
// Split deliberately mirrors the product model: a Lot describes the coffee
// itself (graded once, by the roaster); a TastingRecord describes one
// person's experience of a cup of that lot, at a specific coffee shop,
// prepared with a specific brewing method. The same lot can have many
// tasting records — never overwrite, always append.

export interface Roaster {
  id: string;
  name: string;
  slug: string;
  color: string; // brand pin color on the Coffee Belt map, e.g. "#D4AF37"
  philosophy: string; // short brand statement, shown on the roaster profile card
  city: string; // production/roastery location
  country: string;
}

export type RoastType = 'filter' | 'espresso' | 'omni' | 'alternative';

export const ROAST_TYPE_LABELS: Record<RoastType, string> = {
  filter: 'Фильтр',
  espresso: 'Эспрессо',
  omni: 'Омни',
  alternative: 'Альтернатива',
};

// The roaster's own cupping read of the lot, 1-5 per axis — distinct from the
// consumer's per-cup sensory tags/rating recorded on a TastingRecord.
export interface RoasterFlavorProfile {
  acidity: number;
  sweetness: number;
  body: number;
  bitterness: number;
}

// Shared axis order/labels for anything comparing two RoasterFlavorProfile-
// shaped readings (roaster reference vs. one guest, or vs. a guest average)
// — see components/coffee/FlavorRadar.tsx and its callers.
export const FLAVOR_AXES: { key: keyof RoasterFlavorProfile; label: string }[] = [
  { key: 'acidity', label: 'Кислотность' },
  { key: 'sweetness', label: 'Сладость' },
  { key: 'body', label: 'Плотность' },
  { key: 'bitterness', label: 'Горечь' },
];

export interface ProducerProfile {
  farmerName: string; // farmer or cooperative name
  farmName: string; // farm / washing station name
  altitude: string; // e.g. "1900–2100 м"
  story: string; // roaster's origin story, in the roaster's own words
}

export interface Lot {
  id: string; // stable public id, e.g. "LOT-XO-ETH-001" — what the QR encodes
  roasterId: string;
  name: string; // "Ethiopia Guji"
  country: string;
  region: string;
  variety: string; // botanical varietal, e.g. "Heirloom", "SL28, SL34" — distinct from `process`
  process: string;
  cropYear: string; // e.g. "2025/2026"
  qGrade: number;
  roastProfile: string; // branded roast name, e.g. "Pure Roast®"
  roastType: RoastType;
  descriptors: string[];
  roasterFlavorProfile: RoasterFlavorProfile;
  producer: ProducerProfile;
  // The roaster's own "still in production" flag — turning it off only
  // means a coffee shop can no longer ADD this lot to its menu (fresh
  // batches aren't orderable any more). It must NOT cascade into hiding the
  // lot from a coffee shop that already stocked it: shelf inventory can
  // outlive the roaster's own catalog entry, and the shop's own
  // is_active_in_cafe toggle (see lib/data/cafeMenuStore.ts) is the only
  // thing that controls guest-facing visibility.
  inRoasterCatalog: boolean;
}

export interface CoffeeShop {
  id: string;
  name: string;
  city: string;
  brandColor: string; // pin color on the Coffee Belt map, e.g. "#00A896"
  // "Профиль на карте" — set by the coffee shop's own dashboard (see
  // app/dashboard/cafe/(hub)/map-profile), read by the public /map module
  // (components/map/*). lat/lng null means the shop hasn't placed its pin
  // yet, so it's simply skipped by the map instead of guessing a location.
  lat: number | null;
  lng: number | null;
  address: string;
  phone: string;
  website: string;
  instagramUrl: string;
  telegramUrl: string;
  vkUrl: string;
  description: string;
  workingHours: string; // free text, e.g. "Пн–Вс 8:00–20:00"
  photos: string[]; // up to 3 photo URLs
}

export interface Barista {
  id: string;
  name: string;
  coffeeShopId: string; // '' for shop-agnostic entries like "Не указан"
  // Personal-preference layer shown on the tasting Success Screen and the
  // guest's saved drink card — see supabase/migrations/0015_barista_profiles.sql
  // and components/barista/BaristaProfileCard.tsx. '' means "not set yet".
  favoriteOrigin: string; // e.g. "Эфиопия"
  favoriteBrewMethod: BrewingMethodId | '';
  avatarUrl: string;
}

export const BREWING_METHODS = [
  { id: 'espresso', label: 'Эспрессо' },
  { id: 'v60', label: 'V60 / Воронка' },
  { id: 'chemex', label: 'Chemex / Кемекс' },
  { id: 'aeropress', label: 'AeroPress / Аэропресс' },
  { id: 'turka', label: 'Турка / Джезва' },
  { id: 'immersion', label: 'Иммерсия (Фрэнч-пресс и др.)' },
  { id: 'siphon', label: 'Сифон' },
  { id: 'batch_brew', label: 'Batch Brew / Батч-брю' },
  { id: 'cupping', label: 'Каппинг' },
  { id: 'custom', label: 'Свой способ' },
] as const;

export type BrewingMethodId = (typeof BREWING_METHODS)[number]['id'];

// Every non-espresso method — what the "Фильтр" macro choice in
// BrewingMethodSelector expands into, 'custom' included as the last entry
// ("Свой способ / кастомный девайс" — see ProRecipeForm/EnthusiastRecipeForm,
// which render a free-text device input only when this is selected).
export const FILTER_BREWING_METHODS = BREWING_METHODS.filter((method) => method.id !== 'espresso');

export const SENSORY_TAGS = [
  { id: 'sweetness', label: 'Сладость' },
  { id: 'acidity', label: 'Кислотность' },
  { id: 'brightness', label: 'Яркость / Сочность' },
  { id: 'body', label: 'Плотность / Тело' },
  { id: 'bitterness', label: 'Горечь (Приятная/Гармоничная)' },
  { id: 'fruitiness', label: 'Фруктовость' },
  { id: 'floral', label: 'Цветочность' },
  { id: 'chocolate', label: 'Шоколадность / Орехи' },
  { id: 'citrus', label: 'Цитрусовые' },
  { id: 'berry', label: 'Ягодность' },
] as const;

export type SensoryTagId = (typeof SENSORY_TAGS)[number]['id'];

// Flavor-wheel style refinements — every category is filled out with 7-10
// tags so none of them expand into an empty plate. Picking any sub-
// descriptor implies its parent tag, so SENSORY_TAGS stays the single
// source of truth for "what did the guest notice" elsewhere (e.g. the
// roaster's "часто отмечают" tally). Only `citrus` is left without a list
// — "Цитрус" already lives under `acidity`'s own sub-descriptors, so a
// second, redundant citrus wheel would just duplicate it.
export const FLAVOR_SUB_DESCRIPTORS: Partial<Record<SensoryTagId, string[]>> = {
  acidity: ['Цитрус', 'Лимон', 'Лайм', 'Зелёное яблоко', 'Апельсин', 'Грейпфрут', 'Вишня', 'Винная/Тартар', 'Малина', 'Ананас'],
  sweetness: ['Карамель', 'Тростниковый сахар', 'Мёд', 'Кленовый сироп', 'Молочный шоколад', 'Изюм', 'Финики', 'Сухофрукты'],
  fruitiness: ['Персик', 'Абрикос', 'Манго', 'Красное яблоко', 'Груша', 'Слива', 'Нектарин', 'Маракуйя', 'Личи', 'Абсолютные тропики'],
  berry: ['Малина', 'Черника', 'Смородина', 'Клубника', 'Ежевика', 'Брусника', 'Клюква', 'Земляника'],
  floral: ['Жасмин', 'Бергамот', 'Роза', 'Цветок кофейного дерева', 'Лаванда', 'Липа', 'Ромашка'],
  chocolate: ['Тёмный шоколад', 'Молочный шоколад', 'Какао-нибсы', 'Фундук', 'Миндаль', 'Грецкий орех', 'Пралине', 'Нуга'],
  body: ['Чайное', 'Шелковистое', 'Бархатистое', 'Округлое', 'Сочное', 'Сиропистое', 'Густое', 'Кремовое'],
  brightness: ['Игристая', 'Взрывная', 'Умеренная', 'Сочная', 'Свежая', 'Мягкая', 'Элегантная'],
  bitterness: ['Грейпфрутовая цедра', 'Тёмный какао', 'Чёрный чай', 'Тонкая горчинка'],
};

export type FlavorSubDescriptors = Partial<Record<SensoryTagId, string[]>>;

export type BodyTexture = 'watery' | 'medium' | 'syrupy';

export const BODY_TEXTURE_OPTIONS: { id: BodyTexture; label: string; shortLabel: string }[] = [
  { id: 'watery', label: 'Водянистое/Чайное', shortLabel: 'Водянистое тело' },
  { id: 'medium', label: 'Среднее/Округлое', shortLabel: 'Округлое тело' },
  { id: 'syrupy', label: 'Плотное/Сиропистое', shortLabel: 'Плотное тело' },
];

export const DEFECT_TAGS = [
  { id: 'astringent', label: 'Сухость/Вяжет' },
  { id: 'grassy', label: 'Травянистость/Недожар' },
  { id: 'burnt', label: 'Гарь/Пережар' },
  { id: 'woody', label: 'Древесный тон' },
  { id: 'over_bitter', label: 'Чрезмерная горечь' },
] as const;

export type DefectId = (typeof DEFECT_TAGS)[number]['id'];

export type StaffRole =
  | 'barista'
  | 'cook'
  | 'confectioner'
  | 'administrator'
  | 'manager'
  | 'staff';

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  barista: 'Бариста',
  cook: 'Повар',
  confectioner: 'Кондитер',
  administrator: 'Администратор',
  manager: 'Управляющий',
  staff: 'Стафф',
};

// A cafe team member. Barista-role members intentionally reuse the ids from
// lib/data/baristas.ts (see lib/data/staff.ts) so guest ratings recorded on
// TastingRecord.baristaId/baristaRating/baristaNote resolve straight to
// their staff card — no separate rating store needed for that role.
export interface StaffMember {
  id: string;
  shopId: string;
  name: string;
  role: StaffRole;
  hireDate: string; // ISO date, e.g. "2023-04-10"
  achievements: string; // merits/achievements, in the manager's own words
  hobbies: string;
  leadershipQualities: string;
  managerNote: string; // short brief for a new manager meeting this person
}

export interface TastingRecord {
  id: string;
  userId: string; // placeholder until this flow is wired to real auth
  lotId: string;
  roasterId: string;
  coffeeShopId: string;
  brewingMethod: BrewingMethodId;
  rating: number; // 1-5, the consumer's personal rating of this cup
  sensoryTags: SensoryTagId[];
  subDescriptors: FlavorSubDescriptors; // flavor-wheel refinements, keyed by parent tag
  bodyTexture: BodyTexture | null;
  defects: DefectId[]; // quality issues flagged in the cup — feeds roaster + cafe analytics
  liked: string;
  disliked: string;
  note: string;
  baristaId: string;
  baristaRating: number; // 1-5, 0 if not rated
  baristaNote: string;
  // The guest's own blind-cupping read of the lot, 1-5 per axis — same shape
  // as RoasterFlavorProfile so the two can be compared directly once the
  // roaster's reference profile unlocks (see TasteComparison).
  guestFlavorProfile: RoasterFlavorProfile;
  createdAt: string; // ISO timestamp
}

// =========================================================
// Roast profiles — roaster-only curve data attached to a Lot, imported from
// roasting software (Cropster/Artisan CSV/JSON exports) or entered by hand.
// See lib/utils/roastImport.ts for the parser and lib/data/roastProfilesStore.ts
// for persistence.
// =========================================================

export interface RoastCurvePoint {
  timeSec: number;
  bt: number | null; // bean temp, °C
  et: number | null; // environment temp, °C
  ror: number | null; // rate of rise, °C/min
}

export type RoastSourceFormat = 'manual' | 'csv' | 'json';

export const ROAST_MACHINE_MODELS = [
  'Diedrich IR-12',
  'Diedrich CR-35',
  'Giesen W6A',
  'Giesen W15A',
  'Loring S15 Falcon',
  'Loring S35 Kestrel',
  'Probat P12',
  'Probat PROBATONE 5',
  'Ambex YM-25',
];

export interface RoastProfile {
  id: string;
  lotId: string;
  roasterId: string;
  machineModel: string;
  chargeTemp: number; // °C
  dropTemp: number; // °C
  firstCrackTimeSec: number | null; // null when the roaster hasn't logged it — DTR then falls back to manual entry
  totalTimeSec: number;
  dtrPercent: number | null; // Development Time Ratio, % — computed from firstCrackTimeSec when available
  agtronNumber: number | null; // roast degree on the Agtron gourmet scale — higher = lighter roast, lower = darker
  curve: RoastCurvePoint[];
  sourceFormat: RoastSourceFormat;
  sourceFileName: string | null;
  notes: string;
  createdAt: string; // ISO timestamp — internal record-keeping only; never shown on the guest-facing roast profile card (no roast dates/batch numbers there, by design)
}

// =========================================================
// Brewing recipes — multi-author, grouped by BrewingMethodId under a Lot.
// Roaster (official benchmark) / Coffee Shop (commercial adaptation) /
// Enthusiast (personal log + community, including "Adapt to My Setup"
// copies — see parentRecipeId) all share this one shape.
// See lib/data/brewingRecipesStore.ts for persistence.
// =========================================================

export type RecipeAuthorType = 'roaster' | 'coffee_shop' | 'barista' | 'enthusiast';

// The fixed brewing-method categories a barista/enthusiast picks from when
// AUTHORING a recipe (components/coffee/RecipeBrewMethodSelector.tsx) —
// deliberately separate from BrewingMethodId/BREWING_METHODS above, which
// stays the guest blind-tasting flow's own method list (includes espresso/
// cupping, has no quota system). Roaster/coffee_shop recipes also keep
// using the full BrewingMethodId set via the original BrewingMethodSelector
// — this list and its quotas (see RECIPE_LIMITS) only ever apply to
// author_type 'barista'/'enthusiast', per supabase/migrations/0016_recipe_quota_limits.sql.
export const STANDARD_BREW_METHOD_CATEGORIES = [
  { id: 'hario_v60', label: 'Hario V60' },
  { id: 'chemex', label: 'Chemex' },
  { id: 'aeropress', label: 'AeroPress' },
  { id: 'kalita_wave', label: 'Kalita Wave' },
  { id: 'batch_brew', label: 'Batch Brew' },
  { id: 'clever_dripper', label: 'Clever Dripper' },
  { id: 'french_press', label: 'French Press' },
  { id: 'syphon', label: 'Сифон (Syphon)' },
  { id: 'cezve_ibrik', label: 'Турка / Джезва (Cezve/Ibrik)' },
  { id: 'cold_brew', label: 'Cold Brew' },
] as const;

export type StandardBrewMethodCategoryId = (typeof STANDARD_BREW_METHOD_CATEGORIES)[number]['id'];

// max_custom_methods / max_drafts_per_method / max_public_interval_per_method
// from the product spec — mirrored by the DB trigger in 0016 (the real
// enforcement) and by lib/utils/recipeLimits.ts (client-side UX only).
export const RECIPE_LIMITS = {
  maxCustomMethods: 5,
  maxDraftsPerMethod: 5,
  publicIntervalDays: 14,
} as const;

// A barista's or enthusiast's own named brewing method, beyond the 10
// standard categories — capped at RECIPE_LIMITS.maxCustomMethods per owner,
// enforced by the trg_enforce_custom_method_limit trigger. Owner-private,
// no approval workflow (unlike CustomDevice below, which promotes into a
// platform-wide preset list — a different axis, "which physical device").
export interface CustomBrewMethod {
  id: string; // 'custom-<generateId()>'
  ownerType: 'barista' | 'enthusiast';
  ownerId: string;
  label: string;
  createdAt: string; // ISO timestamp
}

export const PRO_GRINDER_MODELS = ['Mahlkönig EK43', 'Mahlkönig Peak', 'Ditting KR804', 'Mythos One', 'Compak E10'];
export const HOME_GRINDER_MODELS = ['Comandante C40', 'Timemore C2/C3', '1Zpresso J-Max', 'Baratza Encore/Sette', 'Fellow Ode', 'DF64'];
export const ESPRESSO_MACHINE_MODELS = ['La Marzocco Linea PB', 'Victoria Arduino Eagle One', 'Slayer', 'Nuova Simonelli Aurelia', 'Synesso MVP Hydra'];

export interface BrewingRecipe {
  id: string;
  lotId: string;
  // Widened from BrewingMethodId to plain string: a barista/enthusiast
  // recipe's method is either a StandardBrewMethodCategoryId or a
  // CustomBrewMethod.id ('custom-...'), neither of which is a
  // BrewingMethodId literal. Every read site already does `===`/`.find()`
  // comparisons with a sane fallback (RecipeCard's isEspresso check,
  // lib/utils/extraction.ts's getControlChartBand, MyRecipesShelf's label
  // lookup), so this is safe at runtime for roaster/coffee_shop recipes
  // too (they keep using real BrewingMethodId values, unaffected).
  brewingMethodId: string;
  authorType: RecipeAuthorType;
  authorId: string; // roasterId / coffeeShopId / demo user id, depending on authorType
  authorName: string; // display label
  isBenchmark: boolean; // roaster's official default recipe for this method
  parentRecipeId: string | null; // set when this recipe was copied via "Адаптировать под себя"
  doseG: number;
  yieldG: number; // brew ratio is derived at render time: yieldG / doseG
  measuredTdsPercent: number | null; // TDS% of the BREWED cup (refractometer reading) — distinct from waterTds below, which is the source water's mineral ppm, not the resulting cup's strength. Powers the extraction-yield chart, see lib/utils/extraction.ts.
  grinderModel: string;
  grinderSetting: string; // clicks, dial number, or microns — free text, unit varies by grinder
  waterTempC: number;
  waterBrand: string;
  waterTds: number | null; // ppm
  waterCustomMineralization: string; // e.g. "Ca 60 / Mg 15 ppm, Third Wave Water Classic"
  bloomTimeSec: number | null;
  preInfusionSec: number | null;
  flowRateGPerSec: number | null;
  totalTimeSec: number;
  equipmentModel: string; // espresso machine / brewer model
  pressureBar: number | null; // espresso only
  pressureProfile: string; // free text, e.g. "9 bar flat" or "ramp 6→9 over 10s"
  notes: string; // author notes / expected flavor outcome
  isPublic: boolean; // opt-in consent to list this recipe in Community Brews — always true for roaster/coffee_shop (already public by nature), defaults false for enthusiast unless the consent checkbox is checked
  createdAt: string; // ISO timestamp
}

// "Community Top" ranking threshold — a public recipe needs at least this
// many net votes (👍 minus 👎) to ever qualify for the algorithmic "🔥 Топ
// сообщества" badge. Deliberately NOT a stored field on BrewingRecipe: rank
// is recomputed from live vote counts every render (see
// components/coffee/ExtractionTab.tsx), so there is no manual "Community
// Choice" toggle for a Roaster/Admin to assign — the whole point is to
// remove that subjectivity.
export const COMMUNITY_TOP_MIN_NET_VOTES = 3;
export const COMMUNITY_TOP_SLOTS = 3;

// =========================================================
// Equipment Garage — the enthusiast's saved personal setup, read by
// EnthusiastRecipeForm to auto-fill grinder/machine/water fields based on
// the chosen brewing method. See lib/data/equipmentStore.ts.
// =========================================================

export const FILTER_DEVICE_PRESETS = [
  { id: 'v60', label: 'V60' },
  { id: 'chemex', label: 'Chemex' },
  { id: 'aeropress', label: 'AeroPress' },
  { id: 'kalita_wave', label: 'Kalita Wave' },
  { id: 'batch_brew', label: 'Batch Brew' },
  { id: 'french_press', label: 'French Press' },
  { id: 'clever_dripper', label: 'Clever Dripper' },
] as const;

export type FilterDevicePresetId = (typeof FILTER_DEVICE_PRESETS)[number]['id'];

// Which of the app's three roles this Garage setup belongs to — needed
// once equipmentStore.ts started syncing to Supabase's equipment_garage
// table (owner_kind is part of its unique key and RLS trust tier; see
// supabase/migrations/0005_recipes_equipment_checkins.sql). Every
// EquipmentGarage caller now passes this explicitly rather than it being
// inferred from ownerId's shape.
export type EquipmentOwnerKind = 'enthusiast' | 'roaster' | 'coffee_shop';

export interface EquipmentSetup {
  userId: string;
  ownerKind: EquipmentOwnerKind;
  espressoGrinder: string;
  espressoMachine: string;
  espressoWater: string;
  filterGrinder: string;
  filterWater: string;
  favoriteDeviceIds: string[]; // a FilterDevicePresetId, or a CustomDevice.id
  updatedAt: string; // ISO timestamp
}

// A user-submitted filter device not in FILTER_DEVICE_PRESETS. Starts
// unapproved (visible only in its submitter's own picker) until a
// Roaster/Admin promotes it into the platform-wide preset list — see
// lib/data/customDevicesStore.ts.
export interface CustomDevice {
  id: string;
  label: string;
  description: string; // required — the submission form won't save without it
  submittedByUserId: string;
  submittedByName: string;
  approved: boolean;
  createdAt: string; // ISO timestamp
}

// =========================================================
// Cupping journal — the enthusiast's own digital cupping-table notebook
// (replaces loose paper cupping sheets), independent of the app's own
// Lot/Roaster catalog: a cupping can just as easily happen at a festival
// booth or a roaster's open house, tasting a bean never entered into this
// platform. See lib/data/cuppingsStore.ts for persistence.
// =========================================================

// SCA-style 0-100 cupping score — matches the numbers written on a real
// cupping form, unlike the 1-5 personal `rating` used on TastingRecord.
export const CUPPING_SCORE_MIN = 60;
export const CUPPING_SCORE_MAX = 100;
export const CUPPING_SCORE_DEFAULT = 84;

export interface CuppingRecord {
  id: string;
  userId: string;
  originCountry: string; // country of origin — free text, not tied to lib/data/coffeeBelt.ts
  originRegion: string;
  beanName: string; // lot/bean name as written on the cupping sheet
  roasterName: string; // free text — the roaster who roasted this sample, on or off platform
  cuppingDate: string; // ISO date (yyyy-mm-dd)
  location: string; // where the cupping took place
  acidity: number; // 1-5
  body: number; // 1-5
  brightness: number; // 1-5
  sensoryTags: SensoryTagId[]; // aroma/flavor descriptors — same flavor-wheel picker as TastingRecord
  subDescriptors: FlavorSubDescriptors;
  liked: string; // "что понравилось"
  disliked: string; // "что не понравилось"
  notes: string; // free-form notes beyond liked/disliked
  finalScore: number; // SCA-style 0-100 score
  createdAt: string; // ISO timestamp
}

// =========================================================
// Coffee industry events — festival/expo listings shown alongside the
// coffee-shop map (see app/map/page.tsx) and on /journey. DB-backed (see
// supabase/migrations/0014_events_module.sql), fetched through
// /api/events (public, active+upcoming only) — no local seed data
// anymore. See lib/data/events.ts for the admin-facing CRUD used by
// /dashboard/admin/events.
// =========================================================

export type EventStatus = 'active' | 'archived' | 'pending_review';

export interface CoffeeEvent {
  id: string;
  title: string;
  location: string; // город/площадка, one combined field
  description: string;
  startDate: string; // ISO date
  endDate: string; // ISO date — same as startDate for single-day events
  link: string; // official event page — '' if none
  status: EventStatus;
  source: string; // 'manual' or an aggregator EventSource id
}

// The pure sensory read of one cup — every field TastingForm collects, with
// no catalog/venue linkage of its own (lotId/coffeeShopId/etc. are attached
// by whatever record wraps this: TastingRecord below for the catalog-linked
// blind-cupping flow, or CustomCoffeeCupping in lib/types/kitchen.ts for
// the fully isolated "Мой кофе" evaluation). Reusing this one shape is what
// lets components/coffee/TastingForm.tsx serve both flows unchanged.
export interface SensoryEvaluationValues {
  rating: number;
  guestFlavorProfile: RoasterFlavorProfile;
  bodyTexture: BodyTexture | null;
  sensoryTags: SensoryTagId[];
  subDescriptors: FlavorSubDescriptors;
  defects: DefectId[];
  liked: string;
  disliked: string;
  note: string;
}
