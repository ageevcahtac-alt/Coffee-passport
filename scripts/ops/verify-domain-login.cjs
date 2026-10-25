// Вход по email+паролю через форму на https://coffeepassport.ru — как это делает гость.
// Форма — server action (app/auth/actions.ts): пароль проверяет сервер через NEXT_PUBLIC_SUPABASE_URL.
// Засчитывается, только если браузер ушёл с /auth/login без ?error, остался на домене, получил
// cookie сессии sb-*-auth-token и ни один запрос браузера не ушёл на IP.
// Запуск (из workflow domain-https): node verify-domain-login.cjs <путь к playwright>
// env: PROD_URL, TEMP_JSON (путь к {email, password}). Email и пароль в вывод не попадают.
const fs = require('fs');
const { chromium } = require(process.argv[2]);

const base = process.env.PROD_URL;
const temp = JSON.parse(fs.readFileSync(process.env.TEMP_JSON, 'utf8'));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const hosts = new Set();
  page.on('request', (r) => hosts.add(new URL(r.url()).host));
  await page.goto(base + '/auth/login', { waitUntil: 'networkidle' });
  console.log(`login page: ${page.url()}`);
  await page.fill('#enthusiast-email', temp.email);
  await page.fill('#enthusiast-password', temp.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/auth/login' || url.searchParams.has('error'), { timeout: 30000 }),
    page.click('form button[type="submit"]'),
  ]);
  const after = new URL(page.url());
  const session = (await page.context().cookies(base)).filter((c) => /^sb-.*-auth-token/.test(c.name));
  console.log(`after submit: ${after.origin}${after.pathname}`);
  console.log(`session cookies: ${session.map((c) => `${c.name} domain=${c.domain} secure=${c.secure}`).join(', ') || 'none'}`);
  console.log(`request hosts: ${[...hosts].sort().join(' ')}`);
  await browser.close();
  const problems = [];
  if (after.origin !== base) problems.push(`ушли на ${after.origin}`);
  if (after.searchParams.has('error') || after.pathname === '/auth/login') problems.push('форма не пустила');
  if (!session.length) problems.push('нет cookie сессии');
  if ([...hosts].some((h) => /^\d+\.\d+\.\d+\.\d+/.test(h))) problems.push('есть запросы на IP');
  if (problems.length) { console.log(`FAIL ${problems.join('; ')}`); process.exit(1); }
  console.log('PASS вход по email+паролю через домен');
})().catch((e) => { console.log(`FAIL ${e.message}`); process.exit(1); });
