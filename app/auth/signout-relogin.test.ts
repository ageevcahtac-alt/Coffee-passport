// Регрессия приёмки владельца: «выход → страница входа → войти → СРАЗУ /loyalty»
// без промежуточной карточки «Вы вошли как / Перейти в кабинет».
//
// Герметичный интеграционный тест: реальный браузер (Playwright) против
// `next dev`, чей Supabase подменён локальным моком auth/rest — ни секретов,
// ни сети. Гоняет тот же путь, что у владельца: вход с формы /auth/login →
// /loyalty → «Выйти» из гамбургер-меню → /auth/login → повторный вход →
// обязан снова оказаться в /loyalty (регрессия давала '/' с карточкой-посредником).
//
// Мок отвечает на auth/token (password+refresh), auth/user, auth/logout и
// /rest/v1/* — профиль энтузиаста с гостевым кодом, остальные таблицы пустые.
// Если ни Playwright-chromium, ни системный Chrome недоступны — тест
// пропускается с честной пометкой (CI ubuntu-latest имеет Chrome из коробки),
// а в CI пропуск запрещён: регрессионный тест обязан реально прогоняться.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Browser, BrowserContext, Page } from '@playwright/test';

// Порты — случайные свободные: фиксированные могли бы встретить уже
// поднятый процесс (мок — ошибкой, приложение — чужим сервером).
async function freePort(): Promise<number> {
  const probe = http.createServer();
  await new Promise<void>((resolve) => probe.listen(0, resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

const user = {
  id: '3f2a1b9c-7d4e-4c5a-9b1f-2e8d6c4a7f01',
  email: 'relogin-regression@test.com',
};

// Модель «сироты» из миграции 0050: у auth.users есть аккаунт, а строки в
// public.profiles нет (аккаунты до 0007 / сбой триггера). Тогда пакет №3 ещё
// оставлял destination='/' — гость после входа видел карточку-посредника.
// Тест гоняет обе ветки: читаемый профиль и «сироту».
let serveProfile = true;

function mockJson(res: http.ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
  });
  res.end(body === undefined || body === null ? '' : JSON.stringify(body));
}

function startMock(base: string): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') return mockJson(res, 204);
    const url = new URL(req.url ?? '/', base);
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {};
      if (url.pathname === '/auth/v1/token') {
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(
          JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 }),
        ).toString('base64url');
        return mockJson(res, 200, {
          access_token: `${header}.${payload}.mocksig-${user.id}`,
          refresh_token: `refresh-${user.id}`,
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email },
        });
      }
      if (url.pathname === '/auth/v1/user') {
        const sig = (req.headers.authorization || '').split('.')[2] || '';
        if (!sig.startsWith('mocksig-')) return mockJson(res, 401, { error: 'invalid_token' });
        return mockJson(res, 200, { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email });
      }
      if (url.pathname === '/auth/v1/logout') return mockJson(res, 204);
      if (url.pathname.startsWith('/rest/v1/')) {
        if (req.method === 'PATCH') return mockJson(res, 200, []);
        const table = url.pathname.split('/')[3];
        if (table === 'profiles') {
          if (!serveProfile) return mockJson(res, 200, []);
          return mockJson(res, 200, [
            { id: user.id, role: 'enthusiast', display_name: 'Михаил', email: user.email, guest_code: '12345' },
          ]);
        }
        return mockJson(res, 200, []);
      }
      return mockJson(res, 404, { message: `no route ${url.pathname}` });
    });
  });
  return new Promise((resolve) => server.listen(Number(new URL(base).port), () => resolve(server)));
}

function waitForServer(url: string, timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.status < 500) return resolve();
      } catch {
        /* ещё не поднялся */
      }
      if (Date.now() > deadline) return reject(new Error(`сервер не поднялся: ${url}`));
      setTimeout(tick, 500);
    };
    tick();
  });
}

async function loginViaForm(page: Page) {
  await page.goto(`${APP}/auth/login`, { waitUntil: 'networkidle' });
  await page.fill('#enthusiast-email', user.email);
  await page.fill('#enthusiast-password', 'anything');
  await Promise.all([
    page.waitForURL((url) => url.pathname !== '/auth/login' || url.searchParams.has('error'), { timeout: 60_000 }),
    page.getByRole('button', { name: 'Войти в дневник вкуса' }).click(),
  ]);
  if (new URL(page.url()).searchParams.has('error')) throw new Error('форма вернула ошибку входа');
}

