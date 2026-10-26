// Внешние домены, к которым обращается браузер посетителя на проде, — по каждой странице.
// Публичные: главная, паспорт лота (первая ссылка /passport/… со /scan или главной), карта, вход.
// Кабинеты — временными учётками через настоящую форму входа: гость (/journey), кофейня (кабинет и
// профиль на карте), обжарщик, admin (/dashboard/admin и /admin).
// Учитываются все запросы страницы (документ, скрипты, стили, шрифты, картинки, тайлы, fetch) и websocket.
// В отчёт идут только хост, тип ресурса и число запросов — ни путей с параметрами, ни email, ни паролей.
// Скриншоты главной, паспорта лота, карты и профиля кофейни на 390 px (fullPage) — для сравнения «до/после».
// Карта и профиль кофейни: тайлы — только со своего /tiles/ (HTTP 200, image/png, хотя бы один); на профиле
// кофейни «Найти на карте по адресу» — запрос к своему /api/cafe/geocode, 200 и координаты.
// Запуск (из workflow verify-external-domains): node verify-external-domains.cjs <путь к playwright>
// env: PROD_URL, OUT_DIR (report.md, domains.json, скриншоты), TEMP_JSON — учётки кабинетов (необязательно),
// KNOWN_HOSTS — regex разрешённых внешних хостов (по умолчанию — ни одного).
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
// Браузер посетителя не обращается ни к одному внешнему домену (CLAUDE.md, «Данные только в России»): любой
// внешний хост — красный прогон. Исключение задаётся только явно, через KNOWN_HOSTS.
const KNOWN = process.env.KNOWN_HOSTS ? new RegExp(process.env.KNOWN_HOSTS) : null;
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
  page.setDefaultTimeout(60000);
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

// Ход замера — в лог job (не в отчёт): видно, на какой странице и шаге прогон стоит.
const step = (label, what) => console.log(`${new Date().toISOString()} ${label}: ${what}`);

async function visit(context, label, pagePath, { screenshot, tiles, geocode } = {}) {
  step(label, 'открываю');
  const page = await context.newPage();
  page.setDefaultTimeout(60000); // действия Playwright без своего timeout иначе ждут бесконечно
  const hosts = new Map();
  const fonts = new Set();
  const tile = { ok: 0, bad: 0, cancelled: 0 };
  const tileChecks = [];
  const geo = { status: '—' };
  // Тайл засчитывается, только если тело — настоящий PNG (сигнатура 89 50 4E 47), а не пустой ответ 200.
  const onTile = (res) => {
    const url = new URL(res.url());
    if (url.hostname !== own || !url.pathname.startsWith('/tiles/')) return;
    const png = (res.headers()['content-type'] || '').startsWith('image/png');
    // Leaflet отменяет загрузку тайлов, ушедших с экрана: тело такого ответа не приходит никогда (body() висит).
    // Через 10 с тайл считается отменённым — не успех и не ошибка.
    const body = res.status() === 200 && png ? res.body() : Promise.resolve(Buffer.alloc(0));
    const timeout = new Promise((resolve) => setTimeout(() => resolve('cancelled'), 10000));
    tileChecks.push(
      Promise.race([body.then((b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47).catch(() => false), timeout]).then(
        (r) => (r === 'cancelled' ? (tile.cancelled += 1) : r ? (tile.ok += 1) : (tile.bad += 1))
      )
    );
  };
  page.on('response', onTile);
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
    step(label, 'загружена');
    if (geocode) await checkGeocode(page, geo);
    // Итоговый путь — после ожидания: кабинет может увести на вход уже после загрузки (ревью Codex).
    finalPath = new URL(page.url()).pathname;
    if (screenshot) await page.screenshot({ path: path.join(out, screenshot), fullPage: true });
    // Ответы после этой точки не учитываются; все начатые проверки тел — дождаться до вердикта (ревью Codex).
    page.off('response', onTile);
    step(label, `проверка тел тайлов: ${tileChecks.length}`);
    await Promise.all(tileChecks);
  } catch (err) {
    failed += 1;
    status = `ошибка: ${err.message.split('\n')[0]}`;
  } finally {
    await page.close();
    step(label, 'закрыта');
  }
  const external = [...hosts].filter(([host]) => host !== own);
  for (const [host] of external) {
    if (KNOWN && KNOWN.test(host)) continue;
    failed += 1;
    log(`FAIL ${label}: новый внешний домен ${host} — правило «Данные только в России» (CLAUDE.md)`);
  }
  if (tiles && (!tile.ok || tile.bad)) {
    failed += 1;
    log(`FAIL ${label}: тайлы со своего /tiles/ — ${tile.ok} ок, ${tile.bad} с ошибкой`);
  }
  if (geocode && geo.status !== 'ok') {
    failed += 1;
    log(`FAIL ${label}: поиск адреса — ${geo.status}`);
  }
  results.push({
    label,
    tiles: tiles ? tile : null,
    geocode: geocode ? geo.status : null,
    path: pagePath,
    finalPath,
    status,
    own: hosts.get(own)?.count || 0,
    fonts: [...fonts],
    external: external.map(([host, e]) => ({ host, count: e.count, types: [...e.types].sort(), country: country(host) })),
  });
}

