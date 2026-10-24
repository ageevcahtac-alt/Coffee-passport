# 20261024-agents-install

Цель: установить связку Claude + Codex, раннер, site-health.
Автор: Claude. Проверяющий: Codex (review).

## Итог 20261024-agents-install
Запланировано: 1. AGENTS.md + @ORCHESTRATION в CLAUDE.md 2. права PowerShell(...) в settings.local.json, settings.example.json удалён 3. раннер scripts/codex-run.ps1 (review/write) 4. роли в ORCHESTRATION/REGISTRY/code-reviewer 5. site-health на Node 22 + реальные маршруты 6. доказательства
Написал: Claude — все пункты (PR #5: cf1aaa5, f0f7ee1)
Ревью: Codex, раундов 2/2
  принято: check.mjs — ссылка на /admin (401) давала ложный FAIL → seen заполняется страницами конфига
  принято: check.mjs — status:200 отключал обход ссылок → обход при 0 < status < 400
  принято: check.mjs — `--base` без значения молча брал baseUrl → exit 2
  принято: check.mjs — `&amp;` в атрибутах не декодировался → декодируется
  принято: codex-run.ps1 — номер по количеству файлов перезаписывал старый отчёт при пропуске → max + 1
  принято: code-reviewer.md — «временно сломай» противоречило «ничего не правишь» → ломать только во временном worktree
  отклонено: check.mjs — href без кавычек / с пробелами у `=` — React SSR всегда выводит `href="…"`, на этом сайте не встречается
  своя находка: process.exit при открытых fetch-сокетах роняет Node на Windows (UV_HANDLE_CLOSING, exit 127) → process.exitCode
Проверки:
  npm test → Test Files 36 passed (36), Tests 293 passed (293); tsc exit 0; lint ok: no new findings (8 frozen); build exit 0
  site-health по проду (PR run) → checked 79 urls, pages 18, fails 0
  site-health, временный маршрут → FAIL 404 https://147.45.102.186/no-such-route-424242 — HTTP 404; checked 80 urls, pages 19, fails 1
  gh workflow run site-health (main) → success, checked 79 urls, pages 18, fails 0
  раннер review, тестовый промт → отчёт получен, запись в песочнице: EPERM
  раннер, пустой отчёт → EXITCODE=65; таймаут → EXITCODE=124; пропуск номеров → run #4, старый report-3 не тронут
  cronRpcGrants.test.ts без 0033 → Tests 3 failed (3); с 0033 → 3 passed (3)
Merge: PR #5 → fix/pre-pilot-shortlist (70dc3cb), CI check зелёный; main fast-forward до 70dc3cb (шаг 2 docs/DEPLOY_MAIN_SWITCH.md)
Результат: done
