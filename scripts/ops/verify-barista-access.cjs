// Доступ бариста на проде — через настоящий интерфейс, как это делают люди:
//   1) кофейня входит → «Команда» → «Доступ в кабинет бариста»: имя, email, временный пароль;
//   2) бариста входит временным паролем → «Задайте свой пароль» → свой кабинет;
//      временный пароль больше не пускает, новый ведёт сразу в кабинет;
//   3) экран скана (камера — фейковое устройство Chromium) открывается; гость находится по коду
//      (тот же путь, что после скана QR: extractGuestId → loadGuest) → «Списать баллы» с абонемента;
//   4) кабинет кофейни → «Лояльность»: гость и операция на сумму чека видны.
// Запуск (из workflow verify-barista-access): node verify-barista-access.cjs <путь к playwright>
// env: PROD_URL, FLOW_JSON (путь к JSON), SHOTS_DIR (скриншоты при сбое).
// Печатает только шаги, пути и суммы — ни email, ни пароли в вывод не попадают.
const fs = require('fs');
const { chromium } = require(process.argv[2]);

const base = process.env.PROD_URL;
const flow = JSON.parse(fs.readFileSync(process.env.FLOW_JSON, 'utf8'));
const amountText = `${Number(flow.amount).toLocaleString('ru-RU')} ₽`;
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

// Вход ведёт цепочкой редиректов (форма → кабинет → requireStaffRole → смена пароля): первый
// сменившийся адрес — ещё не итог. Итог — адрес, на котором страница затихла.
// Затихла = адрес не менялся 3 с подряд; не затихла за 30 с — ошибка, а не промежуточный адрес.
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

