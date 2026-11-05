import { expect, test } from '@playwright/test';
import {
  DEMO_LOT_ID,
  fillBaristaStep,
  loginAsEnthusiast,
  readLocalStorageJson,
  reachTasteStep,
} from './helpers';

// Сценарий (b): вошедший энтузиаст → новая дегустация. Чекбокс публикации в
// сообщество есть и по умолчанию выключен; публикация включается только
// явным opt-in. Нужен тестовый аккаунт (E2E_ENTHUSIAST_* в .env.e2e) и живой
// Supabase для входа — без них файл пропускается целиком.

test.beforeEach(async ({ page }) => {
  await loginAsEnthusiast(page, `/passport/${DEMO_LOT_ID}/taste`);
  await reachTasteStep(page);
  await page.getByRole('radio', { name: '4 из 5' }).check();
  await page.getByRole('button', { name: 'Далее — работа бариста' }).click();
});

test('чекбокс публикации есть, по умолчанию выключен; без opt-in дегустация сохраняется непубличной', async ({ page }) => {
  const checkbox = page.getByRole('checkbox', { name: /Поделиться этой дегустацией/ });
  await expect(checkbox).toBeVisible();
  await expect(checkbox).not.toBeChecked();

  await fillBaristaStep(page);
  await page.getByRole('button', { name: 'Сохранить дегустацию в дневник' }).click();
  await expect(page.getByRole('heading', { name: 'Печать Фермера' })).toBeVisible();

  const journey = await readLocalStorageJson<Record<string, unknown>>(page, 'coffee-passport:journey');
  expect(journey).toHaveLength(1);
  expect(journey[0].isPublic).toBe(false);
});

test('opt-in публикует дегустацию (isPublic: true)', async ({ page }) => {
  const checkbox = page.getByRole('checkbox', { name: /Поделиться этой дегустацией/ });
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();

  await fillBaristaStep(page);
  await page.getByRole('button', { name: 'Сохранить дегустацию в дневник' }).click();
  await expect(page.getByRole('heading', { name: 'Печать Фермера' })).toBeVisible();

  const journey = await readLocalStorageJson<Record<string, unknown>>(page, 'coffee-passport:journey');
  expect(journey).toHaveLength(1);
  expect(journey[0].isPublic).toBe(true);
});