let mock: http.Server;
let dev: ChildProcess;
let APP = '';
let MOCK = '';
let browser: Browser | null = null;
let context: BrowserContext;
let page: Page;
let browserSkipReason: string | null = null;

beforeAll(async () => {
  MOCK = `http://127.0.0.1:${await freePort()}`;
  mock = await startMock(MOCK);
  APP = `http://127.0.0.1:${await freePort()}`;
  const nextBin = path.resolve(__dirname, '..', '..', 'node_modules', 'next', 'dist', 'bin', 'next');
  dev = spawn(process.execPath, [nextBin, 'dev', '-p', String(new URL(APP).port)], {
    cwd: path.resolve(__dirname, '..', '..'),
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: MOCK,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let devErrors = '';
  dev.stderr?.on('data', (chunk) => (devErrors += String(chunk)));
  try {
    await waitForServer(APP);
  } catch (error) {
    throw new Error(`${(error as Error).message}\n[dev stderr]\n${devErrors.slice(-2000)}`);
  }

  try {
    const { chromium } = await import('@playwright/test');
    try {
      browser = await chromium.launch();
    } catch {
      browser = await chromium.launch({ channel: 'chrome' });
    }
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    page = await context.newPage();
  } catch (error) {
    // В CI пропуск недопустим: регрессионный тест обязан реально гоняться.
    if (process.env.CI) throw new Error(`регрессионный тест требует браузер: ${error}`);
    browserSkipReason = String(error);
    browser = null;
  }
}, 240_000);

afterAll(async () => {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  dev?.kill();
  mock?.close();
}, 60_000);

describe('путь владельца: выход → страница входа → войти → /loyalty без посредника', () => {
  async function signOutViaMenu() {
    await page.getByRole('button', { name: 'Открыть меню' }).click();
    const menu = page.getByRole('dialog', { name: 'Меню' });
    await menu.waitFor();
    await Promise.all([
      page.waitForURL((url) => url.pathname === '/auth/login', { timeout: 30_000 }),
      menu.getByRole('button', { name: 'Выйти' }).click(),
    ]);
  }

  async function expectGuestHome() {
    await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
    expect(await page.locator('#enthusiast-email').count()).toBe(1);
    expect(await page.getByText('Вы вошли как').count()).toBe(0);
  }

  it('после «Выйти» повторный вход снова идёт сразу в /loyalty', async (ctx) => {
    if (browserSkipReason) {
      console.warn(`пропуск: браузер недоступен: ${browserSkipReason}`);
      ctx.skip();
    }
    if (!page) ctx.skip();
    serveProfile = true;

    // Свежий вход — базовая линия: уже сейчас сразу /loyalty, не главная с карточкой.
    await loginViaForm(page);
    expect(new URL(page.url()).pathname).toBe('/loyalty');
    expect(await page.getByText('Вы вошли как').count()).toBe(0);

    // Выход через гамбургер-меню — ровно путь владельца → сессии нет.
    await signOutViaMenu();
    await expectGuestHome();

    // Повторный вход с читаемым профилем → СРАЗУ /loyalty.
    await loginViaForm(page);
    expect(new URL(page.url()).pathname).toBe('/loyalty');
    expect(await page.getByText('Вы вошли как').count()).toBe(0);

    // Ещё один выход; дальше — «сирота»: строки profiles нет. Пакет №3 в этой
    // ветке оставлял destination='/' — гость видел карточку «Вы вошли как».
    await signOutViaMenu();
    await expectGuestHome();
    serveProfile = false;

    // Регрессионное утверждение: и здесь вход идёт сразу в /loyalty.
    await loginViaForm(page);
    expect(new URL(page.url()).pathname).toBe('/loyalty');
    expect(await page.getByText('Вы вошли как').count()).toBe(0);
    await page.getByRole('heading', { name: /Лояльность/ }).waitFor({ timeout: 10_000 });
  }, 300_000);
});
