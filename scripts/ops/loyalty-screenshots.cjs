// Скриншоты ключевых экранов задачи 3 пакета №5 (постоянный 5-значный код
// гостя): ЛК гостя с кодом вместо UUID (QR-модалка) и кабинет бариста с
// полем ручного ввода кода. Гоняется на проде, временные учётки — те же
// шаблоны, что у verify-barista-access (barista-verify-temp-<run>@example.com,
// barista-verify-guest-<run>@example.com), уборка — тем же серверным python
// (режим purge). Печатает только шаги и пути — ни email, ни пароли.
// Запуск (из workflow loyalty-screenshots):
//   node scripts/ops/loyalty-screenshots.cjs <путь к playwright> <shots-dir> <flow.json>
const fs = require('fs');
const { chromium } = require(process.argv[2]);

const shotsDir = process.argv[3];
const flow = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
const base = flow.base_url;
const temp = flow.temp_barista;
const guest = flow.guest;
let failed = 0;

function pass(label, detail) {
  console.log(`PASS ${label}: ${detail}`);
}

async function login(page, email, password, from = '/auth/login') {
  await page.goto(base + from, { waitUntil: 'networkidle' });
  await page.fill('#enthusiast-email', email);
  await page.fill('#enthusiast-password', password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== from || url.searchParams.has('error'), { timeout: 30000 }),
    page.click('form button[type="submit"]'),
  ]);
  return settle(page);
}

async function settle(page) {
  const deadline = Date.now() + 30000;
  let url = page.url();
  let stableSince = Date.now();
  while (Date.now() - stableSince < 3000) {
    if (Date.now() > deadline) throw new Error(`адрес не затих за 30 с (последний ${new URL(url).pathname})`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(250);
    if (page.url() !== url) {
      url = page.url();
      stableSince = Date.now();
    }
  }
  return new URL(url);
}

async function shot(page, name) {
  await page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: false });
  console.log(`shot: ${shotsDir}/${name}.png`);
}

async function withViewport(browser, width, height, fn) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  try {
    await fn(page);
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(shotsDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    // Кофейня добавляет временного бариста (тот же путь, что verify):
    // «Команда» → «+ Добавить сотрудника» → учётка «Ждёт смены пароля».
    await withViewport(browser, 1440, 900, async (page) => {
      const landed = await login(page, flow.cafe.email, flow.cafe.password);
      if (landed.pathname !== '/dashboard/cafe') throw new Error(`вход кофейни привёл на ${landed.pathname}`);
      await page.goto(base + '/dashboard/cafe/team', { waitUntil: 'networkidle' });
      const buttons = page.getByRole('button', { name: /Добавить сотрудника/ });
      if (await buttons.count() !== 1) throw new Error('кнопка «Добавить сотрудника» не одна');
      await buttons.click();
      await page.fill('#barista-name', temp.name);
      await page.fill('#barista-email', temp.email);
      await page.fill('#barista-temporary-password', temp.temp_password);
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) => r.url().endsWith('/api/cafe/staff/barista-accounts') && r.request().method() === 'POST',
          { timeout: 30000 }
        ),
        page.getByRole('button', { name: 'Создать учётку' }).click(),
      ]);
      if (response.status() !== 201) throw new Error(`POST barista-accounts -> HTTP ${response.status()}`);
      pass('temp barista created', 'кофейня создала временного бариста');
    });

    // Бариста: первый вход (временный пароль → смена → кабинет) — скриншоты
    // кабинета с полем «Код гостя: 5 цифр» рядом со сканером.
    async function baristaCabinet(page) {
      const landed = await login(page, temp.email, temp.temp_password);
      if (landed.pathname !== '/auth/change-password') throw new Error(`временный пароль привёл на ${landed.pathname}`);
      await page.fill('#new-password', temp.password);
      await page.fill('#new-password-confirmation', temp.password);
      await Promise.all([
        page.waitForURL((url) => url.pathname !== '/auth/change-password', { timeout: 30000 }),
        page.getByRole('button', { name: 'Сохранить и войти' }).click(),
      ]);
      const after = await settle(page);
      if (after.pathname !== '/dashboard/barista') throw new Error(`после смены пароля — ${after.pathname}`);
      await page.getByText('Лояльность гостя').waitFor({ timeout: 20000 });
      await page.getByPlaceholder('Код гостя: 5 цифр').waitFor({ timeout: 20000 });
    }
    await withViewport(browser, 1440, 900, async (page) => {
      await baristaCabinet(page);
      await shot(page, 'barista-cabinet-desktop-1440x900');
      pass('barista desktop', 'кабинет бариста: «Код гостя: 5 цифр» на месте');
    });
    await withViewport(browser, 390, 844, async (page) => {
      await baristaCabinet(page);
      await shot(page, 'barista-cabinet-mobile-390x844');
      pass('barista mobile', 'кабинет бариста (390×844): «Код гостя: 5 цифр» на месте');
    });

    // Гость: ЛК → QR-модалка с 5-значным кодом (UUID не показывается).
    async function guestQr(page, name) {
      const landed = await login(page, guest.email, guest.password);
      if (landed.pathname !== '/loyalty') throw new Error(`вход гостя привёл на ${landed.pathname}`);
      await page.getByRole('button', { name: /Показать мой QR-код/ }).click();
      await page.getByText('Ваш код для бариста').waitFor({ timeout: 20000 });
      const code = await page.locator('.data-value').last().innerText();
      if (!/^\d{5}$/.test(code.trim())) throw new Error(`код «${code}» не по формату \d{5}`);
      await shot(page, name);
      pass(name, `QR-модалка с кодом ${code}`);
    }
    await withViewport(browser, 1440, 900, async (page) => guestQr(page, 'guest-qr-desktop-1440x900'));
    await withViewport(browser, 390, 844, async (page) => guestQr(page, 'guest-qr-mobile-390x844'));
  } catch (error) {
    failed++;
    console.log(`FAIL ${error.message.split('\n')[0]}`);
  } finally {
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
})();
