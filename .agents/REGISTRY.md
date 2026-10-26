# Реестр агентов

Правила ролей — `.claude/ORCHESTRATION.md`: кто пишет — тот исправляет, проверяющий только сообщает находки.

## Агенты
| агент | файл | версия | пишет | проверяет |
|---|---|---|---|---|
| main (Claude) | .claude/ORCHESTRATION.md | 2 | фичи, сложная логика, баги, весь UI; мержит только он | diff Codex — через `code-reviewer` |
| codex | AGENTS.md | 2 | `write`: миграции, CI, деплой-скрипты, шаблонные правки; дописывает по плану, если у Claude кончился лимит | `review`: каждый diff Claude перед мержем |
| code-reviewer | .claude/agents/code-reviewer.md | 2 | ничего | diff Codex: план против diff, сам перезапускает проверки |
| qa-monitor | .claude/agents/qa-monitor.md | 1 | ничего (поломки → задачи) | работоспособность сайта |
| designer | .claude/agents/designer.md | 1 | офферы | тренды, UX-аудит |

## Журнал задач
| дата | автор | проверяющий | задача | результат | раундов ревью |
|---|---|---|---|---|---|
| 2026-10-24 | main (Claude) | codex | 20261024-agents-install: оркестрация, раннер, site-health | fix | 2 |
| 2026-10-24 | main (Claude) | codex | 20261024-deploy-actions: deploy и server-ops через Actions, фильтр секретов | fix | 2 |
| 2026-10-24 | main (Claude) | codex | 20261024-1430-owner-cabinets: вход staff в свой кабинет, учётки владельца в проде | fix | 2 (PR #9) + 1 (PR #10) |

| 2026-10-24 | main (Claude) + codex | codex + code-reviewer | 20261024-1600-shop-lot-path: путь «магазин» после QR, флаг profile_seen_before_tasting, db-migrate | fix | 2 (PR #13) + 1 (PR #12) |
| 2026-10-24 | main (Claude) + codex | codex + code-reviewer | 20261024-1900-shop-lot-followup: проверка доставки оценок на проде, 0035 (флаг в кабинете обжарщика), отложенный каппинг в путешествии | ok | 2 (PR #15) + 1 (PR #17) + 2 (PR #18) |
| 2026-10-24 | main (Claude) | codex | 20261024-2100-barista-accounts: учётки бариста из кабинета кофейни, смена временного пароля, проверка на проде | fix | 2 (PR #21) + 1 (PR #22) + 1 (PR #23) |
| 2026-10-25 | main (Claude) | codex | 20261025-1000-barista-followups: бариста из базы в форме оценки, временный пароль закрыт в API, 72 ч и выдача нового, одна кнопка в «Команде» | ok | 2 (PR #25) |
| 2026-10-25 | main (Claude) | codex | 20261025-1415-home-colors: фон картинки «Один лот. Четыре философии» = фон сайта (разница ≤1 на проде, 390/1280 px), поля при автозаполнении как обычные; workflow verify-home-colors | ok | 2 (PR #27) |

| 2026-10-25 | main (Claude) | codex | 20261025-1700-domain-https: HTTPS на coffeepassport.ru (сертификат апекс+www, 301 с http/www/IP, адреса на домен, domain-https verify) | fix | 2 (PR #29) |
| 2026-10-25 | main (Claude) | codex | 20261025-1800-admin-role-access: /admin по роли admin через обычный вход, Basic Auth убран; фикс 500 в /admin (HeadersAdapter); workflow verify-admin-access; заявка XO найдена | fix | 1+1+1 (PR #31, #32, #33; #35 — health) |
| 2026-10-26 | main (Claude) | codex | 20261026-1200-pd-russia-only: аудит внешних доменов прода (verify-external-domains, красный на новом домене), redact — email и телефоны, server-ops весь вывод через redact, правило «данные только в России» в CLAUDE.md | fix | 2 (PR #41) |
| 2026-10-26 | main (Claude) | codex | 20261026-1500-pd-russia-map-geocode: тайлы OSM через свой nginx с кэшем, Nominatim только с сервера (/api/cafe/geocode), «Маршрут» — Яндекс, сравнение российской почты; сторож — 0 внешних доменов | fix | 2 (PR #44, доводка #45–#47) |

## Замены
| дата | агент | было → стало | причина |
|---|---|---|---|
| 2026-10-24 | main, codex, code-reviewer | v1 → v2 | роли по типу работы, «кто пишет — тот исправляет», ревью Codex перед каждым мержем, лимит 2 раунда, раннер на PowerShell |
