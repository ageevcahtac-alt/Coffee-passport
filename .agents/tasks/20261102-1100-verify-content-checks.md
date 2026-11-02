# 20261102-1100-verify-content-checks

## Цель
Закрыть находку F-2 (docs/reports/2026-11-01-daily-check-audit.md, medium): verify-скрипты
проверяют содержимое, а не URL/HTTP-статус. Источник — report-2.md задачи
20261028-1700-home-session-state (ревью Codex, раунд 2):
1. кабинет принимался за PASS по HTTP 200 / любому заголовку — пустой кабинет баристы проходил;
2. меню допускало лишние личные пункты — не было сверки с полным набором роли из lib/auth/cabinet.ts.

Частично закрыто коммитами 8f8a27f, 4ce773f, f3f424f, 4ced0d2 (временная карточка баристы,
ровно один личный пункт роли, снимок меню после fade-in). Осталось: кабинет — по
характерному содержимому роли; меню — набор пунктов из cabinet.ts, а не дубль в скрипте.

## Автор
Claude (по таблице ролей ORCHESTRATION.md: фикс логики проверки). Проверяет Codex, режим review.

## План
1. scripts/ops/verify-session-state.cjs: меню — разбор lib/auth/cabinet.ts в рантайме
   (CABINET/SHARED/личные энтузиаста), точное равенство личных пунктов роли + общие +
   «Выйти»/без «Войти»; гостевое — без личных. Разбор fail-closed (ошибка → шаг FAIL).
2. Тот же файл: кабинет — маркеры содержимого роли (строки из разметки страницы кабинета),
   а не «любой h1/h2». Маркеры: journey «Моё кофейное путешествие»; admin «Кабинет
   администратора»+«Платформа»; roaster «Каталог лотов»+«+ Добавить лот»; cafe «Кабинет
   кофейни»+«Меню зерна»; barista «Мой профиль»+«Лояльность гостя». Сверка учётки
   (TEMP_JSON) с CABINET из cabinet.ts — расхождение = FAIL.
3. Режим `--selftest`: чистые функции проверок против синтетических фикстур
   (без прода и playwright): корректные наборы принимаются, пустой кабинет и меню с
   лишним личным пунктом отклоняются.
4. .github/workflows/verify-session-state.yml: в шаг validate добавить прогон selftest
   (без новых секретов, без изменения запуска основного прогона).
5. Codex review (до 2 раундов) → PR → REGISTRY → закрыть F-2 в аудите (дата, ссылка на PR).

## Критерии готовности (проверяемые командой)
- `node --check scripts/ops/verify-session-state.cjs` — без ошибок.
- `node scripts/ops/verify-session-state.cjs --selftest` — все пункты PASS, включая
  демонстрацию отказа на пустом кабинете и на меню с лишним личным пунктом.
- `git diff --check origin/fix/pre-pilot-shortlist...HEAD` — чисто.
- Код приложения, миграции, деплой-логика не изменены: `git diff --stat` только
  scripts/ops/verify-session-state.cjs, .github/workflows/verify-session-state.yml, docs.

## НЕ трогать
- Код приложения (app/, components/, lib/ — кроме чтения lib/auth/cabinet.ts скриптом), миграции.
- Деплой-логику (.github/workflows/deploy.yml, server-ops, deploy/), прод (скрипт только гоняется
  workflow'ом как раньше, новых секретов нет).
- verify-barista-access.cjs / verify-admin-access.cjs — там кабинет уже проверяется по содержимому.

## Итог 20261102-1100-verify-content-checks
(заполняется по ходу)
