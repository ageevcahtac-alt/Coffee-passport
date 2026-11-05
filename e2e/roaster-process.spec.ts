import { expect, test } from '@playwright/test';
import { DEMO_LOT_ID } from './helpers';

// Сценарий (e): кабинет ростерии → заполнение «Процесс и происхождение» →
// блок «Процесс» виден гостю на паспорте лота с дисклеймером.
//
// Зависит от окружения сильнее остальных: нужны пилотные кабинеты
// (NEXT_PUBLIC_PILOT_DEMO_ENABLED) и живой Supabase для входа пилотного
// обжарщика. Кроме того, сама секция «Процесс и происхождение» появится в
// LotBuilderForm только после влития PR #105 (ветка feat/process-passport) —
// на ветках без неё сценарий честно пропускается с причиной, а начинает
// работать как только фича попадает в base.

test('кабинет ростерии → «Процесс и происхождение» → блок «Процесс» с дисклеймером виден гостю', async ({ page }) => {
  await page.goto('/');

  // Вход через пилотный переключатель ролей (DevRoleSwitcher): форма с
  // hidden input[name="role"] есть только в нём — на главной есть ещё кнопка
  // «Обжарщик» из «Стать партнёром», которая открывает лид-форму, а не
  // кабинет, поэтому локатор намеренно сужен до пилотной формы.
  const roasterButton = page.locator('form:has(input[name="role"][value="roaster_admin"]) button');
  if (!(await roasterButton.isVisible().catch(() => false))) {
    test.skip(true, 'пилотные кабинеты выключены: NEXT_PUBLIC_PILOT_DEMO_ENABLED не задан в окружении e2e');
  }
  await roasterButton.click();
  // Server action формы — мягкая навигация (router), load не дожидаемся.
  await page.waitForURL(/\/dashboard\/roaster|\/auth\/login/, { waitUntil: 'commit' });
  if (page.url().includes('/auth/login')) {
    test.skip(true, 'вход пилотного обжарщика не прошёл — нет связи с Supabase или пилотные аккаунты не заведены');
  }

  // Лот демо-обжарщика из сидов — ссылка редактирования детерминирована href'ом.
  await page.locator('a[href="/dashboard/roaster/LOT-XO-ETH-001/edit"]').click();
  await expect(page).toHaveURL(/\/dashboard\/roaster\/LOT-XO-ETH-001\/edit$/);

  // Секция появляется вместе с фичей «Процесс» (PR #105): на ветках без неё
  // тест не падает, а честно выходит с причиной.
  const processSection = page.getByText('Процесс и происхождение');
  if (!(await processSection.isVisible().catch(() => false))) {
    test.skip(true, 'секция «Процесс и происхождение» отсутствует в LotBuilderForm — фича не влита в эту ветку (PR #105)');
  }

  await page.locator('#lot-process-family').selectOption('washed');
  await page.locator('#lot-fermentation-days').fill('72');
  await page.locator('#lot-vessel').fill('Открытый танк');
  await page.locator('#lot-process-note').fill('Долгая ферментация даёт чистую чашку — e2e.');
  await page.getByText('Прямая торговля').click();

  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page).toHaveURL(/\/dashboard\/roaster$/);

  // Тот же браузер открывает паспорт лота гостевым путём: блок «Процесс»
  // обязан быть виден вместе с дисклеймером о заявленных значках.
  await page.goto(`/passport/${DEMO_LOT_ID}?entry=shop`);
  await expect(page.getByText('Процесс', { exact: true })).toBeVisible();
  await expect(page.getByText('Мытая')).toBeVisible();
  await expect(page.getByText('72 дня')).toBeVisible();
  await expect(page.getByText('Открытый танк')).toBeVisible();
  await expect(page.getByText('Долгая ферментация даёт чистую чашку — e2e.')).toBeVisible();
  await expect(page.getByText('Прямая торговля')).toBeVisible();
  await expect(
    page.getByText('Значки заявлены обжарщиком и не проходят независимую проверку.')
  ).toBeVisible();
});
