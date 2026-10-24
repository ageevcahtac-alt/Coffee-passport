# Project rules — Coffee Passport

@.claude/ORCHESTRATION.md

## Audit Checkpoints ("Контрольные аудиты")

This project uses a checkpoint file, `.last_audit`, to track the last
commit that was fully audited. The rules below govern how any agent
(Claude Code or otherwise) must run an audit in this repo.

### Trigger

Run this procedure whenever the user asks for a **"Daily Check"**,
**«Проверь сегодняшнюю работу»**, or an equivalent request for an audit of
recent work — regardless of phrasing, and regardless of how much time has
actually passed since the last audit (could be hours or weeks; the range is
always defined by commits, never by calendar days).

### Mechanics: checkpoint-to-checkpoint ("от аудита до аудита")

- `.last_audit` (repo root) holds exactly one line: the full git commit
  hash that HEAD pointed to when the previous audit last completed
  successfully.
- On trigger:
  1. Read `.last_audit` for `<last_audit_hash>`.
     - If the file doesn't exist yet, this is the **initial baseline
       audit** — there is no prior checkpoint to diff from. Still run
       every check below; report recent history from `git log` instead of
       a `<hash>..HEAD` range, and note explicitly in the report that this
       is the baseline.
  2. Run `git log <last_audit_hash>..HEAD --oneline` — this is the
     **complete** set of commits to audit. Never truncate it and never
     substitute a "recent N commits" shortcut; the whole point of the
     checkpoint is that nothing merged since the last audit is skipped,
     no matter how large the range has grown.

### Procedure (run in this order)

1. **`git status`** — check for uncommitted changes. Report them plainly
   (files touched, staged vs. unstaged); do not treat this as a failure by
   itself, but flag it prominently since anything uncommitted is invisible
   to the commit-range diff in step 2 above until it's actually committed.
2. **`npx tsc --noEmit`** and **`npm run build`** — both must be run; report
   the actual pass/fail outcome of each, not an assumption. A build failure
   makes the audit unsuccessful (see checkpoint update rule below).
3. **Generate the final report**, containing at minimum:
   - Build status (tsc + `next build`, pass/fail, with the actual error
     output if either failed).
   - The list of features/fixes implemented in the audited commit range
     (one line per commit or per logical feature, derived from the commit
     log — don't just paste `git log` output verbatim, summarize what each
     commit actually did).
   - Current branch name.
   - Sync status with `origin/main` (ahead/behind/diverged/up to date —
     `git status -sb` or `git rev-list --left-right --count` against the
     remote).
4. **Checkpoint update** — only after the report is generated **and** the
   build passed: overwrite `.last_audit` with the current `HEAD` commit
   hash (`git rev-parse HEAD`). If the build failed, or if step 1 found
   uncommitted changes that materially affect the audit, leave
   `.last_audit` untouched so the next audit re-covers the same ground
   plus whatever comes after.

### Notes for whoever runs this

- `.last_audit` is intentionally tracked in git (not gitignored) — the
  checkpoint should be shared across sessions and machines, not per-clone
  state.
- Never hand-edit `.last_audit` to a hash that isn't real `HEAD` output
  from this repo; the whole mechanism depends on it being an exact,
  verifiable git commit hash.

---

## Стек и архитектура

Next.js 14.2.35 (App Router, Server Actions, API routes, `middleware.ts`) +
React 18 + TypeScript 5 + Tailwind CSS 4 (токены — `tailwind.config.ts`,
`app/globals.css`, обоснование — `DESIGN.md`). Данные и вход — Supabase
(`@supabase/supabase-js`, `@supabase/ssr`), доступ к таблицам регулирует RLS;
ORM и прямого драйвера PostgreSQL нет. Схема — только SQL-миграции
`supabase/migrations/NNNN_*.sql` (сейчас 0001…0033; на прод накатываются вручную через `docker exec supabase-db psql -U postgres`, таблицы учёта нет), сид —
`supabase/seed/seed.sql`. Тесты — Vitest 2 (`vitest.config.ts`, алиас `@/*`).
Node 22 (на сервере `v22.23.3`, в CI — 22). Пилотный обжарщик — XO Coffee; интеграции с
XO COFFEE Admin (`lib/integrations/xoAdmin.ts`, исходящая) и XO Store
(`app/api/integrations/xo-store/lots`, входящая, `lib/integrations/xoStoreAuth.ts`).

Слои: страницы/роуты `app/**` → проверки доступа `lib/auth/*` → хранилища
данных `lib/data/*`, `lib/journey/*`, `lib/orders/*` → клиенты Supabase
`lib/supabase/*`. Автоматической проверки границ слоёв нет.

README описывает раннюю стадию (magic link) и устарел — вход в коде по
email/паролю (`app/auth/actions.ts`). Верить коду, а не README.

## Команды (проверены 2026-10-20)