async function step(browser, label, fn) {
  const context = await browser.newContext({ permissions: ['camera'] });
  const page = await context.newPage();
  try {
    await fn(page);
  } catch (error) {
    failed++;
    console.log(`FAIL ${label}: ${error.message.split('\n')[0]} (на ${new URL(page.url()).pathname})`);
    if (process.env.SHOTS_DIR) {
      // Поля с паролями (временный пароль на форме кофейни — открытым текстом) — пустые до снимка.
      await page.evaluate(() => document.querySelectorAll('input').forEach((input) => { input.value = ''; })).catch(() => {});
      await page.screenshot({ path: `${process.env.SHOTS_DIR}/${label.replace(/\W+/g, '-')}.png`, fullPage: true }).catch(() => {});
    }
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  try {
    if (flow.barista_state === 'absent') {
      await step(browser, 'cafe adds barista', async (page) => {
        const landed = await login(page, flow.cafe.email, flow.cafe.password);
        if (landed.pathname !== '/dashboard/cafe') throw new Error(`вход кофейни привёл на ${landed.pathname}`);
        await page.goto(base + '/dashboard/cafe/team', { waitUntil: 'networkidle' });
        await page.fill('#barista-name', 'Бариста владельца');
        await page.fill('#barista-email', flow.barista.email);
        await page.fill('#barista-temporary-password', flow.barista.temp_password);
        const [response] = await Promise.all([
          page.waitForResponse((r) => r.url().endsWith('/api/cafe/staff/barista-accounts'), { timeout: 30000 }),
          page.getByRole('button', { name: 'Создать доступ' }).click(),
        ]);
        if (response.status() !== 201) throw new Error(`POST barista-accounts -> HTTP ${response.status()}`);
        await page.getByText('создана. Передайте бариста').waitFor({ timeout: 15000 });
        pass('cafe adds barista', 'Команда → «Создать доступ» -> HTTP 201, сообщение «учётка создана»');
      });

      await step(browser, 'barista first login', async (page) => {
        let landed = await login(page, flow.barista.email, flow.barista.temp_password);
        // Прямое ожидание нужного адреса — на случай редиректа позже окна settle(); настоящий баг
        // (вход сразу в кабинет) всё равно упадёт по таймауту ниже.
        await page.waitForURL((url) => url.pathname === '/auth/change-password', { timeout: 20000 }).catch(() => {});
        landed = new URL(page.url());
        if (landed.pathname !== '/auth/change-password') throw new Error(`временный пароль привёл на ${landed.pathname}`);
        await page.fill('#new-password', flow.barista.password);
        await page.fill('#new-password-confirmation', flow.barista.password);
        await Promise.all([
          page.waitForURL((url) => url.pathname !== '/auth/change-password' || url.searchParams.has('error'), { timeout: 30000 }),
          page.getByRole('button', { name: 'Сохранить и войти' }).click(),
        ]);
        const after = await settle(page);
        if (after.pathname !== '/dashboard/barista') throw new Error(`после смены пароля — ${after.pathname}`);
        pass('barista first login', 'временный пароль -> /auth/change-password -> свой пароль -> /dashboard/barista');
      });

      await step(browser, 'temporary password retired', async (page) => {
        const landed = await login(page, flow.barista.email, flow.barista.temp_password);
        if (!landed.searchParams.has('error')) throw new Error(`временный пароль всё ещё пускает (${landed.pathname})`);
        pass('temporary password retired', `временный пароль -> ${landed.pathname} с ошибкой входа`);
      });
    } else {
      console.log('note: учётка бариста уже есть — шаги «кофейня добавляет» и «первый вход» пропущены (reset_barista=true, чтобы пройти их заново)');
    }

    await step(browser, 'barista cabinet and loyalty', async (page) => {
      const landed = await login(page, flow.barista.email, flow.barista.password);
      if (landed.pathname !== '/dashboard/barista') throw new Error(`вход бариста привёл на ${landed.pathname}`);
      const response = await page.goto(page.url(), { waitUntil: 'networkidle' });
      if (response.status() !== 200) throw new Error(`GET /dashboard/barista -> HTTP ${response.status()}`);
      await page.getByText('Лояльность гостя').waitFor({ timeout: 20000 });
      pass('barista cabinet', `вход -> /dashboard/barista HTTP 200, блок «Лояльность гостя» на месте`);

      await page.getByRole('button', { name: /Сканировать карту гостя/ }).click();
      await page.waitForFunction(() => {
        const video = document.querySelector('video');
        return video && video.readyState >= 2;
      }, null, { timeout: 20000 });
      pass('scan screen', '«Сканировать карту гостя» -> видео с камеры идёт');
      await page.getByRole('button', { name: /Отмена|Закрыть|Назад/ }).first().click();

      await page.getByPlaceholder('Или введите ID гостя вручную').fill(`coffeepassport-guest:${flow.guest.id}`);
      await page.getByPlaceholder('Или введите ID гостя вручную').press('Enter');
      await page.getByText(flow.guest.display_name).waitFor({ timeout: 20000 });
      pass('guest found', 'код гостя (формат QR) -> карточка временного гостя');

      await page.getByRole('button', { name: 'Списать баллы' }).click();
      await page.fill('#redeem-amount', String(flow.amount));
      await page.selectOption('#redeem-subscription', flow.subscription_id);
      const [rpc] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/rpc/loyalty_redeem'), { timeout: 30000 }),
        page.getByRole('button', { name: 'Провести чек' }).click(),
      ]);
      if (rpc.status() !== 200) throw new Error(`rpc loyalty_redeem -> HTTP ${rpc.status()}`);
      await page.getByText('Чек проведён, ранг пересчитан.').waitFor({ timeout: 15000 });
      pass('redeem', `«Списать баллы» ${amountText} с абонемента -> rpc loyalty_redeem HTTP 200, «Чек проведён»`);
    });

    await step(browser, 'cafe sees the operation', async (page) => {
      const landed = await login(page, flow.cafe.email, flow.cafe.password);
      if (landed.pathname !== '/dashboard/cafe') throw new Error(`вход кофейни привёл на ${landed.pathname}`);
      await page.goto(base + '/dashboard/cafe/loyalty', { waitUntil: 'networkidle' });
      await page.getByText(flow.guest.display_name).first().waitFor({ timeout: 20000 });
      const rows = page.locator('table tr').filter({ hasText: amountText });
      await rows.first().waitFor({ timeout: 20000 });
      pass('cafe sees the operation', `«Лояльность»: временный гость в абонементах, строк с ${amountText} в сверке: ${await rows.count()}`);
    });
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
})();
