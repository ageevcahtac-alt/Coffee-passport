// Главная и меню: «вошёл / не вошёл» — на проде, через настоящий интерфейс, 390 px.
//   1) без входа: на главной форма входа и партнёрская, в меню только общее;
//   2) каждая роль (временная учётка): вход → главная без форм, «Вы вошли как», «Перейти в кабинет» ведёт в свой
//      кабинет, меню роли; токен истёк → middleware обновил его, вход на месте; перезапуск браузера — вход на месте;
//      «Выйти» → меню снова общее;
//   3) гость без входа сканирует и оценивает лот → оценка на устройстве → входит → перенос (POST checkins 201).
// Запуск (из workflow verify-session-state): node verify-session-state.cjs <путь к playwright>
//   node verify-session-state.cjs --selftest — прогон чистых проверок меню/кабинета на
//   синтетических фикстурах без прода и playwright (валидация разбора cabinet.ts, отказ
//   на пустом кабинете и на меню с лишним личным пунктом).
// env: PROD_URL, LOT_ID, TEMP_JSON ({<метка>: {email, password, role, cabinet}}, метка guest — для переноса), OUT_DIR.
// Печатает только шаги, пути и коды — ни email, ни пароль в вывод не попадают.
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── Меню и кабинет: содержимое, а не URL (F-2, ревью Codex раунд 2) ──────────
// Набор пунктов меню берём из lib/auth/cabinet.ts (navItemsFor — источник правды), а не
// дублируем его здесь: меню в приложении и его проверка не расходятся молча. Разбор
// fail-closed — не разобралось → ошибка → шаг проверки падает, а не пропускается.
function loadNavExpectations() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'auth', 'cabinet.ts'), 'utf8');
  const block = (name) => {
    const match = src.match(new RegExp(`const ${name}[\\s\\S]*?=\\s*([\\s\\S]*?);`));
    if (!match) throw new Error(`lib/auth/cabinet.ts: блок ${name} не найден`);
    return match[1];
  };
  const hrefs = (body) => [...body.matchAll(/href:\s*'([^']+)'/g)].map((m) => m[1]);
  const cabinet = {};
  for (const m of block('CABINET').matchAll(/(\w+):\s*'([^']+)'/g)) cabinet[m[1]] = m[2];
  const shared = hrefs(block('SHARED'));
  const nav = src.match(/export function navItemsFor[\s\S]*?\n}/);
  if (!nav) throw new Error('lib/auth/cabinet.ts: navItemsFor не найдена');
  // Личные ссылки энтузиаста — литеральные href внутри navItemsFor (шаблонные со `${}` не
  // ловим одинарной кавычкой), «Для партнёров» (/ #partners) личным не является.
  const enthusiast = hrefs(nav[0]).filter((href) => href.startsWith('/') && href !== '/#partners');
  const roles = ['enthusiast', 'admin', 'roaster_admin', 'cafe_admin', 'barista'];
  const missingCabinet = roles.filter((role) => !cabinet[role]);
  if (missingCabinet.length || shared.length === 0 || enthusiast.length === 0) {
    throw new Error(`lib/auth/cabinet.ts: разбор дал кабинеты=${JSON.stringify(cabinet)} `
      + `общие=${JSON.stringify(shared)} личные энтузиаста=${JSON.stringify(enthusiast)}`);
  }
  return { cabinet, shared, enthusiast };
}

const NAV = loadNavExpectations();
const PERSONAL = /^\/(journey|coffee-kitchen|loyalty|dashboard|admin)(\/|$|\?)/;

// Личные ссылки пунктов меню (путь без query) — ровно набор своей роли из cabinet.ts,
// без «лишних»: сотруднику дневник/Journey/«Мои карты» не положены (ревью Codex, раунд 2).
function personalHrefs(items) {
  return [...new Set(items.map((item) => (item.href || '').split('?')[0]).filter((href) => PERSONAL.test(href)))];
}