| Что | Команда | Результат |
|---|---|---|
| Тесты | `npm test` (`vitest run`) | 36 файлов, 293 теста — зелёные |
| Типы | `npx tsc --noEmit` | без ошибок |
| Сборка | `npm run build` | обязательна перед аудитом (см. выше) |
| Lint | `npm run lint` | ESLint Strict (`next/core-web-vitals`, `.eslintrc.json`) через `scripts/lint-baseline.mjs`: 8 старых предупреждений заморожены в `eslint-baseline.json`, любая новая находка (и предупреждение тоже) — красный. Исправил старую → `npm run lint -- --update`. Добавлять записи в baseline руками нельзя. |
| Локально | `npm run dev` | `.env.local` по образцу `.env.example` |

## Жёсткие гейты

Все тесты гоняет CI (`ci.yml`) на каждом PR.

| # | Правило | Якорь в коде | Проверка | Почему (разбор) |
|---|---|---|---|---|
| 1 | `SUPABASE_SERVICE_ROLE_KEY` и `XO_*_SECRET` — только на сервере, никогда `NEXT_PUBLIC_`, без тихого отката на anon-ключ | `lib/supabase/adminClient.ts`, guard `window` в `lib/integrations/xoAdmin.ts` | нет | `docs/reports/COFFEE_PASSPORT_PRODUCTION_READINESS_AUDIT.md` |
| 2 | `/admin` и `/api/admin/**` — за Basic Auth | `middleware.ts`, `lib/auth/requireAdminBasicAuth.ts` | `app/admin/layout.test.ts`, `app/api/admin/partner-requests/route.test.ts` | миграция `0028_partner_requests_lockdown.sql` |
| 3 | API кабинетов берёт `cafe_id`/`roaster_id` из профиля сессии, а не из запроса | `lib/auth/requireStaffApi.ts`, `requireStaffRole.ts` | `app/api/cafe/roastery-orders/route.test.ts`, `app/api/roaster/production/route.test.ts` | комментарии в `lib/integrations/xoAdmin.ts` |
| 4 | Любой `next=` в redirect — только через `safeNextPath`; callback редиректит на публичный хост, не на `Host` запроса | `lib/auth/safeRedirect.ts`, `app/auth/callback/route.ts` | `lib/auth/safeRedirect.test.ts`, `app/auth/callback/route.test.ts` | `deploy/timeweb/DOMAIN_CHANGELOG.md` (редирект на `https://localhost:3000`, фикс `856f42f`) |
| 5 | Интеграции и cron закрыты, если секрет не задан (fail-closed, 401 / `admin_unavailable`) | `lib/integrations/xoStoreAuth.ts`, `xoAdmin.ts`, `app/api/cron/*` | `app/api/integrations/xo-store/lots/route.test.ts` | `docs/reports/P23_XO_STORE_READ_ONLY_INTEGRATION_BOUNDARY.md` |
| 6 | Схема и RLS меняются только новой миграцией `supabase/migrations/NNNN_*.sql`, старые не редактировать | `supabase/migrations/` | нет | профилактическое правило, инцидента не было |
| 7 | `NEXT_PUBLIC_*` вшиваются при сборке: после их смены нужна пересборка | `deploy/timeweb/rebuild-public-env.sh` | `deploy/timeweb/check-browser-network.cjs` (вручную) | `DOMAIN_CHANGELOG.md`, раздел «Next.js public environment rebuild» |
| 8 | Security definer RPC, которые зовёт cron, исполняет только `service_role`; никаких `grant execute … to anon, authenticated` | `supabase/migrations/0033_cron_rpc_service_role_only.sql` | `supabase/cronRpcGrants.test.ts` | 2026-10-20: анонимный ключ вызывал `/rpc/events_archive_expired` в обход секрета крона (HTTP 200) |

## Анти-паттерны этого проекта

| Нельзя | Почему | Вместо |
|---|---|---|
| Читать `supabase/password coffee pasport/` | там секреты владельца (папка в `.gitignore`) | не открывать вообще |
| `localhost` / внутренний Docker-хост в `NEXT_PUBLIC_SUPABASE_URL` | в браузере у пользователей не работает (`.env.example`) | публичный HTTPS-адрес `…/supabase` |
| Считать, что шлюз Supabase — Kong | на сервере работает **Envoy** (`api-gw`) | см. `DOMAIN_CHANGELOG.md` |
| Анонимный OpenAPI-корень как проверка доступности | Envoy его закрывает | `/supabase/auth/v1/health`, REST-запрос к `lots` |
| `npm install` при деплое | в `package.json` Supabase-пакеты указаны как `latest` | `npm ci` по lockfile |
| Деплой из грязного дерева на сервере | `update-app.sh` падает на `git status --porcelain` | коммит → push → `update-app.sh` |

## CI

