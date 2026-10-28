// Главная и меню: «вошёл / не вошёл» — на проде, через настоящий интерфейс, 390 px.
//   1) без входа: на главной форма входа и партнёрская, в меню только общее;
//   2) каждая роль (временная учётка): вход → главная без форм, «Вы вошли как», «Перейти в кабинет» ведёт в свой
//      кабинет, меню роли; токен истёк → middleware обновил его, вход на месте; перезапуск браузера — вход на месте;
//      «Выйти» → меню снова общее;
//   3) гость без входа сканирует и оценивает лот → оценка на устройстве → входит → перенос (POST checkins 201).
// Запуск (из workflow verify-session-state): node verify-session-state.cjs <путь к playwright>
// env: PROD_URL, LOT_ID, TEMP_JSON ({<метка>: {email, password, role, cabinet}}, метка guest — для переноса), OUT_DIR.
// Печатает только шаги, пути и коды — ни email, ни пароль в вывод не попадают.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require(process.argv[2]);

const base = process.env.PROD_URL.replace(/\/$/, '');
const out = process.env.OUT_DIR;
const temp = JSON.parse(fs.readFileSync(process.env.TEMP_JSON, 'utf8'));
const VIEWPORT = { width: 390, height: 844 };
const PERSONAL = /^\/(journey|coffee-kitchen|loyalty|dashboard|admin)(\/|$|\?)/;
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
  const labels = items.map((item) => item.label);
  const personal = items.filter((item) => item.href && PERSONAL.test(item.href)).map((item) => item.href);
  const missing = ['Войти', 'Регистрация', 'Для партнёров'].filter((label) => !labels.includes(label));
  if (personal.length || missing.length || labels.includes('Выйти')) {
    throw new Error(`меню: личные=${personal.join(',') || '—'} нет=${missing.join(',') || '—'} пункты: ${labels.join(' | ')}`);
  }
  return `пункты: ${labels.join(' | ')}`;
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
      const labels = items.map((item) => item.label);
      const personal = items.filter((item) => item.href && PERSONAL.test(item.href)).map((item) => item.href);
      // Ровно личные ссылки своей роли — ни кабинетов чужих ролей, ни дневника у сотрудника (ревью Codex, раунд 2).
      const expected = account.cabinet === '/journey' ? ['/journey', '/coffee-kitchen', '/loyalty'] : [account.cabinet];
      const exact = [...personal].sort().join(',') === [...expected].sort().join(',');
      const ok = exact && labels.includes('Выйти') && !labels.includes('Войти') && !labels.includes('Регистрация');
      if (!ok) throw new Error(`нет кабинета/«Выйти» или есть «Войти»: ${labels.join(' | ')}`);
      return `пункты: ${labels.join(' | ')}`;
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
      // Кабинет не пустой: есть заголовок (у бариста без карточки страница рендерит null — ревью Codex, раунд 2).
      const heading = await page.locator('h1, h2').filter({ hasText: /\S/ }).count();
      if (landed !== account.cabinet || !direct || direct.status() >= 400 || broken || !heading) {
        throw new Error(`открылось ${landed} (HTTP ${direct ? direct.status() : '—'}, экран ошибки=${broken}, заголовков=${heading})`);
      }
      return `${landed} (HTTP ${direct.status()})`;
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
