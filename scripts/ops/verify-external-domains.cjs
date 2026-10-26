// Внешние домены, к которым обращается браузер посетителя на проде, — по каждой странице.
// Публичные: главная, паспорт лота (первая ссылка /passport/… со /scan или главной), карта, вход.
// Кабинеты — временными учётками через настоящую форму входа: гость (/journey), кофейня (кабинет и
// профиль на карте), обжарщик, admin (/dashboard/admin и /admin).
// Учитываются все запросы страницы (документ, скрипты, стили, шрифты, картинки, тайлы, fetch) и websocket.
// В отчёт идут только хост, тип ресурса и число запросов — ни путей с параметрами, ни email, ни паролей.
// Скриншоты главной и паспорта лота на 390 px (fullPage) — для сравнения «до/после».
// Запуск (из workflow verify-external-domains): node verify-external-domains.cjs <путь к playwright>
// env: PROD_URL, OUT_DIR (report.md, domains.json, скриншоты), TEMP_JSON — учётки кабинетов (необязательно),
// KNOWN_HOSTS — regex разрешённых внешних хостов вместо KNOWN (для проверки, что сторож краснеет: '^$').
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.argv[2]);

const base = process.env.PROD_URL.replace(/\/$/, '');
const own = new URL(base).hostname;
const out = process.env.OUT_DIR;
const accounts = process.env.TEMP_JSON ? JSON.parse(fs.readFileSync(process.env.TEMP_JSON, 'utf8')) : {};
const VIEWPORT = { width: 390, height: 844 };
// Страна по известным доменам — для таблицы; неизвестный домен помечается «?».
const COUNTRY = [
  [/(^|\.)openstreetmap\.org$/, 'Великобритания (OSM Foundation)'],
  [/(^|\.)(googleapis|gstatic|google|googletagmanager|google-analytics|doubleclick)\.com$/, 'США (Google)'],
  [/(^|\.)(unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare\.com|cloudflare\.com)$/, 'США (CDN)'],
  [/(^|\.)resend\.(com|dev)$/, 'США (Resend)'],
  [/(^|\.)supabase\.(co|in)$/, 'США (Supabase Cloud)'],
  [/(^|\.)(yandex\.(ru|net|com)|yastatic\.net|mc\.yandex\.ru)$/, 'Россия (Яндекс)'],
];
// Внешние домены, уже вынесенные владельцу на решение (CLAUDE.md, «Данные только в России»). Любой другой —
// красный прогон: новый иностранный сервис не появляется на сайте молча.
const KNOWN = new RegExp(process.env.KNOWN_HOSTS || String.raw`^[abc]\.tile\.openstreetmap\.org$`);
const country = (host) => (COUNTRY.find(([re]) => re.test(host)) || [null, '?'])[1];
const lines = [];
const results = [];
let failed = 0;

function log(line = '') {
  console.log(line);
  lines.push(line);
}

async function settle(page) {
  // Ленивые картинки и тайлы: прокрутить до конца и обратно, дождаться тишины в сети.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2500);
}

async function login(context, account) {
  const page = await context.newPage();
  try {
    await page.goto(base + '/auth/login', { waitUntil: 'networkidle' });
    await page.fill('#enthusiast-email', account.email);
    await page.fill('#enthusiast-password', account.password);
    await Promise.all([
      page.waitForURL((url) => url.pathname !== '/auth/login' || url.searchParams.has('error'), { timeout: 30000 }),
      page.click('form button[type="submit"]'),
    ]);
    if (new URL(page.url()).searchParams.has('error')) throw new Error('форма вернула ошибку входа');
  } finally {
    await page.close();
  }
}

