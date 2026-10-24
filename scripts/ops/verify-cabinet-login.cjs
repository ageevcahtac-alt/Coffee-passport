// Вход через настоящую форму на проде: email + пароль → «Войти» → куда привела форма,
// затем повторный GET этого пути с полученной сессией (HTTP-код и итоговый путь).
// Запуск (из workflow provision-cabinets): node verify-cabinet-login.cjs <путь к playwright>
// env: PROD_URL; LOGIN_CHECKS — JSON [{label, email, password, from, expect}].
// Печатает только метку, пути и коды — ни email, ни пароль в вывод не попадают.
const { chromium } = require(process.argv[2]);

(async () => {
  const base = process.env.PROD_URL;
  const checks = JSON.parse(process.env.LOGIN_CHECKS || '[]');
  const browser = await chromium.launch({ headless: true });
  let failed = 0;
  try {
    for (const check of checks) {
      const context = await browser.newContext();
      const page = await context.newPage();
      let line;
      try {
        await page.goto(base + check.from, { waitUntil: 'networkidle' });
        await page.fill('#enthusiast-email', check.email);
        await page.fill('#enthusiast-password', check.password);
        const fromPath = new URL(page.url()).pathname;
        await Promise.all([
          page.waitForURL((url) => url.pathname !== fromPath || url.searchParams.has('error'), { timeout: 30000 }),
          page.click('form button[type="submit"]'),
        ]);
        const landed = new URL(page.url());
        const response = await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
        const final = new URL(page.url());
        const ok = landed.pathname === check.expect && final.pathname === check.expect && response.status() === 200;
        const error = landed.searchParams.has('error') ? ' (форма вернула ошибку входа)' : '';
        line = `${ok ? 'PASS' : 'FAIL'} ${check.label}: вход с ${check.from} -> ${landed.pathname}${error}; ` +
          `GET ${landed.pathname} -> HTTP ${response.status()} ${final.pathname} (ожидалось ${check.expect})`;
        if (!ok) failed++;
      } catch (error) {
        failed++;
        line = `FAIL ${check.label}: ${error.message.split('\n')[0]} (на ${new URL(page.url()).pathname})`;
      }
      console.log(line);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  if (!checks.length) { console.log('FAIL: нет проверок'); process.exit(1); }
  process.exit(failed ? 1 : 0);
})();