| Workflow | Что делает | Блокирует merge? |
|---|---|---|
| `.github/workflows/ci.yml` | job `check`: `npm ci` → тесты → `tsc --noEmit` → lint (baseline) → `next build` с подставными `NEXT_PUBLIC_*`; на каждом PR и push в `main` / `fix/pre-pilot-shortlist` | да: ruleset `protect-prod` на `main` и `fix/pre-pilot-shortlist` — required check `check`, запрет force push и удаления; PR не обязателен, но прямой push без зелёного `check` не пройдёт |
| `.github/workflows/health.yml` (`site-health`) | каждый час, вручную и на PR с правкой проверки: `scripts/health/check.mjs` по `vars.PROD_URL` — маршруты и тексты из `.agents/health.config.json`, `/api/health` с `"status":"ok"`; при поломке (не на PR) открывает issue. Без `PROD_URL` — зелёный пропуск | нет |
| `.github/workflows/deploy.yml` | push в `fix/pre-pilot-shortlist` и вручную: `update-app.sh` на сервере по SSH, сверка HEAD, ожидание `/api/health` `"status":"ok"` | нет (после merge); красный = прод не обновился или нездоров |
| `.github/workflows/server-ops.yml` | только вручную, только чтение: логи (с фильтром секретов), `ss -tlnp`, `df -h`, контейнеры | нет |
| `.github/workflows/events-cron.yml` | ежедневно 03:00 UTC: POST в `/api/cron/events-archive`, `events-aggregate`, `cafe-menu-expire` с `EVENTS_CRON_SECRET`; секреты репо `APP_URL`, `EVENTS_CRON_SECRET` | нет (планировщик). Работает с 2026-10-20. Секрет на сервере — `/opt/coffee-passport/secrets/events_cron_secret` и `.env.local`; в GitHub ставить через bash `gh secret set EVENTS_CRON_SECRET < файл`, не через `\|` из PowerShell 5.1 (дописывает перевод строки → 401 / битый URL) |

## Деплой

- Прод — свой сервер Timeweb: `https://147.45.102.186`, приложение в
  `/opt/coffee-passport/app`, systemd-юнит `coffee-passport`, перед ним Nginx;
  Supabase развёрнут сам (docker compose, Envoy), публичный API — `/supabase`.
  Выкатка — workflow `deploy` (после каждого push/merge в ветку прода и вручную).
- **Временно** прод обновляется с ветки `fix/pre-pilot-shortlist`, не с `main`.
  Сервер не переключать без плана: `docs/DEPLOY_MAIN_SWITCH.md`.
- **Сервер — только через GitHub Actions. Локальный `ssh` не использовать:** с компьютера владельца сервер
  недоступен (весь трафик идёт через AmneziaVPN, 2026-10-24). Ключ — `secrets.DEPLOY_SSH_KEY` (ed25519,
  `coffee-passport-deploy-gha`), отпечатки хоста — `secrets.DEPLOY_KNOWN_HOSTS`, проверка хоста включена.
- Обновление: `gh workflow run deploy` (и автоматически на push в `fix/pre-pilot-shortlist`) — запускает на
  сервере `deploy/timeweb/update-app.sh` (`git pull --ff-only` → `npm ci` → `npm run build` → restart → curl),
  сверяет HEAD сервера с коммитом и ждёт `/api/health` с `"status":"ok"` до 5 минут, иначе красный.
- Проверка здоровья: `curl -sS https://147.45.102.186/api/health` → `200
  {"status":"ok","db":"ok",…}`, при недоступной БД — `503`. Полный набор — `deploy/timeweb/check-server.sh`.
- Логи и диагностика: `gh workflow run server-ops [-f lines=200]` — только чтение: хвост `journalctl -u coffee-passport`
  с фильтром секретов, `ss -tlnp`, `df -h`, `docker ps -a`, HEAD приложения. Вывод — `gh run view <id> --log`.
  Шум: `Failed to parse body as FormData` / `Failed to find Server Action "x"` — POST от сканеров (в Nginx пути `/wp-admin/…`), не регрессия.
  Журналы операций — `/opt/coffee-passport/logs/`.
- Перед изменениями на сервере — бэкап в `/opt/coffee-passport/backups/<дата>` (так делают все скрипты).
- Домен `coffeepassport.ru` ещё не активирован (ждёт смены DNS A-записи);
  активация — `deploy/timeweb/activate-domain.sh`.
- История и план переезда: `deploy/timeweb/DOMAIN_CHANGELOG.md`, `docs/audits/TIMEWEB_MIGRATION_PLAN.md`.

## Где что лежит

- Клиенты Supabase: `lib/supabase/server.ts` (сессия), `browserClient.ts`, `publicServerClient.ts`, `adminClient.ts` (service role).
- Проверки доступа: `lib/auth/*`. Хранилища данных: `lib/data/*`, `lib/journey/*`.
- Общие компоненты UI: `components/shared/`, по ролям — `components/{cafe,roaster,barista,admin,…}`.
- Бэклог: `PRODUCT_BACKLOG.md`. Аудиты: `docs/audits/`. Отчёты по задачам — `docs/reports/` (новые класть туда, не в корень).
