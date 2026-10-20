# План: перевести прод с `fix/pre-pilot-shortlist` на `main`

Статус: **не выполнено**, сервер по-прежнему тянет `fix/pre-pilot-shortlist`
(`deploy/timeweb/update-app.sh`). Факты на 2026-10-20:

- `main` — строгий предок `fix/pre-pilot-shortlist`: у `main` 0 своих коммитов,
  у ветки 19+ сверху (`git rev-list --left-right --count origin/main...origin/fix/pre-pilot-shortlist`).
  Значит, переход — fast-forward, без merge-коммита и без конфликтов.
- Миграций, которых нет в `main`, нет: `git diff --stat origin/main origin/fix/pre-pilot-shortlist -- supabase/migrations` пустой.
  Схему БД переход не трогает.
- Расписание `events-cron.yml` GitHub всегда берёт из ветки по умолчанию (`main`),
  поэтому правки этого workflow в ветке не действуют, пока не попали в `main`.
- Обе ветки защищены required check `check` (`ci.yml`).

## Порядок

1. **Влить всё в ветку.** Открытые PR в `fix/pre-pilot-shortlist` — смержить
   или закрыть. На ветке зелёный `check`.
2. **PR `fix/pre-pilot-shortlist` → `main`.** Дождаться зелёного `check`,
   смержить способом *Rebase / fast-forward* (не squash: sha на сервере
   должен совпасть с `main`). Проверка: `git rev-parse origin/main` ==
   `git rev-parse origin/fix/pre-pilot-shortlist`.
3. **PR со сменой ветки деплоя** (в `main`): в `deploy/timeweb/update-app.sh`
   `origin fix/pre-pilot-shortlist` → `origin main`; в `ci.yml` убрать
   `fix/pre-pilot-shortlist` из `push.branches`; в `CLAUDE.md` убрать
   пометку «временно». Смержить, CI зелёный.
4. **Сервер** (по SSH, одной сессией):
   - бэкап как в `rebuild-public-env.sh`: `.next`, `.env.local` → `/opt/coffee-passport/backups/main-switch-<дата>` (0700);
   - `cd /opt/coffee-passport/app && test -z "$(git status --porcelain)"`;
   - `git fetch origin && git checkout main && git pull --ff-only origin main`;
   - `bash deploy/timeweb/update-app.sh` (сборка, рестарт, curl страниц и `/api/health`).
5. **Проверка прода** (через 5 минут после рестарта):
   - `git rev-parse HEAD` на сервере == `origin/main`;
   - `curl -sS https://147.45.102.186/api/health` → `200`, `"db":"ok"`;
   - `/`, `/auth/login`, `/auth/reset-password` → 200; `/dashboard/cafe`, `/dashboard/roaster` без входа → редирект на логин;
   - `node deploy/timeweb/check-browser-network.cjs` — нет запросов на localhost, нет ошибок страниц;
   - логи `journalctl -u coffee-passport -n 200` с фильтром секретов (см. `CLAUDE.md`) — нет новых ERROR, кроме известного шума сканеров.
6. **После**: снять защиту и заморозить `fix/pre-pilot-shortlist` (не удалять
   сразу — это точка отката), через неделю без инцидентов удалить ветку.

## Откат

Код на шаге 4 тот же самый (тот же sha), поэтому откат — только ветка:
`git checkout fix/pre-pilot-shortlist` на сервере и вернуть строку в
`update-app.sh`. Если сборка сломалась — вернуть `.next` из бэкапа шага 4 и
`systemctl restart coffee-passport`.
