// Активация партнёра пишет в базу — на проде, через настоящий интерфейс.
//  1. Вход admin → /admin, вкладка «Заявки» → временная заявка → «Активировать»: новая карточка,
//     точка на карте (клик по центру), свой цвет → «Партнёр активирован», id кофейни.
//  2. API admin: кофейня в /api/admin/partners с этим цветом и статусом active; заявка — activated.
//  3. Новый браузерный контекст без входа: /map показывает булавку с названием кофейни и этим цветом.
// Запуск (из workflow verify-partner-activation): node verify-partner-activation.cjs <путь к playwright>
// env: PROD_URL, TEMP_JSON ({admin, company}), REQUEST_ID, PIN_COLOR, SHOT_DIR. Email и пароль в вывод не попадают.
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.argv[2]);

const base = process.env.PROD_URL;
const temp = JSON.parse(fs.readFileSync(process.env.TEMP_JSON, 'utf8'));
const requestId = process.env.REQUEST_ID;
const color = process.env.PIN_COLOR.toLowerCase();
const shots = process.env.SHOT_DIR;
let failed = 0;

function report(ok, line) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
}

async function signIn(context, account, next) {
  const page = await context.newPage();
  await page.goto(`${base}/auth/login?next=${encodeURIComponent(next)}`, { waitUntil: 'networkidle' });
  await page.fill('#enthusiast-email', account.email);
  await page.fill('#enthusiast-password', account.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/auth/login' || url.searchParams.has('error'), { timeout: 30000 }),
    page.click('form button[type="submit"]'),
  ]);
  return page;
}

(async () => {
  const browser = await chromium.launch();
  let shopId = '';
  try {
    const admin = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await signIn(admin, temp.admin, '/admin');
    report(new URL(page.url()).pathname === '/admin', `вход admin -> ${new URL(page.url()).pathname}`);

    const card = page.locator('div').filter({ hasText: temp.company }).filter({ has: page.getByRole('button', { name: 'Активировать' }) }).last();
    await card.waitFor({ timeout: 30000 });
    await card.getByRole('button', { name: 'Активировать' }).click();
    const dialog = page.getByRole('dialog', { name: 'Активировать партнёра' });
    await dialog.waitFor();
    report((await dialog.locator('#partner-card').inputValue()) === '', 'модалка: «Карточка в базе» — новая (не XO)');
    const picker = dialog.locator('.leaflet-container');
    await picker.waitFor({ timeout: 30000 });
    await picker.click();
    const pointText = await dialog.locator('p', { hasText: /^\d+\.\d{5}, \d+\.\d{5}$/ }).innerText({ timeout: 10000 });
    report(true, `модалка: точка ${pointText}`);
    await dialog.locator('input[type="color"]').fill(color);
    await dialog.getByRole('button', { name: 'Активировать и создать инвайт-код' }).click();
    await dialog.getByText('Партнёр активирован').waitFor({ timeout: 30000 });
    shopId = (await dialog.locator('p.data-value.text-xs').innerText()).trim();
    report(shopId.startsWith('shop-'), `модалка: «Партнёр активирован», id ${shopId}`);
    await page.screenshot({ path: path.join(shots, 'admin-activated.png') });

    const partners = await admin.request.get(`${base}/api/admin/partners`);
    const shop = partners.ok() ? (await partners.json()).coffeeShops.find((item) => item.id === shopId) : null;
    report(
      Boolean(shop) && shop.brandColor === color && shop.status === 'active' && shop.lat !== null,
      `admin: GET /api/admin/partners -> HTTP ${partners.status()}, ${shopId}: ${shop ? `цвет ${shop.brandColor}, статус ${shop.status}, точка ${shop.lat}, ${shop.lng}` : 'нет в базе'}`
    );
    const requests = await admin.request.get(`${base}/api/admin/partner-requests`);
    const request = requests.ok() ? (await requests.json()).requests.find((item) => item.id === requestId) : null;
    report(request?.status === 'activated', `admin: заявка ${requestId} -> статус ${request?.status ?? 'нет'}`);
    await admin.close();

    const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const cookies = await guest.cookies();
    const map = await guest.newPage();
    await map.goto(`${base}/map`, { waitUntil: 'networkidle' });
    const marker = map.locator(`.leaflet-marker-icon[title="${temp.company}"]`);
    await marker.waitFor({ timeout: 30000 });
    const style = ((await marker.locator('div').first().getAttribute('style')) || '').replace(/\s+/g, '').toLowerCase();
    report(style.includes(`background:${color}`), `без входа (cookies ${cookies.length}): /map булавка «${temp.company}», style background ${style.match(/background:([^;]+)/)?.[1] ?? 'нет'}`);
    await map.screenshot({ path: path.join(shots, 'map-guest.png') });
    await guest.close();
  } finally {
    await browser.close();
  }
  console.log(failed ? `FAIL проверок с ошибкой: ${failed}` : `PASS активация партнёра через базу (${shopId})`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`FAIL ${e.message.split('\n')[0]}`); process.exit(1); });
