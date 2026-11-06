import { expect, test } from '@playwright/test';
import { DEMO_LOT_ID, DEMO_LOT_NAME } from './helpers';

// Сценарий (a): гость → паспорт лота. Лот читается из сидов, без входа и без
// сети — сценарий должен быть зелёным в любом окружении.
test('гость видит паспорт лота без чекбокса публикации и без community-карточки', async ({ page }) => {
  await page.goto(`/passport/${DEMO_LOT_ID}?entry=shop`);

  // Лот виден: название, обжарщик и блок происхождения на месте.
  await expect(page.getByRole('heading', { name: DEMO_LOT_NAME })).toBeVisible();
  await expect(page.getByText('XO Coffee').first()).toBeVisible();
  await expect(page.getByText('Происхождение').first()).toBeVisible();

  // Чекбокс публикации (согласие на публикацию дегустации) гостю недоступен —
  // он живёт только во flow дегустации и только для вошедшего пользователя.
  await expect(page.getByText(/Поделиться этой дегустацией/)).toHaveCount(0);

  // Community-карточка скрыта, когда слой сообщества пуст: ни данных, ни заголовка.
  await expect(page.getByText('Как это восприняло сообщество')).toHaveCount(0);

  // Каппинг остаётся доступен с паспорта.
  await expect(page.getByRole('link', { name: 'Пройти каппинг' })).toBeVisible();
});
