// Скриншоты рейтинга кофеен «зёрнами» (0052) на проде — карточка партнёрской
// кофейни с рейтингом (десктоп 1440×900 и мобильный 390×844), форма оценки
// гостя (актор оценивает через живой UI — заодно дымовый E2E), кабинет
// кофейни с гистограммой. Запуск (workflow cafe-ratings-screenshots):
//   node cafe-ratings-screenshots.cjs <путь к playwright> <папка скриншотов> <flow.json>
// flow.json (секреты только из env workflow, в лог не попадают): shop_name,
// actor (без оценки, оценивает через UI), cafe (кабинет кофейни),
// expect {average_text, average_after_text, ratings_total_text}. Оценки
// «сидов» уже лежат в базе (server prepare). Печатает только шаги и пути.
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.argv[2]);

const shotsDir = process.argv[3];
const flow = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
const base = flow.base_url;
const actor = flow.actor;
const cafeAccount = flow.cafe;

fs.mkdirSync(shotsDir, { recursive: true });
let step = 0;

function pass(label, detail) {
  step += 1;
  console.log(`PASS ${step}. ${label}: ${detail}`);
}

async function shot(page, name) {
  const file = path.join(shotsDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  pass(`screenshot ${name}`, file);
}

// Открыть карточку кофейни через маркер на /map. Маркер — L.divIcon (div,
// не img): ищем по классу .leaflet-marker-icon и title. Пока маркер в
// кластере, его нет в DOM — кликаем видимые кластеры по очереди (Leaflet
// убирает кластер после zoom-in, маркер появляется в DOM). Клик —
// dispatchEvent: сработает у элемента вне вьюпорта, которого playwright
// не счёл бы «видимым».
async function openShopCard(page, averageText) {
  await page.goto(base + '/map', { waitUntil: 'networkidle' });
  const marker = page.locator(`.leaflet-marker-icon[title="${flow.shop_name}"]`).first();
  for (let attempt = 0; attempt < 8 && (await marker.count()) === 0; attempt += 1) {
    const clusters = page.locator('.leaflet-marker-cluster:visible');
    if ((await clusters.count()) === 0) break;
    await clusters.nth(attempt % (await clusters.count())).click();
    await page.waitForTimeout(700);
  }
  if ((await marker.count()) === 0) {
    throw new Error(`маркер ${flow.shop_name} не появился после раскрытия кластеров`);
  }
  await marker.dispatchEvent('click');
  const dialog = page.locator('[role="dialog"][aria-label*="карточка кофейни"]');
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  // Публичный рейтинг: средний с запятой — явный маркер, что секция жива.
  await dialog.getByText(averageText, { exact: false }).first()
    .waitFor({ state: 'visible', timeout: 10000 });
  pass('карточка открыта с рейтингом', averageText);
  return dialog;
}

// Тот же вход, что и в loyalty-screenshots: форма #enthusiast-*.
async function login(page, email, password) {
  await page.goto(base + '/auth/login', { waitUntil: 'networkidle' });
  await page.fill('#enthusiast-email', email);
  await page.fill('#enthusiast-password', password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/auth/login', { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
}

(async () => {
  const browser = await chromium.launch();

  // 1. Десктоп: карточка с рейтингом (аноним).
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let page = await desktop.newPage();
  const dialog = await openShopCard(page, flow.expect.average_text);
  await page.waitForTimeout(400); // докрутка полос/анимаций Leaflet
  await shot(page, '1-card-rating-desktop');
  await desktop.close();

  // 2. Десктоп: форма оценки — актор оценивает через живой UI.
  const desktop2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await desktop2.newPage();
  await login(page, actor.email, actor.password);
  const formDialog = await openShopCard(page, flow.expect.average_text);
  await formDialog.getByRole('button', { name: 'Оценить', exact: true }).click();
  await formDialog.getByRole('radio', { name: '5 из 5 зёрен' }).waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(300);
  await shot(page, '2-rating-form-desktop');
  await formDialog.getByRole('radio', { name: '5 из 5 зёрен' }).click();
  await formDialog.locator('textarea').fill(actor.review);
  await formDialog.getByRole('button', { name: 'Отправить оценку' }).click();
  await formDialog.getByText('Ваша оценка', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await shot(page, '3-rating-submitted-desktop');
  pass('актор поставил оценку через UI', actor.review.slice(0, 24));
  await desktop2.close();

  // 3. Мобильный: та же карточка (уже с оценкой актора).
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  page = await mobile.newPage();
  await openShopCard(page, flow.expect.average_after_text);
  await page.waitForTimeout(400);
  await shot(page, '4-card-rating-mobile');
  await mobile.close();

  // 4. Кабинет кофейни: гистограмма + все отзывы.
  const cabinet = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await cabinet.newPage();
  await login(page, cafeAccount.email, cafeAccount.password);
  await page.goto(base + '/dashboard/cafe/ratings', { waitUntil: 'networkidle' });
  await page.getByText('средний балл', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText(flow.expect.ratings_total_text, { exact: true })
    .waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(300);
  await shot(page, '5-cabinet-ratings-desktop');
  pass('кабинет: гистограмма и отзывы на экране', flow.expect.ratings_total_text);
  await cabinet.close();

  await browser.close();
  console.log('SCREENSHOTS DONE');
})().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
