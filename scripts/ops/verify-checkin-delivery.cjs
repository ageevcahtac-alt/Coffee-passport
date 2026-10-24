// Две настоящие оценки одного лота на проде — так, как их делает гость:
//   1) «Я в кофейне» → кофейня XO (Всеволожск) → слепая дегустация;
//   2) новый браузер (чистое хранилище) → «Я в магазине» → «Пройти каппинг» → та же кофейня.
// Каждая оценка засчитывается, только когда браузер получил ответ 201 на вставку в checkins.
// Запуск (из workflow verify-checkin-delivery): node verify-checkin-delivery.cjs <путь к playwright>
// env: PROD_URL, LOT_ID, TEMP_JSON (путь к {email, password}), SHOTS_DIR (скриншоты при сбое).
// Печатает только шаги, пути и коды — ни email, ни пароль в вывод не попадают.
const fs = require('fs');
const { chromium } = require(process.argv[2]);

const base = process.env.PROD_URL;
const lotPath = `/passport/${process.env.LOT_ID}`;
const temp = JSON.parse(fs.readFileSync(process.env.TEMP_JSON, 'utf8'));

async function login(page) {
  await page.goto(base + '/auth/login', { waitUntil: 'networkidle' });
  await page.fill('#enthusiast-email', temp.email);
  await page.fill('#enthusiast-password', temp.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/auth/login' || url.searchParams.has('error'), { timeout: 30000 }),
    page.click('form button[type="submit"]'),
  ]);
  if (new URL(page.url()).searchParams.has('error')) throw new Error('форма вернула ошибку входа');
}

async function pickShop(page) {
  await page.getByPlaceholder('Найти аккредитованную кофейню…').fill('XO');
  await page.getByRole('button').filter({ hasText: 'Всеволожск' }).first().click();
}

// Шаги taste-страницы от «Что вы пьёте?» до сохранения.
async function tasteAndSave(page) {
  await page.getByRole('heading', { name: 'Что вы пьёте?' }).waitFor();
  await page.getByRole('button', { name: 'Чёрный кофе', exact: true }).click();
  await page.getByRole('button', { name: 'Эспрессо', exact: true }).click();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.getByRole('heading', { name: 'Расскажите о чашке' }).waitFor();
  await page.getByRole('button', { name: '4 из 5' }).first().click();
  await page.getByRole('button', { name: 'Далее — работа бариста' }).click();
  await page.getByRole('heading', { name: 'Работа бариста' }).waitFor();
  await page.getByLabel('Не указан').check();
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.request().method() === 'POST' && new URL(res.url()).pathname.endsWith('/rest/v1/checkins'),
      { timeout: 30000 }
    ),
    page.getByRole('button', { name: 'Сохранить дегустацию в дневник' }).click(),
  ]);
  return response.status();
}

const scenarios = [
  {
    label: 'слепая в кофейне',
    async run(page) {
      await page.goto(base + lotPath, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Я в кофейне/ }).click();
      await pickShop(page);
      await page.getByRole('link', { name: 'Начать слепую дегустацию' }).click();
      return tasteAndSave(page);
    },
  },
  {
    label: 'после «Я в магазине»',
    async run(page) {
      await page.goto(base + lotPath, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Я в магазине/ }).click();
      await page.getByRole('link', { name: 'Пройти каппинг' }).click();
      await page.getByRole('heading', { name: 'Где вы пробуете этот кофе?' }).waitFor();
      await pickShop(page);
      await page.getByRole('button', { name: 'Далее', exact: true }).click();
      return tasteAndSave(page);
    },
  },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  let failed = 0;
  try {
    for (const [index, scenario] of scenarios.entries()) {
      // Свой контекст на оценку: слепой путь не должен унаследовать отметку «профиль открыт».
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      try {
        await login(page);
        const status = await scenario.run(page);
        const ok = status === 201;
        if (!ok) failed++;
        console.log(`${ok ? 'PASS' : 'FAIL'} оценка ${scenario.label}: POST checkins -> HTTP ${status}`);
      } catch (error) {
        failed++;
        console.log(`FAIL оценка ${scenario.label}: ${error.message.split('\n')[0]} (на ${new URL(page.url()).pathname})`);
        if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/fail-${index + 1}.png`, fullPage: true });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  process.exit(failed ? 1 : 0);
})();
