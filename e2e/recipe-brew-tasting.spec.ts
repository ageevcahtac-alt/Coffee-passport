import { expect, test } from '@playwright/test';
import {
  DEMO_LOT_ID,
  fillBaristaStep,
  makeRecipe,
  readLocalStorageJson,
  reachTasteStep,
  seedRecipes,
} from './helpers';

// Сценарий (c): карточка рецепта → «Сварил по этому рецепту» → форма
// дегустации открылась с прокинутым источником, поля «Ваш помол» сохраняются.
// Гостевой сценарий (анонимный id — тоже валидный пользователь для дневника):
// сохранение падает в localStorage, что и проверяем.
test('«Сварил по этому рецепту» открывает форму с «Ваш помол», пара источник → моя кофемолка сохраняется', async ({
  page,
}) => {
  await seedRecipes(page, [makeRecipe()]);
  await page.goto(`/passport/${DEMO_LOT_ID}?preview=1`);

  await expect(page.getByText('E2E Автор', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Сварил по этому рецепту' }).click();

  // Форма дегустации открылась именно этого лота.
  await expect(page).toHaveURL(new RegExp(`/passport/${DEMO_LOT_ID}/taste$`));

  await reachTasteStep(page);

  // Источник прокинут: секция «Ваш помол» видна с помолом рецепта-источника.
  await expect(page.getByText('Ваш помол')).toBeVisible();
  await expect(page.getByText(/Рецепт «EK43 · 11»/)).toBeVisible();

  // Заполняем «Ваш помол» и сохраняем дегустацию целиком. ComboSelect не
  // связывает label с select — на шаге «Расскажите о чашке» ровно один
  // <select> (выбор кофемолки), так что селектор однозначен.
  await page.getByRole('radio', { name: '4 из 5' }).check();
  const grinderSelect = page.locator('select');
  await expect(grinderSelect).toHaveCount(1);
  await grinderSelect.selectOption('Comandante C40');
  await page.locator('#grinder-setting').fill('24 клика');
  await page.getByRole('button', { name: 'Далее — работа бариста' }).click();

  await fillBaristaStep(page);
  await page.getByRole('button', { name: 'Сохранить дегустацию в дневник' }).click();

  // Финал флоу — ритуал «Печать Фермера» (пин на карте Кофейного пояса).
  await expect(page.getByRole('heading', { name: 'Печать Фермера' })).toBeVisible();

  // Пара «источник → моя кофемолка» записана как подтверждение конвертации
  // помола; сами поля помола в записи дегустации не сохраняются (store их
  // отделяет до записи).
  const confirmations = await readLocalStorageJson<Record<string, unknown>>(page, 'coffee-passport:grind-confirmations');
  expect(confirmations).toHaveLength(1);
  expect(confirmations[0]).toMatchObject({
    fromModel: 'EK43',
    fromSetting: '11',
    toModel: 'Comandante C40',
    toSetting: '24 клика',
  });

  const journey = await readLocalStorageJson<Record<string, unknown>>(page, 'coffee-passport:journey');
  expect(journey).toHaveLength(1);
  expect(journey[0]).not.toHaveProperty('grinderModel');
  expect(journey[0]).not.toHaveProperty('grinderSetting');
});

// Контрольная граница: без карточки-источника секции «Ваш помол» нет — поля
// не появляются из ниоткуда.
test('без источника-рецепта секция «Ваш помол» не показывается', async ({ page }) => {
  await page.goto(`/passport/${DEMO_LOT_ID}/taste`);
  await reachTasteStep(page);
  await expect(page.getByText('Ваш помол')).toHaveCount(0);
});
