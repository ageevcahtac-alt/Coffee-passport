// Доступ бариста на проде — через настоящий интерфейс, как это делают люди.
// Фаза create (до серверной проверки gate):
//   a) кофейня → «Команда» → единственная кнопка «+ Добавить сотрудника» → учётка временного бариста
//      этого прогона, в списке «Ждёт смены пароля»;
//   b) гость открывает форму оценки — новый бариста уже в «Кто готовил?», гость ставит ему 5 и пишет отзыв;
//   c) временный пароль ведёт только на смену пароля: кабинет бариста и API кабинета закрыты.
// Фаза main (сервер уже проверил, что API отклоняет действия, и перевёл срок пароля в прошлое):
//   d) вход с просроченным временным паролем отклонён с сообщением о 72 часах;
//   e) кофейня «Выдать новый временный пароль» → бариста входит новым, задаёт свой → в его кабинете
//      виден отзыв гостя;
//   1) бариста владельца: при reset — кофейня добавляет, первый вход со сменой пароля;
//   2) экран скана (камера — фейковое устройство Chromium) открывается; гость находится по коду
//      (тот же путь, что после скана QR: extractGuestId → loadGuest) → «Списать баллы» с абонемента;
//   3) кабинет кофейни → «Лояльность»: гость и операция на сумму чека видны.
// Запуск (из workflow verify-barista-access): node verify-barista-access.cjs <путь к playwright> create|main
// env: PROD_URL, FLOW_JSON (путь к JSON), SHOTS_DIR (скриншоты при сбое).
// Печатает только шаги, пути и суммы — ни email, ни пароли в вывод не попадают.
const fs = require('fs');
const { chromium } = require(process.argv[2]);

const phase = process.argv[3];
const base = process.env.PROD_URL;
const flow = JSON.parse(fs.readFileSync(process.env.FLOW_JSON, 'utf8'));
const temp = flow.temp_barista;
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

async function cafeTeam(page) {
  const landed = await login(page, flow.cafe.email, flow.cafe.password);
  if (landed.pathname !== '/dashboard/cafe') throw new Error(`вход кофейни привёл на ${landed.pathname}`);
  await page.goto(base + '/dashboard/cafe/team', { waitUntil: 'networkidle' });
}

async function addStaff(page, name, email, password) {
  const buttons = page.getByRole('button', { name: /Добавить сотрудника/ });
  const count = await buttons.count();
  if (count !== 1) throw new Error(`кнопок «Добавить сотрудника» на странице: ${count}`);
  await buttons.click();
  await page.fill('#barista-name', name);
  await page.fill('#barista-email', email);
  await page.fill('#barista-temporary-password', password);
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith('/api/cafe/staff/barista-accounts') && r.request().method() === 'POST',
      { timeout: 30000 }
    ),
    page.getByRole('button', { name: 'Создать учётку' }).click(),
  ]);
  if (response.status() !== 201) throw new Error(`POST barista-accounts -> HTTP ${response.status()}`);
}

async function accountRow(page, name) {
  const row = page.locator('[data-testid="barista-accounts"] li').filter({ hasText: name }).first();
  await row.waitFor({ timeout: 20000 });
  return row;
}

async function changePassword(page, password) {
  await page.waitForURL((url) => url.pathname === '/auth/change-password', { timeout: 20000 }).catch(() => {});
  const landed = new URL(page.url());
  if (landed.pathname !== '/auth/change-password') throw new Error(`временный пароль привёл на ${landed.pathname}`);
  await page.fill('#new-password', password);
  await page.fill('#new-password-confirmation', password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/auth/change-password' || url.searchParams.has('error'), { timeout: 30000 }),
    page.getByRole('button', { name: 'Сохранить и войти' }).click(),
  ]);
  const after = await settle(page);
  if (after.pathname !== '/dashboard/barista') throw new Error(`после смены пароля — ${after.pathname}`);
}