// session: null — гость, {role} — вошедший. Возвращает список проблем; пусто — меню в точности
// соответствует navItemsFor для этого состояния.
function menuProblems(items, session) {
  const labels = items.map((item) => item.label);
  const hrefs = items.map((item) => (item.href || '').split('?')[0]);
  const problems = [];
  const missingShared = NAV.shared.filter((href) => !hrefs.includes(href));
  if (missingShared.length) problems.push(`нет общих: ${missingShared.join(', ')}`);
  if (session) {
    const cabinetHref = NAV.cabinet[session.role];
    if (!cabinetHref) {
      problems.push(`cabinet.ts: нет кабинета для роли ${session.role}`);
    } else {
      const expected = session.role === 'enthusiast' ? NAV.enthusiast : [cabinetHref];
      const personal = personalHrefs(items);
      const absent = expected.filter((href) => !personal.includes(href));
      const extra = personal.filter((href) => !expected.includes(href));
      if (absent.length) problems.push(`нет личных: ${absent.join(', ')}`);
      if (extra.length) problems.push(`лишние личные: ${extra.join(', ')}`);
    }
    if (!labels.includes('Выйти')) problems.push('нет «Выйти»');
    for (const label of ['Войти', 'Регистрация']) {
      if (labels.includes(label)) problems.push(`у вошедшего есть «${label}»`);
    }
  } else {
    const personal = personalHrefs(items);
    if (personal.length) problems.push(`у гостя есть личные: ${personal.join(', ')}`);
    for (const label of ['Войти', 'Регистрация', 'Для партнёров']) {
      if (!labels.includes(label)) problems.push(`нет «${label}»`);
    }
    if (labels.includes('Выйти')) problems.push('у гостя есть «Выйти»');
  }
  return problems;
}

// Характерное содержимое кабинета роли — опорные строки из его разметки. HTTP 200 и «любой
// заголовок» не считаются: пустой кабинет (страница рендерит null, как у баристы без
// barista_id) и нейтральная страница с одним h1 не проходят (F-2).
const CABINET_MARKERS = {
  '/journey': ['Моё кофейное путешествие'],
  '/dashboard/admin': ['Кабинет администратора', 'Платформа'],
  '/dashboard/roaster': ['Каталог лотов', '+ Добавить лот'],
  '/dashboard/cafe': ['Кабинет кофейни', 'Меню зерна'],
  '/dashboard/barista': ['Мой профиль', 'Лояльность гостя'],
};

function cabinetContentProblems(cabinetPath, html) {
  const markers = CABINET_MARKERS[cabinetPath];
  if (!markers) return [`для ${cabinetPath} в скрипте не заданы маркеры содержимого`];
  const missing = markers.filter((marker) => !html.includes(marker));
  return missing.length ? [`нет содержимого кабинета: ${missing.map((m) => `«${m}»`).join(', ')}`] : [];
}

