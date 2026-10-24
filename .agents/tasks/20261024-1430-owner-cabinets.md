# 20261024-1430-owner-cabinets

Цель: владелец входит по email+паролю в кабинеты админа, обжарщика и кофейни.
Автор: Claude (маршрутизация входа — логика; workflow и серверный скрипт идут одним PR, потому что вся работа с паролями — одна цепочка; так же сделано в 20261024-deploy-actions). Ревью — Codex.

## Схема (что выяснено)
- Роль — `profiles.role` (`enthusiast | barista | cafe_admin | roaster_admin | admin`), строку создаёт триггер `handle_new_user_profile` с ролью `enthusiast`.
- Привязки: `profiles.roaster_id` = `roasters.slug`, `profiles.cafe_id` = `coffee_shops.slug` (0022); проверка формы — `profiles_role_scope` (0009): admin без привязок.
- Кабинеты: `/dashboard/admin|roaster|cafe|barista`, вход проверяет `requireStaffRole`. `/admin` — отдельная CRM под Basic Auth, не трогаем.
- Форма входа (`EnthusiastAuthForm` → `signInWithPassword`) всегда вела на `next`: `/journey` с главной, `/` с `/auth/login`. Роль не учитывалась.

## План
1. `signInWithPassword`: если `next` — `/` или `/journey`, читать роль из `profiles`; staff → свой кабинет. Явный `next` и энтузиаст — как раньше. Форму и регистрацию не трогать. Тесты сначала красные.
2. `.gitignore`: `/.secrets/`; локально `.secrets/cabinet-credentials.txt`, пароли 24 символа (crypto.randomInt).
3. `deploy/timeweb/provision-cabinets.py`: на сервере, Admin API GoTrue + PostgREST с service_role из `.env.local`; inspect / apply (email_confirm, upsert профиля, проверка slug) / temp-create / temp-delete. Пароли только stdin, в вывод не идут.
4. `.github/workflows/provision-cabinets.yml`: только вручную; inspect → apply → вход через настоящую форму (Playwright на раннере) тремя учётками и временным энтузиастом → удаление энтузиаста.
5. После прогона — удалить секреты `CABINET_*`.

## Критерии готовности
- `npm test` (файл actions.test.ts), `tsc`, lint — зелёные; новые тесты были красными без фикса.
- Лог apply: PASS для admin → `/dashboard/admin`, roaster → `/dashboard/roaster`, cafe → `/dashboard/cafe`, энтузиаст → `/` и `/journey`, HTTP 200.
- `git check-ignore .secrets/cabinet-credentials.txt` — путь игнорируется.
- `gh secret list` без `CABINET_*`.
- site-health: fails 0.

## НЕ трогать
`EnthusiastAuthForm.tsx`, регистрацию (`signUpWithPassword`), главную, `/admin` и Basic Auth, миграции.

## Итог 20261024-1430-owner-cabinets
Запланировано: 1–5 выше.
Написал: Claude — `app/auth/actions.ts`, `app/auth/actions.test.ts`, `.gitignore`, `deploy/timeweb/provision-cabinets.py`, `.github/workflows/provision-cabinets.yml`, `scripts/ops/verify-cabinet-login.cjs`.
Ревью: Codex, PR #9 — раундов 2/2, PR #10 — 1/2
  принято (р1): cleanup обрывался на первой ошибке из-за `bash -e` → `set +e` + `|| rc=1` в `provision-cabinets.yml`
  принято (р1): путь временного файла публиковался после `scp` → вывод пути до `scp`
  свои находки: в проде `coffee_shops` пустая (inspect), `profiles.cafe_id` — текст без FK → PR #10: проверка кофейни по формату id с предупреждением
Проверки: actions.test.ts — 4 новых теста красные до фикса, 13 passed после; tsc 0; lint ok; CI check success (PR #9, #10)
  provision-cabinets inspect: run 40091315930 — roasters `roaster-north`, `roaster-xo`; coffee_shops []
  provision-cabinets apply: run 40091681995 — 5× PASS (admin → /dashboard/admin, roaster → /dashboard/roaster, cafe → /dashboard/cafe, энтузиаст /auth/login → /, энтузиаст / → /journey, все HTTP 200); временный энтузиаст удалён; в логе 0 совпадений с паролями и email
  секреты CABINET_* удалены; site-health run 40091802034 — `checked 79 urls, pages 18, fails 0`
Merge: PR #9 (1f40d6a), PR #10 (42ec6ae) → `fix/pre-pilot-shortlist`, deploy success; `main` перемотан
Результат: done
