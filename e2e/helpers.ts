import { expect, test, type Page } from '@playwright/test';

// Тот же демо-лот, что в lib/data/lots.ts (LOT-XO-ETH-001) — без него гостевые
// сценарии не на чем строить: это основной лот демо-QR.
export const DEMO_LOT_ID = 'LOT-XO-ETH-001';
export const DEMO_LOT_NAME = 'Ethiopia Guji';
export const PILOT_SHOP_NAME = 'XO Coffee';

// Форма записи BrewingRecipe (lib/types/coffee.ts) — тем же JSON, что пишет
// brewingRecipesStore в localStorage. Значение задаём полностью, чтобы запись
// не зависела от порядка полей в типе.
export interface BrewingRecipeSeed {
  id: string;
  lotId: string;
  brewingMethodId: string;
  authorType: string;
  authorId: string;
  authorName: string;
  isBenchmark: boolean;
  parentRecipeId: string | null;
  doseG: number;
  yieldG: number;
  measuredTdsPercent: number | null;
  grinderModel: string | null;
  grinderSetting: string | null;
  waterTempC: number;
  waterBrand: string;
  waterTds: string;
  waterCustomMineralization: string;
  bloomTimeSec: number | null;
  preInfusionSec: number | null;
  flowRateGPerSec: number | null;
  totalTimeSec: number;
  equipmentModel: string;
  pressureBar: number | null;
  pressureProfile: string;
  notes: string;
  isPublic: boolean;
  createdAt: string;
}

export function makeRecipe(overrides: Partial<BrewingRecipeSeed> = {}): BrewingRecipeSeed {
  return {
    id: `e2e-recipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lotId: DEMO_LOT_ID,
    brewingMethodId: 'v60',
    authorType: 'enthusiast',
    authorId: 'e2e-author',
    authorName: 'E2E Автор',
    isBenchmark: false,
    parentRecipeId: null,
    doseG: 15,
    yieldG: 250,
    measuredTdsPercent: null,
    grinderModel: 'EK43',
    grinderSetting: '11',
    waterTempC: 93,
    waterBrand: '',
    waterTds: '',
    waterCustomMineralization: '',
    bloomTimeSec: 30,
    preInfusionSec: null,
    flowRateGPerSec: null,
    totalTimeSec: 150,
    equipmentModel: '',
    pressureBar: null,
    pressureProfile: '',
    notes: 'Рецепт, посаженный e2e-сценарием',
    isPublic: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// Ставит рецепт в localStorage ДО загрузки приложения (addInitScript
// отрабатывает раньше любого скрипта страницы) — тот же источник данных,
// что и у приложения, без обхода его кода.
export async function seedRecipes(page: Page, recipes: BrewingRecipeSeed[]): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: 'coffee-passport:brewing-recipes', value: recipes }
  );
}

export async function readLocalStorageJson<T>(page: Page, key: string): Promise<T[]> {
  return page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as unknown[];
    } catch {
      return [];
    }
  }, key) as Promise<T[]>;
}

// Вход тестового энтузиаста через обычную форму /auth/login. Без кредов в
// .env.e2e сценарий пропускается — зовущему обязательно видеть, что именно
// не покрыто (см. отчёт e2e-runner'а).
export async function loginAsEnthusiast(page: Page, nextPath: string): Promise<void> {
  const email = process.env.E2E_ENTHUSIAST_EMAIL;
  const password = process.env.E2E_ENTHUSIAST_PASSWORD;
  if (!email || !password) {
    test.skip(true, 'E2E_ENTHUSIAST_EMAIL/E2E_ENTHUSIAST_PASSWORD не заданы в .env.e2e');
    throw new Error('unreachable: test.skip бросает исключение, строка — для строгих типов');
  }
  await page.goto(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  await page.locator('#enthusiast-email').fill(email);
  await page.locator('#enthusiast-password').fill(password);
  await page.getByRole('button', { name: 'Войти в дневник вкуса' }).click();
  // РегExp без якоря: toHaveURL сопоставляет с абсолютным URL целиком
  // (http://host + path), якорь "^/" ломал бы любой успешный переход.
  await expect(page).toHaveURL(new RegExp(nextPath.replace(/\//g, '\\/')));
}

// Общие шаги слепой дегустации: кофейня → напиток → «Расскажите о чашке».
// Возвращает страницу, стоящую на taste-шаге.
export async function reachTasteStep(page: Page): Promise<void> {
  // Шаг «Где вы пробуете этот кофе?» — поисковый автокомплит кофеен.
  await page.getByPlaceholder('Найти аккредитованную кофейню…').fill(PILOT_SHOP_NAME);
  await page.getByRole('button', { name: new RegExp(PILOT_SHOP_NAME) }).first().click();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();

  // Шаг «Что вы пьёте?» — чёрный кофе, эспрессо.
  await page.getByRole('button', { name: 'Чёрный кофе' }).click();
  await page.getByRole('button', { name: 'Эспрессо', exact: true }).click();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();

  // Шаг «Расскажите о чашке» — слепая оценка.
  await expect(page.getByRole('heading', { name: 'Расскажите о чашке' })).toBeVisible();
}

// Шаг «Работа бариста»: способ + «Не указан» — минимум для сохранения.
export async function fillBaristaStep(page: Page): Promise<void> {
  await page.getByRole('radio', { name: '☕ Эспрессо' }).check();
  await page.getByRole('radio', { name: 'Не указан' }).check();
}