async function visit(context, label, pagePath, screenshot) {
  const page = await context.newPage();
  const hosts = new Map();
  const fonts = new Set();
  const note = (raw, type) => {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return;
    }
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return;
    if (type === 'font') fonts.add(url.host);
    const entry = hosts.get(url.hostname) || { count: 0, types: new Set() };
    entry.count += 1;
    entry.types.add(type);
    hosts.set(url.hostname, entry);
  };
  page.on('request', (req) => note(req.url(), req.resourceType()));
  page.on('websocket', (ws) => note(ws.url(), 'websocket'));
  let status = 'ошибка';
  let finalPath = pagePath;
  try {
    const res = await page.goto(base + pagePath, { waitUntil: 'networkidle', timeout: 60000 });
    status = res ? res.status() : 'нет ответа';
    if (!res || res.status() >= 400) failed += 1;
    await settle(page);
    // Итоговый путь — после ожидания: кабинет может увести на вход уже после загрузки (ревью Codex).
    finalPath = new URL(page.url()).pathname;
    if (screenshot) await page.screenshot({ path: path.join(out, screenshot), fullPage: true });
  } catch (err) {
    failed += 1;
    status = `ошибка: ${err.message.split('\n')[0]}`;
  } finally {
    await page.close();
  }
  const external = [...hosts].filter(([host]) => host !== own);
  for (const [host] of external) {
    if (KNOWN.test(host)) continue;
    failed += 1;
    log(`FAIL ${label}: новый внешний домен ${host} — правило «Данные только в России» (CLAUDE.md)`);
  }
  results.push({
    label,
    path: pagePath,
    finalPath,
    status,
    own: hosts.get(own)?.count || 0,
    fonts: [...fonts],
    external: external.map(([host, e]) => ({ host, count: e.count, types: [...e.types].sort(), country: country(host) })),
  });
}

async function passportPath(context) {
  const page = await context.newPage();
  try {
    for (const from of ['/scan', '/']) {
      await page.goto(base + from, { waitUntil: 'networkidle' });
      const href = await page.locator('a[href^="/passport/"]').first().getAttribute('href').catch(() => null);
      if (href) return href.split('?')[0];
    }
    return null;
  } finally {
    await page.close();
  }
}

function report() {
  log(`## Внешние домены по страницам — ${base} (390 px)`);
  log('');
  log('| Страница | Путь → итог | HTTP | Запросов к своему домену | Шрифты с хостов | Внешний домен | Страна | Запросов | Типы |');
  log('|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    const head = `| ${r.label} | ${r.path} → ${r.finalPath} | ${r.status} | ${r.own} | ${r.fonts.join(', ') || '—'}`;
    if (!r.external.length) log(`${head} | нет | — | — | — |`);
    for (const e of r.external) log(`${head} | ${e.host} | ${e.country} | ${e.count} | ${e.types.join(', ')} |`);
  }
  log('');
  const all = [...new Set(results.flatMap((r) => r.external.map((e) => e.host)))].sort();
  log(`Все внешние домены: ${all.join(', ') || 'нет'}`);
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const anon = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const passport = await passportPath(anon);
    await visit(anon, 'Главная', '/', 'home-390.png');
    if (passport) await visit(anon, 'Паспорт лота', passport, 'passport-390.png');
    else {
      failed += 1;
      log('FAIL: ссылка на паспорт лота не найдена ни на /scan, ни на главной');
    }
    await visit(anon, 'Карта', '/map');
    await visit(anon, 'Вход', '/auth/login');
    await anon.close();

    const cabinets = {
      guest: [['Кабинет гостя', '/journey']],
      cafe: [['Кабинет кофейни', '/dashboard/cafe'], ['Кофейня: профиль на карте', '/dashboard/cafe/map-profile']],
      roaster: [['Кабинет обжарщика', '/dashboard/roaster']],
      admin: [['Кабинет admin', '/dashboard/admin'], ['Админка /admin', '/admin']],
    };
    for (const [key, pages] of Object.entries(cabinets)) {
      if (!accounts[key]) continue;
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      try {
        await login(context, accounts[key]);
        for (const [label, p] of pages) {
          await visit(context, label, p);
          const landed = results[results.length - 1].finalPath;
          if (landed !== p) {
            failed += 1;
            log(`FAIL ${label}: ${p} увёл на ${landed} — кабинет не открылся`);
          }
        }
      } catch (err) {
        failed += 1;
        log(`FAIL вход ${key}: ${err.message.split('\n')[0]}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    report();
    fs.writeFileSync(path.join(out, 'domains.json'), JSON.stringify(results, null, 2) + '\n');
    fs.writeFileSync(path.join(out, 'report.md'), lines.join('\n') + '\n');
  }
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
