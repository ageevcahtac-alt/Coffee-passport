import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Креды тестовых юзеров и локальные оверрайды — из .env.e2e (в .gitignore,
// образец — .env.e2e.example). Парсим вручную, без новой зависимости:
// формат строго KEY=VALUE, комментарии '#', значения можно в кавычках.
function loadE2eEnv(): void {
  const file = path.join(__dirname, '.env.e2e');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    const key = match[1];
    const value = match[2].replace(/(^["'])|(["']$)/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadE2eEnv();

// E2E_BASE_URL задан — прогоняемся против уже поднятого сервера (например
// `npm run dev -- -p 3100`) и не поднимаем свой. Иначе webServer ниже делает
// production-сборку и стартует её на 3100.
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const RUN_AGAINST_EXISTING_SERVER = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // Flaky-политика: один повтор в CI (см. .github/workflows/e2e.yml).
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ru-RU',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: RUN_AGAINST_EXISTING_SERVER
    ? undefined
    : {
        command: 'npm run test:e2e:server',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        env: {
          // Локально реальные значения лежат в .env.e2e/.env.local и подхватываются
          // next-ом самим; для CI (где их нет) — те же плейсхолдеры, что в ci.yml.
          NEXT_PUBLIC_SUPABASE_URL:
            process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ci-placeholder.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'ci-placeholder-anon-key',
          // Включает пилотные кабинеты (сценарий кабинета ростерии) — только
          // если явно задано в .env.e2e; в CI не задаём.
          ...(process.env.NEXT_PUBLIC_PILOT_DEMO_ENABLED
            ? { NEXT_PUBLIC_PILOT_DEMO_ENABLED: process.env.NEXT_PUBLIC_PILOT_DEMO_ENABLED }
            : {}),
        },
      },
});
