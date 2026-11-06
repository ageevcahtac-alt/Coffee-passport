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
// Next.js не перезаписывает переменные, уже заданные в process.env, значениями
// из .env.local — process.env побеждает. Поэтому плейсхолдеры допустимы
// только там, где .env.local нет (CI): на машине разработчика реальные
// значения из .env.local должны дойти до сборки, а не быть перекрыты.
const HAS_LOCAL_ENV = fs.existsSync(path.join(__dirname, '.env.local'));

function supabaseEnv(): Record<string, string> {
  // Fallback по каждому ключу независимо: частично заданная пара (например,
  // только URL) не должна перезаписываться плейсхолдером. Плейсхолдеры —
  // только для незаданных ключей и только без .env.local.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? (HAS_LOCAL_ENV ? undefined : 'https://ci-placeholder.supabase.co');
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? (HAS_LOCAL_ENV ? undefined : 'ci-placeholder-anon-key');
  const env: Record<string, string> = {};
  if (url) env.NEXT_PUBLIC_SUPABASE_URL = url;
  if (anonKey) env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
  return env;
}

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
          ...supabaseEnv(),
          // Включает пилотные кабинеты (сценарий кабинета ростерии) — только
          // если явно задано в .env.e2e; в CI не задаём.
          ...(process.env.NEXT_PUBLIC_PILOT_DEMO_ENABLED
            ? { NEXT_PUBLIC_PILOT_DEMO_ENABLED: process.env.NEXT_PUBLIC_PILOT_DEMO_ENABLED }
            : {}),
        },
      },
});
