import { expect, test } from '@playwright/test';
import { DEMO_LOT_ID, makeRecipe, seedRecipes } from './helpers';

// Сценарий (d): график экстракции. TDS вне диапазона должен прилипнуть к краю
// графика (clampPointToBand в lib/utils/extraction.ts), а страница — не падать.
// Поверхность — карточка рецепта на паспорте (?preview=1 показывает блок
// «Экстракция» без прохождения дегустации); рецепт посажен через localStorage.
test('TDS вне диапазона прилипает к краю графика, страница не падает', async ({ page }) => {
  await seedRecipes(page, [makeRecipe()]);
  await page.goto(`/passport/${DEMO_LOT_ID}?preview=1`);

  await expect(page.getByText('E2E Автор', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Проверить экстракцию' }).click();

  // Фильтр-диапазон крепости — 0.8–1.6% TDS. 5% далеко выше: точка должна
  // прилипнуть к верхнему краю (cy = PAD_TOP = 16), по горизонтали —
  // к правому краю (EY 83.33% клампится в eyMax=26, cx = 324).
  await page.locator('input[id^="my-tds-"]').fill('5');

  const dot = page.locator('svg[role="img"] circle');
  await expect(dot).toHaveCount(1);
  await expect(dot).toHaveAttribute('cy', '16');
  await expect(dot).toHaveAttribute('cx', '324');

  // EY пересчитан и подписан рядом с полем.
  await expect(page.getByText('EY 83.33%')).toBeVisible();

  // Страница жива: сам график на месте и реагирует на ввод внутри диапазона.
  await page.locator('input[id^="my-tds-"]').fill('1.2');
  await expect(page.getByText('EY 20%')).toBeVisible();
  // 1.2% TDS → EY 20% внутри осей: точка уходит с края (cy > 16).
  const cyInside = await page.locator('svg[role="img"] circle').getAttribute('cy');
  expect(Number(cyInside)).toBeGreaterThan(16);
});
