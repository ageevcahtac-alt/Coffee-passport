import type { BrewingMethodId, SensoryEvaluationValues } from './coffee';

// =========================================================
// Coffee Kitchen ("Кофейная кухня", /coffee-kitchen) — the enthusiast's
// fully standalone home lab, evolved from the earlier "My Taste". Two
// independent halves:
//   - KitchenRecipe — brewing parameters, "Мои рецепты" (was HomeRecipe)
//   - UserCustomCoffee + CustomCoffeeCupping — "Мой кофе": a private shelf
//     of coffee the platform's catalog has never heard of (rare microlots
//     bought abroad, a roaster outside this ecosystem, ...), each bag
//     optionally cupped using the exact same sensory engine as the public
//     blind-cupping flow (see SensoryEvaluationValues in lib/types/coffee.ts
//     and components/coffee/TastingForm.tsx).
//
// Data isolation is structural here, not just a convention: every
// provenance field below is a flat string/number/boolean. Nothing in this
// file is or contains a foreign key into the Lot/Roaster/CoffeeShop
// catalog — customCoffeeId on CustomCoffeeCupping only ever points at
// another row in this same isolated store, never at anything public. So
// nothing entered in Coffee Kitchen can leak into public ratings, the map,
// or cross-shop statistics. See lib/data/kitchenRecipesStore.ts,
// lib/data/customCoffeeStore.ts and lib/data/customCoffeeCuppingsStore.ts
// for persistence — all three are localStorage-only, same as the rest of
// this app's personal, no-backend-yet stores.
// =========================================================

export interface KitchenRecipe {
  id: string;
  userId: string;
  title: string; // free label, e.g. "Утренний V60"
  brewingMethod: BrewingMethodId;
  grinderModel: string;
  doseG: number; // закладка кофе
  waterG: number; // объём/вес воды, мл или г
  waterTempC: number;
  waterMineralization: string; // профиль/минерализация воды — PPM или описание состава, free text
  grindSetting: string; // настройка помола — щелчки или микроны, free text
  brewTimeSec: number | null; // время экстракции
  preInfusionSec: number | null; // время предсмачивания
  notes: string; // что меняется во вкусе при подстройке параметров
  isTop: boolean; // флаг «Мой Топ» — быстрый фильтр среди своих заготовок
  isPublic: boolean; // опубликован на /recipes (кнопка «Поделиться с сообществом»)
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp — bumped on every edit
}

// "Мой кофе" — one bag/lot the enthusiast owns, entered entirely by hand
// (no QR, no catalog lookup, no autocomplete against Roaster/CoffeeShop).
// Every provenance field is a plain string on purpose — a rare microlot
// bought at a festival abroad has no id anywhere in this app to reference.
export interface UserCustomCoffee {
  id: string;
  userId: string;
  roasterName: string; // free text — may be a roaster this platform has never heard of
  lotName: string;
  region: string;
  farm: string;
  purchaseLocation: string; // "Страна покупки / Локация", e.g. "Токио, Япония"
  roastDate: string; // optional ISO date, '' if unknown
  variety: string; // optional — botanical varietal
  process: string; // optional — processing method, free text
  altitude: string; // optional, free text e.g. "1900–2100 м"
  photoUrl: string; // optional data URL of the bag/package (see lib/utils/imageFile.ts), '' if none
  notes: string; // optional general notes about the bag itself, not a cupping
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp — bumped on every edit
}

// One cupping pass over a UserCustomCoffee — brewing parameters (same
// shape of fields as KitchenRecipe) plus the reused sensory engine
// (SensoryEvaluationValues, identical to the public blind-cupping flow)
// plus a computed score (see lib/utils/cuppingScore.ts). A coffee can be
// cupped more than once (re-tasting as it rests), so this is its own
// table keyed by customCoffeeId, not fields bolted onto UserCustomCoffee.
export interface CustomCoffeeCupping {
  id: string;
  userId: string;
  customCoffeeId: string; // points only into customCoffeeStore — never a public id
  brewingMethod: BrewingMethodId;
  grinderModel: string;
  doseG: number;
  waterG: number;
  waterTempC: number;
  waterMineralization: string;
  grindSetting: string;
  brewTimeSec: number | null;
  preInfusionSec: number | null;
  sensory: SensoryEvaluationValues;
  cuppingScore: number; // computed 60-100 read, see computeCuppingScore()
  createdAt: string; // ISO timestamp
}