// Проверки на синтетических фикстурах — без прода и playwright. Каждый «отклонено»-пункт
// считается пройденным, только если проверка реально отказала: так selftest показывает,
// что отказ виден, а не молчаливо пропущен.
function selftest() {
  const lines = [];
  let bad = 0;
  const expect = (name, fn) => {
    try {
      fn();
      lines.push(`PASS selftest: ${name}`);
    } catch (error) {
      bad += 1;
      lines.push(`FAIL selftest: ${name}: ${error.message.split('\n')[0]}`);
    }
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
  const rejected = (problems, hint) => assert(problems.some((p) => p.includes(hint)),
    `ожидался отказ «${hint}», проверка дала: ${problems.join('; ') || 'принято'}`);

  expect('разбор lib/auth/cabinet.ts', () => {
    assert(NAV.shared.length > 0, `общие не разобрались: ${JSON.stringify(NAV.shared)}`);
    assert(NAV.enthusiast.length > 0, `личные энтузиаста не разобрались: ${JSON.stringify(NAV.enthusiast)}`);
    for (const role of ['enthusiast', 'admin', 'roaster_admin', 'cafe_admin', 'barista']) {
      assert(Boolean(NAV.cabinet[role]), `нет кабинета для роли ${role}`);
    }
  });

  const staffMenu = [
    { label: '🗺️ Карта кофеен', href: '/map' },
    { label: '🏆 Топовые рецепты', href: '/recipes' },
    { label: '🧑‍🍳 Кабинет бариста', href: '/dashboard/barista' },
    { label: 'Выйти' },
  ];
  expect('меню баристы без лишнего принято', () => {
    assert(menuProblems(staffMenu, { role: 'barista' }).length === 0,
      menuProblems(staffMenu, { role: 'barista' }).join('; '));
  });
  const extraItemMenu = [...staffMenu.slice(0, 3), { label: '💳 Мои карты', href: '/loyalty' }, staffMenu[3]];
  expect('меню с лишним личным пунктом отклонено', () => {
    rejected(menuProblems(extraItemMenu, { role: 'barista' }), 'лишние');
  });
  const noCabinetMenu = staffMenu.filter((item) => !item.href || !item.href.startsWith('/dashboard'));
  expect('меню без кабинета отклонено', () => {
    rejected(menuProblems(noCabinetMenu, { role: 'barista' }), 'нет личных');
  });
  const guestMenu = [
    { label: '🗺️ Карта кофеен', href: '/map' },
    { label: '🏆 Топовые рецепты', href: '/recipes' },
    { label: 'Войти', href: '/auth/login?next=%2F' },
    { label: 'Регистрация', href: '/auth/login?mode=signup&next=%2F' },
    { label: 'Для партнёров', href: '/#partners' },
  ];
  expect('гостевое меню принято', () => {
    assert(menuProblems(guestMenu, null).length === 0, menuProblems(guestMenu, null).join('; '));
  });
  expect('гостевое меню с личным пунктом отклонено', () => {
    rejected(menuProblems([...guestMenu, { label: '🧳 Journey', href: '/journey' }], null), 'личные');
  });

  const baristaHtml = '<main><p>XO · Всеволожск</p><h1>Проверка входа (временно)</h1>'
    + '<p>Мой профиль</p><p>Лояльность гостя</p></main>';
  expect('кабинет баристы с контентом принят', () => {
    assert(cabinetContentProblems('/dashboard/barista', baristaHtml).length === 0,
      cabinetContentProblems('/dashboard/barista', baristaHtml).join('; '));
  });
  expect('пустой кабинет отклонён', () => {
    assert(cabinetContentProblems('/dashboard/barista', '<html><head></head><body></body></html>').length > 0,
      'пустой HTML принят за кабинет');
  });
  expect('страница с нейтральным заголовком отклонена', () => {
    assert(cabinetContentProblems('/dashboard/barista', '<main><h1>Кабинет</h1></main>').length > 0,
      'страница без маркеров баристы принята за кабинет');
  });

  console.log(lines.join('\n'));
  console.log(bad ? `SELFTEST FAIL: ${bad}` : 'SELFTEST PASS');
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes('--selftest')) selftest();

const { chromium } = require(process.argv[2]);

const base = process.env.PROD_URL.replace(/\/$/, '');
const out = process.env.OUT_DIR;
const temp = JSON.parse(fs.readFileSync(process.env.TEMP_JSON, 'utf8'));
const VIEWPORT = { width: 390, height: 844 };
const AUTH_COOKIE = /^(sb-.+-auth-token)(?:\.(\d+))?$/;
const results = [];
let failed = 0;

function verdict(ok, line) {
  if (!ok) failed++;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${line}`);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
}

// fn: вернуть подробность (PASS) или бросить ошибку (FAIL) — строка-отказ PASS-ом не станет.
async function step(line, fn) {
  try {
    const detail = await fn();
    verdict(true, typeof detail === 'string' ? `${line}: ${detail}` : line);
  } catch (error) {
    // Playwright пишет локатор во второй строке («waiting for …») — без него таймаут клика не найти.
    const where = (error.message.match(/waiting for (.+)/) || [])[1];
    verdict(false, `${line}: ${error.message.split('\n')[0]}${where ? ` [${where.slice(0, 120)}]` : ''}`);
  }
}

// Пункты открытого меню (мобильный дроуэр): ссылки и кнопки, затем закрыть.
async function readMenu(page, shot) {
  await page.getByRole('button', { name: 'Открыть меню' }).click();
  const dialog = page.getByRole('dialog', { name: 'Меню' });
  await dialog.waitFor();
  const items = await dialog.locator('nav a, nav button').evaluateAll((nodes) =>
    nodes.map((node) => ({ label: node.textContent.trim(), href: node.getAttribute('href') }))
  );
  if (shot) {
    // Дроуэр появляется анимацией (reveal-fade): снимок — когда он уже непрозрачен.
    await page.waitForFunction(() => {
      const node = document.querySelector('[role="dialog"][aria-label="Меню"]');
      return node && getComputedStyle(node).opacity === '1';
    }, null, { timeout: 5000 });
    await page.screenshot({ path: path.join(out, shot) });
  }
  await page.getByRole('button', { name: 'Закрыть меню' }).click();
  return items;
}

async function homeState(page) {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  return {
    signedIn: await page.getByText('Вы вошли как').count(),
    form: await page.locator('#enthusiast-email').count(),
    partner: await page.getByText('Стать партнёром').count(),
    signup: await page.locator('main').getByRole('button', { name: 'Регистрация' }).count(),
  };
}

function checkGuestHome(state) {
  if (state.signedIn !== 0 || state.form !== 1 || !state.partner) {
    throw new Error(`главная: «Вы вошли как»=${state.signedIn} форма=${state.form} партнёры=${state.partner}`);
  }
  return 'форма входа и партнёрская на месте';
}

function checkGuestMenu(items) {
  const problems = menuProblems(items, null);
  if (problems.length) {
    throw new Error(`меню: ${problems.join('; ')} — пункты: ${items.map((item) => item.label).join(' | ')}`);
  }
  return `пункты: ${items.map((item) => item.label).join(' | ')}`;
}

async function login(page, account, next = '/') {
  await page.goto(`${base}/auth/login?next=${encodeURIComponent(next)}`, { waitUntil: 'networkidle' });
  await page.fill('#enthusiast-email', account.email);
  await page.fill('#enthusiast-password', account.password);
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/auth/login' || url.searchParams.has('error'), { timeout: 30000 }),
    page.click('form button[type="submit"]'),
  ]);
  if (new URL(page.url()).searchParams.has('error')) throw new Error('форма вернула ошибку входа');
}

// Сессия Supabase в cookie (@supabase/ssr: «base64-» + base64url JSON, куски .0, .1 … по 3180 символов).
async function readAuthCookie(context) {
  const parts = (await context.cookies(base)).filter((cookie) => AUTH_COOKIE.test(cookie.name));
  if (!parts.length) return null;
  parts.sort((a, b) => Number(AUTH_COOKIE.exec(a.name)[2] ?? 0) - Number(AUTH_COOKIE.exec(b.name)[2] ?? 0));
  const raw = parts.map((cookie) => cookie.value).join('');
  const json = raw.startsWith('base64-') ? Buffer.from(raw.slice(7), 'base64url').toString('utf8') : decodeURIComponent(raw);
  return { name: AUTH_COOKIE.exec(parts[0].name)[1], parts, session: JSON.parse(json) };
}

// Делает access-токен «истёкшим» (expires_at в прошлом) — так, как через час жизни сессии.
async function expireAccessToken(context) {
  const current = await readAuthCookie(context);
  if (!current) throw new Error('нет cookie сессии');
  const value = 'base64-' + Buffer.from(JSON.stringify({ ...current.session, expires_at: Math.floor(Date.now() / 1000) - 120 })).toString('base64url');
  const chunks = value.match(/.{1,3180}/g);
  const template = current.parts[0];
  await context.clearCookies({ name: AUTH_COOKIE });
  await context.addCookies(chunks.map((chunk, index) => ({
    name: chunks.length === 1 ? current.name : `${current.name}.${index}`,
    value: chunk,
    domain: template.domain,
    path: template.path,
    expires: template.expires,
    httpOnly: template.httpOnly,
    secure: template.secure,
    sameSite: template.sameSite,
  })));
  return current.session.refresh_token;
}

async function role(browser, label, account) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `session-${label}-`));
  const open = () => browser.launchPersistentContext(dir, { headless: true, viewport: VIEWPORT });
  let context = await open();
  let page = context.pages()[0] || (await context.newPage());
  try {
    await step(`${label}: вход`, () => login(page, account));

    await step(`${label}: главная без форм, «Вы вошли как» с адресом учётки`, async () => {
      const state = await homeState(page);
      const shown = (await page.locator('main').innerText()).includes(account.email);
      await page.screenshot({ path: path.join(out, `home-${label}.png`), fullPage: true });
      if (state.signedIn !== 1 || !shown || state.form || state.partner || state.signup) {
        throw new Error(`«Вы вошли как»=${state.signedIn} адрес=${shown} форма=${state.form} партнёры=${state.partner} регистрация=${state.signup}`);
      }
      return true;
    });

    await step(`${label}: меню роли и «Выйти»`, async () => {
      const items = await readMenu(page, `menu-${label}.png`);
      const problems = menuProblems(items, { role: account.role });
      if (problems.length) {
        throw new Error(`меню: ${problems.join('; ')} — пункты: ${items.map((item) => item.label).join(' | ')}`);
      }
      return `пункты: ${items.map((item) => item.label).join(' | ')}`;
    });

    await step(`${label}: «Перейти в кабинет» → ${account.cabinet}`, async () => {
      await page.goto(base + '/', { waitUntil: 'networkidle' });
      await page.getByRole('link', { name: 'Перейти в кабинет' }).click();
      await page.waitForURL((url) => url.pathname === account.cabinet, { timeout: 30000 });
      await page.waitForLoadState('networkidle');
      // Next Link идёт через RSC — статус кабинета берём прямым заходом, и он не должен быть экраном ошибки.
      const direct = await page.goto(base + account.cabinet, { waitUntil: 'networkidle' });
      const landed = new URL(page.url()).pathname;
      const broken = await page.getByText(/Application error|Something went wrong|Что-то пошло не так/).count();
      // Учётка TEMP_JSON и cabinet.ts не должны разойтись: проверка ведёт туда, куда меню/главная.
      if (NAV.cabinet[account.role] !== account.cabinet) {
        throw new Error(`ветка/workflow устарели: cabinet.ts ведёт ${NAV.cabinet[account.role]} на ${account.role}, учётка — ${account.cabinet}`);
      }
      // Кабинет не пустой: есть характерное содержимое роли, а не любой заголовок (F-2, Codex раунд 2).
      const contentProblems = cabinetContentProblems(account.cabinet, await page.content());
      if (landed !== account.cabinet || !direct || direct.status() >= 400 || broken || contentProblems.length) {
        throw new Error(`открылось ${landed} (HTTP ${direct ? direct.status() : '—'}, экран ошибки=${broken}${contentProblems.length ? `, ${contentProblems.join('; ')}` : ''})`);
      }
      return `${landed} (HTTP ${direct.status()}), содержимое: ${CABINET_MARKERS[account.cabinet].join(' + ')}`;
    });

    await step(`${label}: истёкший access-токен обновлён middleware, вход на месте`, async () => {
      // Без JS: страница браузера уходит на about:blank (её Supabase-клиент не обновит токен сам),
      // запросы — через context.request (общие cookie с браузером). Новый токен обязан прийти Set-Cookie
      // в ответе сервера — это и есть middleware.
      await page.goto('about:blank');
      const before = await expireAccessToken(context);
      const first = await context.request.get(base + '/');
      const setCookie = first.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie' && /^sb-.+-auth-token/.test(h.value)).length;
      const signedIn = (await first.text()).includes('Вы вошли как');
      const after = await readAuthCookie(context);
      const rotated = after && after.session.refresh_token !== before && after.session.expires_at * 1000 > Date.now();
      const again = (await (await context.request.get(base + '/')).text()).includes('Вы вошли как');
      if (!signedIn || !setCookie || !rotated || !again) {
        throw new Error(`вход=${signedIn} Set-Cookie sb=${setCookie} токен обновлён=${Boolean(rotated)} второй запрос=${again}`);
      }
      return `Set-Cookie sb: ${setCookie}, refresh-токен сменился, второй запрос с входом`;
    });

    await step(`${label}: перезапуск браузера — вход сохранился`, async () => {
      await context.close();
      context = await open();
      page = context.pages()[0] || (await context.newPage());
      const state = await homeState(page);
      if (state.signedIn !== 1 || state.form) throw new Error(`«Вы вошли как»=${state.signedIn} форма=${state.form}`);
      return true;
    });

    await step(`${label}: «Выйти» → меню снова общее, на главной форма`, async () => {
      await page.getByRole('button', { name: 'Открыть меню' }).click();
      await Promise.all([
        page.waitForURL((url) => url.pathname === '/auth/login', { timeout: 30000 }),
        page.getByRole('dialog', { name: 'Меню' }).getByRole('button', { name: 'Выйти' }).click(),
      ]);
      checkGuestHome(await homeState(page));
      return checkGuestMenu(await readMenu(page, label === 'enthusiast' ? 'menu-after-signout.png' : null));
    });
  } finally {
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function shopPick(page) {
  await page.getByPlaceholder('Найти аккредитованную кофейню…').fill('XO');
  await page.getByRole('button').filter({ hasText: 'Всеволожск' }).first().click();
}

async function guestClaim(browser, account) {
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();
  const lotPath = `/passport/${process.env.LOT_ID}`;
  try {
    await step('гость без входа: скан и оценка лота сохранены на устройстве', async () => {
      await page.goto(base + lotPath, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Я в магазине/ }).click();
      await page.getByRole('link', { name: 'Пройти каппинг' }).click();
      await page.getByRole('heading', { name: 'Где вы пробуете этот кофе?' }).waitFor();
      await shopPick(page);
      await page.getByRole('button', { name: 'Далее', exact: true }).click();
      await page.getByRole('heading', { name: 'Что вы пьёте?' }).waitFor();
      await page.getByRole('button', { name: 'Чёрный кофе', exact: true }).click();
      await page.getByRole('button', { name: 'Эспрессо', exact: true }).click();
      await page.getByRole('button', { name: 'Далее', exact: true }).click();
      await page.getByRole('heading', { name: 'Расскажите о чашке' }).waitFor();
      await page.getByRole('radio', { name: '4 из 5' }).first().click();
      await page.getByRole('button', { name: 'Далее — работа бариста' }).click();
      await page.getByRole('heading', { name: 'Работа бариста' }).waitFor();
      await page.getByLabel('Не указан').check();
      await page.getByRole('button', { name: 'Сохранить дегустацию в дневник' }).click();
      const local = await page.waitForFunction(() => {
        const anon = window.localStorage.getItem('coffee-passport:anon-id');
        const records = JSON.parse(window.localStorage.getItem('coffee-passport:journey') || '[]');
        const own = records.filter((record) => anon && record.userId === anon);
        return own.length ? { count: own.length } : null;
      }, null, { timeout: 30000 });
      const { count } = await local.jsonValue();
      await page.waitForLoadState('networkidle');
      return `оценок гостя на устройстве: ${count} (экран ${new URL(page.url()).pathname})`;
    });

    await step('гость после оценки: меню на главной без личного', async () => {
      await page.goto(base + '/', { waitUntil: 'networkidle' });
      return checkGuestMenu(await readMenu(page, 'menu-guest-after-cupping.png'));
    });

    await step('гость входит — оценка уходит в его аккаунт (POST checkins)', async () => {
      const claim = page.waitForResponse(
        (res) => res.request().method() === 'POST' && new URL(res.url()).pathname.endsWith('/rest/v1/checkins') && res.status() === 201,
        { timeout: 60000 }
      );
      await login(page, account, '/journey');
      const response = await claim;
      await page.waitForLoadState('networkidle');
      const left = await page.evaluate(() => {
        const anon = window.localStorage.getItem('coffee-passport:anon-id');
        return JSON.parse(window.localStorage.getItem('coffee-passport:journey') || '[]').filter((r) => r.userId === anon).length;
      });
      await page.screenshot({ path: path.join(out, 'journey-after-claim.png'), fullPage: true });
      if (left !== 0) throw new Error(`HTTP ${response.status()}, под гостем осталось ${left}`);
      return `HTTP ${response.status()}, под гостем на устройстве не осталось`;
    });
  } finally {
    await context.close();
  }
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await step('без входа: главная с формой входа и партнёрской', async () => {
      const state = await homeState(page);
      await page.screenshot({ path: path.join(out, 'home-guest.png'), fullPage: true });
      return checkGuestHome(state);
    });
    await step('без входа: меню без личного', async () => {
      return checkGuestMenu(await readMenu(page, 'menu-guest.png'));
    });
    await context.close();
  } catch (error) {
    verdict(false, `без входа: ${error.message.split('\n')[0]}`);
  }
  // launchPersistentContext — у chromium-типа, не у запущенного браузера.
  const persistent = { launchPersistentContext: (dir, options) => chromium.launchPersistentContext(dir, options) };
  for (const [label, account] of Object.entries(temp)) {
    if (label === 'guest') continue;
    try {
      await role(persistent, label, account);
    } catch (error) {
      verdict(false, `${label}: ${error.message.split('\n')[0]}`);
    }
  }
  try {
    await guestClaim(browser, temp.guest);
  } catch (error) {
    verdict(false, `перенос оценки гостя: ${error.message.split('\n')[0]}`);
  }
  await browser.close();
  fs.writeFileSync(path.join(out, 'report.md'), `## verify-session-state\n\n${results.map((line) => `- ${line}`).join('\n')}\n`);
  process.exit(failed ? 1 : 0);
})();
