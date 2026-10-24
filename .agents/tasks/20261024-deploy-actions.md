# 20261024-deploy-actions

Цель: все операции с сервером — через GitHub Actions; локальный ssh не используется (с компьютера владельца сервер недоступен из-за VPN).
Автор: Claude (CI и деплой по таблице ролей — Codex, но задача шла одним PR вместе с логикой фильтра; ревью — Codex).

## План
1. Ключ ed25519 `coffee-passport-deploy-gha` → secret `DEPLOY_SSH_KEY` (из файла), локальная копия приватного ключа удалена.
2. Отпечатки хоста через ssh-keyscan в Actions → secret `DEPLOY_KNOWN_HOSTS`; StrictHostKeyChecking yes.
3. `.github/workflows/deploy.yml`: workflow_dispatch + push в `fix/pre-pilot-shortlist`; `update-app.sh` на сервере, сверка HEAD, ожидание `/api/health` `"status":"ok"` до 5 минут.
4. `.github/workflows/server-ops.yml`: только вручную, только чтение — журнал с фильтром секретов, `ss -tlnp`, `df -h`, контейнеры.
5. `scripts/ops/redact.mjs` + тест — одна функция маскирования для всех логов.
6. CLAUDE.md, ORCHESTRATION.md: сервер только через эти workflow.

## Итог 20261024-deploy-actions
Запланировано: 1–6 выше.
Написал: Claude — `.github/actions/ssh-setup/action.yml`, `.github/workflows/deploy.yml`, `.github/workflows/server-ops.yml`, `scripts/ops/redact.mjs`, `scripts/ops/redact.test.ts`, `deploy/timeweb/update-app.sh`, `CLAUDE.md`, `.claude/ORCHESTRATION.md`.
Ревью: Codex, раундов 2/2
  принято (р1): фильтр пропускал `password: x` и пароль в URL → `scripts/ops/redact.mjs`
  принято (р1): гонка SHA при новом push во время деплоя → шаги `superseded?` / `deployed commit` в `deploy.yml`
  принято (р1): первый 503 в `update-app.sh` ронял деплой без ожидания → ретраи в `update-app.sh`
  принято (р1): `grep -v` давал exit 1 на пустом выводе → маскирование вместо удаления строк
  принято (р1): ожидание ограничено попытками (~20 мин), а не временем → дедлайн 300 с в `deploy.yml`
  принято (р2): фильтр оставлял хвост значения после пробела, `;`, `,` (Cookie, пароли с пробелами, JSON) → `redact.mjs`, 4 теста красные до фикса
  принято (р2): ретраи `update-app.sh` обрывались через ~140 с при быстрых 503 → дедлайн 300 с; на имитации часов старый код выходит на t=140s, новый — ok на 180s, отказ на 300s
  свои находки: потерянные `\` в RegExp (String.raw + точные ожидания в тестах); `update-app.sh` делает `git pull` сам себя — workflow запускает копию из mktemp
Проверки: npm test → 37 files, 311 passed; tsc → 0; lint ok
  deploy (merge 39ddfd3): run 40086787058 success; `server HEAD: 39ddfd39…`; `try 1: {"status":"ok","db":"ok","db_latency_ms":2}` `health ok`
  server-ops: run 40086971950 success; 5432/6543/8000 слушают только 127.0.0.1
  deploy со сломанной проверкой (ветка temp/deploy-broken-health, удалена): run 40087008395 failure — `##[error]/api/health без "status":"BROKEN-ON-PURPOSE" за 5 минут`
  site-health после всего: run 40087533955 — `checked 79 urls, pages 18, fails 0`
Merge: PR #7 → `fix/pre-pilot-shortlist` (39ddfd3), CI check success; `main` перемотан на 39ddfd3
Результат: done