async function createPhase(browser) {
  await step(browser, 'cafe adds staff login', async (page) => {
    await cafeTeam(page);
    await addStaff(page, temp.name, temp.email, temp.temp_password);
    const row = await accountRow(page, temp.name);
    await row.getByText('Ждёт смены пароля').waitFor({ timeout: 15000 });
    pass('cafe adds staff login', 'одна кнопка «+ Добавить сотрудника» → «Создать учётку» -> HTTP 201, в списке «Ждёт смены пароля»');
  });

  await step(browser, 'new barista in guest rating form', async (page) => {
    const landed = await login(page, flow.guest.email, flow.guest.password);
    if (landed.searchParams.has('error')) throw new Error('вход гостя вернул ошибку');
    await page.goto(`${base}/passport/${flow.lot_id}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Я в кофейне/ }).click();
    await page.getByPlaceholder('Найти аккредитованную кофейню…').fill('XO');
    await page.getByRole('button').filter({ hasText: 'Всеволожск' }).first().click();
    await page.getByRole('link', { name: 'Начать слепую дегустацию' }).click();
    await page.getByRole('heading', { name: 'Что вы пьёте?' }).waitFor();
    await page.getByRole('button', { name: 'Чёрный кофе', exact: true }).click();
    await page.getByRole('button', { name: 'Эспрессо', exact: true }).click();
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await page.getByRole('heading', { name: 'Расскажите о чашке' }).waitFor();
    await page.getByRole('radio', { name: '4 из 5' }).first().click();
    await page.getByRole('button', { name: 'Далее — работа бариста' }).click();
    await page.getByRole('heading', { name: 'Работа бариста' }).waitFor();
    const choice = page.getByLabel(temp.name, { exact: true });
    await choice.waitFor({ timeout: 20000 });
    pass('new barista in guest rating form', `«Кто готовил?» → «${temp.name}» в списке сразу после создания учётки`);

    await choice.check();
    await page.getByRole('radio', { name: '5 из 5' }).last().click();
    await page.fill('#barista-note', temp.note);
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'POST' && new URL(r.url()).pathname.endsWith('/rest/v1/checkins'),
        { timeout: 30000 }
      ),
      page.getByRole('button', { name: 'Сохранить дегустацию в дневник' }).click(),
    ]);
    if (response.status() !== 201) throw new Error(`POST checkins -> HTTP ${response.status()}`);
    pass('guest rates the new barista', 'оценка 5 и отзыв -> POST checkins HTTP 201');
  });

  await step(browser, 'temporary password opens only the password change', async (page) => {
    await login(page, temp.email, temp.temp_password);
    await page.waitForURL((url) => url.pathname === '/auth/change-password', { timeout: 20000 }).catch(() => {});
    const landed = new URL(page.url());
    if (landed.pathname !== '/auth/change-password') throw new Error(`временный пароль привёл на ${landed.pathname}`);
    await page.goto(base + '/dashboard/barista', { waitUntil: 'networkidle' });
    const after = await settle(page);
    if (after.pathname !== '/auth/change-password') throw new Error(`/dashboard/barista открылся (${after.pathname})`);
    pass('temporary password opens only the password change', 'вход -> /auth/change-password; /dashboard/barista -> /auth/change-password');
  });
}

async function reissueSteps(browser) {
  await step(browser, 'expired temporary password refused', async (page) => {
    const landed = await login(page, temp.email, temp.temp_password);
    const error = landed.searchParams.get('error') || '';
    if (!error.includes('72')) {
      throw new Error(`ожидался отказ про 72 часа, получено ${landed.pathname} ${error ? `«${error}»` : 'без ошибки'}`);
    }
    pass('expired temporary password refused', `вход -> ${landed.pathname} «${error}»`);
  });

  await step(browser, 'cafe issues a new temporary password', async (page) => {
    await cafeTeam(page);
    let row = await accountRow(page, temp.name);
    await row.getByText('Временный пароль истёк').waitFor({ timeout: 15000 });
    await row.getByRole('button', { name: 'Выдать новый временный пароль' }).click();
    await row.locator('input').fill(temp.temp_password2);
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/api/cafe/staff/barista-accounts') && r.request().method() === 'PATCH',
        { timeout: 30000 }
      ),
      row.getByRole('button', { name: 'Выдать пароль' }).click(),
    ]);
    if (response.status() !== 200) throw new Error(`PATCH barista-accounts -> HTTP ${response.status()}`);
    row = await accountRow(page, temp.name);
    await row.getByText('Ждёт смены пароля').waitFor({ timeout: 15000 });
    pass('cafe issues a new temporary password', '«Временный пароль истёк» → «Выдать новый временный пароль» -> HTTP 200, снова «Ждёт смены пароля»');
  });

  await step(browser, 'rating reached the new barista cabinet', async (page) => {
    await login(page, temp.email, temp.temp_password2);
    await changePassword(page, temp.password);
    await page.getByText(temp.note).waitFor({ timeout: 30000 });
    pass('rating reached the new barista cabinet', 'новый временный пароль -> свой пароль -> /dashboard/barista, отзыв гостя виден в кабинете');
  });
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  try {
    if (phase === 'create') {
      await createPhase(browser);
      return;
    }
    if (phase !== 'main') throw new Error('фаза: create | main');
    await reissueSteps(browser);

    if (flow.barista_state === 'absent') {
      await step(browser, 'cafe adds barista', async (page) => {
        await cafeTeam(page);
        await addStaff(page, 'Бариста владельца', flow.barista.email, flow.barista.temp_password);
        pass('cafe adds barista', 'Команда → «+ Добавить сотрудника» -> HTTP 201');
      });

      await step(browser, 'barista first login', async (page) => {
        await login(page, flow.barista.email, flow.barista.temp_password);
        await changePassword(page, flow.barista.password);
        pass('barista first login', 'временный пароль -> /auth/change-password -> свой пароль -> /dashboard/barista');
      });

      await step(browser, 'temporary password retired', async (page) => {
        const landed = await login(page, flow.barista.email, flow.barista.temp_password);
        if (!landed.searchParams.has('error')) throw new Error(`временный пароль всё ещё пускает (${landed.pathname})`);
        pass('temporary password retired', `временный пароль -> ${landed.pathname} с ошибкой входа`);
      });
    } else {
      console.log('note: учётка бариста владельца уже есть — шаги «кофейня добавляет» и «первый вход» пропущены (reset_barista=true, чтобы пройти их заново)');
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
  } catch (error) {
    failed++;
    console.log(`FAIL ${error.message}`);
  } finally {
    // Здесь, а не после try: фаза create выходит через return.
    await browser.close();
    process.exit(failed ? 1 : 0);
  }
})();