// «Найти на карте по адресу»: ответ своего /api/cafe/geocode — 200 и координаты. Форма не сохраняется.
async function checkGeocode(page, geo) {
  try {
    const [res] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === '/api/cafe/geocode', { timeout: 45000 }),
      page.getByRole('button', { name: 'Найти на карте по адресу' }).click(),
    ]);
    const body = await res.json().catch(() => ({}));
    const coords = Number.isFinite(body.lat) && Number.isFinite(body.lng);
    geo.status = res.status() === 200 && coords ? 'ok' : `HTTP ${res.status()}${coords ? '' : ', без координат'}`;
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2500);
  } catch (err) {
    geo.status = `нет ответа своего /api/cafe/geocode: ${err.message.split('\n')[0]}`;
  }
}

async function passportPath(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  try {
    for (const from of ['/scan', '/']) {
      step('Паспорт лота', `ищу ссылку на ${from}`);
      await page.goto(base + from, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
      // Без timeout getAttribute ждёт появления ссылки бесконечно.
      const href = await page.locator('a[href^="/passport/"]').first().getAttribute('href', { timeout: 15000 }).catch(() => null);
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
  log(`Все внешние домены: ${all.join(', ') || 'нет'} (${all.length})`);
  log('');
  log('| Страница | Тайлы со своего /tiles/ (200, тело PNG) | Тайлы с ошибкой | Отменены картой | Поиск адреса (/api/cafe/geocode) |');
  log('|---|---|---|---|---|');
  for (const r of results) {
    if (!r.tiles && !r.geocode) continue;
    log(`| ${r.label} | ${r.tiles ? r.tiles.ok : '—'} | ${r.tiles ? r.tiles.bad : '—'} | ${r.tiles ? r.tiles.cancelled : '—'} | ${r.geocode || '—'} |`);
  }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  // Предохранитель: замер не дольше 20 минут — иначе job висит до своего таймаута без отчёта.
  setTimeout(() => {
    console.error('FAIL замер дольше 20 минут — прерван');
    report();
    process.exit(1);
  }, 20 * 60 * 1000).unref();
  step('замер', 'запуск браузера');
  const browser = await chromium.launch({ headless: true });
  try {
    const anon = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const passport = await passportPath(anon);
    await visit(anon, 'Главная', '/', { screenshot: 'home-390.png' });
    if (passport) await visit(anon, 'Паспорт лота', passport, { screenshot: 'passport-390.png' });
    else {
      failed += 1;
      log('FAIL: ссылка на паспорт лота не найдена ни на /scan, ни на главной');
    }
    await visit(anon, 'Карта', '/map', { screenshot: 'map-390.png', tiles: true });
    await visit(anon, 'Вход', '/auth/login');
    await anon.close();

    const cabinets = {
      guest: [['Кабинет гостя', '/journey']],
      cafe: [
        ['Кабинет кофейни', '/dashboard/cafe'],
        ['Кофейня: профиль на карте', '/dashboard/cafe/map-profile', { screenshot: 'map-profile-390.png', tiles: true, geocode: true }],
      ],
      roaster: [['Кабинет обжарщика', '/dashboard/roaster']],
      admin: [['Кабинет admin', '/dashboard/admin'], ['Админка /admin', '/admin']],
    };
    for (const [key, pages] of Object.entries(cabinets)) {
      if (!accounts[key]) continue;
      const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
      try {
        await login(context, accounts[key]);
        for (const [label, p, opts] of pages) {
          await visit(context, label, p, opts);
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
