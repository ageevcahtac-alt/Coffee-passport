// Доступ к /admin по роли — на проде, через настоящую форму входа.
//  1. Без входа: GET /admin и GET /api/admin/partner-requests — не 200 (код и куда ведёт).
//  2. Вход кофейни: те же запросы с её сессией — не 200 (/admin уводит на вход с ошибкой, API — 403).
//  3. Вход admin: /dashboard/admin → ссылка «Заявки и партнёры» → /admin, вкладка «Заявки» показывает
//     заявку XO Coffee, Всеволожск; API с сессией admin отдаёт её id. Заявка только читается.
// Запуск (из workflow verify-admin-access): node verify-admin-access.cjs <путь к playwright>
// env: PROD_URL, TEMP_JSON ({admin, cafe}), XO_REQUEST_ID. Email и пароли в вывод не попадают.
const fs = require('fs');
const { chromium } = require(process.argv[2]);

const base = process.env.PROD_URL;
const temp = JSON.parse(fs.readFileSync(process.env.TEMP_JSON, 'utf8'));
const xoId = process.env.XO_REQUEST_ID;
let failed = 0;

function report(ok, line) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
}

async function probe(request, path) {
  const response = await request.get(base + path, { maxRedirects: 0 });
  const location = response.headers()['location'] || '';
  return { status: response.status(), location: location ? new URL(location, base).pathname : '' };
}

function closed(label, path, { status, location }) {
  const ok = status === 401 || status === 403 || (status >= 300 && status < 400 && location === '/auth/login');
  report(ok, `${label}: GET ${path} -> HTTP ${status}${location ? ` -> ${location}` : ''}`);
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
  try {
    const anon = await browser.newContext();
    for (const path of ['/admin', '/api/admin/partner-requests']) closed('без входа', path, await probe(anon.request, path));
    await anon.close();

    const cafe = await browser.newContext();
    const cafePage = await signIn(cafe, temp.cafe, '/dashboard/cafe');
    report(new URL(cafePage.url()).pathname.startsWith('/dashboard/cafe'), `вход кофейни -> ${new URL(cafePage.url()).pathname}`);
    for (const path of ['/admin', '/api/admin/partner-requests']) closed('кофейня', path, await probe(cafe.request, path));
    await cafe.close();

    const admin = await browser.newContext();
    const page = await signIn(admin, temp.admin, '/dashboard/admin');
    report(new URL(page.url()).pathname === '/dashboard/admin', `вход admin -> ${new URL(page.url()).pathname}`);
    await Promise.all([page.waitForURL((url) => url.pathname === '/admin', { timeout: 30000 }), page.click('a[href="/admin"]')]);
    const pageResponse = await probe(admin.request, '/admin');
    report(pageResponse.status === 200, `admin: ссылка из /dashboard/admin -> ${new URL(page.url()).pathname}; GET /admin -> HTTP ${pageResponse.status}`);
    const card = page.locator('li, article, div').filter({ hasText: /XO/i }).filter({ hasText: /Всеволожск/i }).last();
    await card.waitFor({ timeout: 30000 });
    const text = (await card.innerText()).split('\n').slice(0, 3).join(' | ');
    report(true, `admin: вкладка «Заявки» показывает: ${text}`);
    const api = await admin.request.get(`${base}/api/admin/partner-requests`);
    const ids = api.ok() ? (await api.json()).requests.map((r) => r.id) : [];
    report(api.status() === 200 && ids.includes(xoId), `admin: GET /api/admin/partner-requests -> HTTP ${api.status()}, заявок ${ids.length}, XO ${xoId} ${ids.includes(xoId) ? 'есть' : 'нет'}`);
    await admin.close();
  } finally {
    await browser.close();
  }
  console.log(failed ? `FAIL проверок с ошибкой: ${failed}` : 'PASS доступ к /admin по роли');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`FAIL ${e.message.split('\n')[0]}`); process.exit(1); });
