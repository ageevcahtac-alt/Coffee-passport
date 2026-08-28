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
}

export interface CoffeeShop {
  id: string;
  name: string;
  city: string;
  brandColor: string; // pin color on the Coffee Belt map, e.g. "#00A896"
}

export interface Barista {
  id: string;
  name: string;
  coffeeShopId: string; // '' for shop-agnostic entries like "Не указан"
}

export const BREWING_METHODS = [
  { id: 'espresso', label: 'Эспрессо' },
  { id: 'v60', label: 'V60 / Воронка' },
  { id: 'chemex', label: 'Chemex / Кемекс' },
  { id: 'aeropress', label: 'AeroPress / Аэропресс' },
  { id: 'siphon', label: 'Сифон' },
  { id: 'batch_brew', label: 'Batch Brew / Батч-брю' },
] as const;

export type BrewingMethodId = (typeof BREWING_METHODS)[number]['id'];

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
