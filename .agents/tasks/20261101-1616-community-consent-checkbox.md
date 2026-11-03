# 20261101-1616-community-consent-checkbox — согласие на публикацию дегустации

## Цель
Закрыть несоответствие: `docs/reports/COMMUNITY_LAYER_PRODUCT_AUDIT.md` заявляет
«Category A — implemented» (чекбокс согласия в `/passport/[lotId]/taste`), а в HEAD
`app/(site)/passport/[lotId]/taste/page.tsx` всегда шлёт `isPublic: false`
(«this form has no consent control»). Бэкенд готов: миграции 0026/0031,
`checkins_community_view`, `CommunityTastingsCard` (даже ссылается на чекбокс
в комментарии).

## Разбор (до правок)
- `useCurrentUser()` уже отдаёт `isAuthenticated` — форма его просто не берёт.
- Анонимная дегустация не доходит до Supabase никогда (`owner_user_id references
  auth.users(id)`, записывается local-only) — чекбокс анониму был бы ложным
  обещанием (позиция аудита). Показываем только `isAuthenticated`.
- Правило «никогда автоматически» (как у `BrewingRecipe.isPublic`): default ВЫКЛ,
  opt-in в момент сохранения, не ретроактивно.
- Stash@{0} (2026-09-20) — образец: тот же чекбокс + правка `withErrorParam`.
  `withErrorParam` в HEAD НЕ применяем: `app/auth/actions.ts` уже использует
  `authErrorPath()` из `lib/auth/safeRedirect.ts`, который корректно ставит
  `error` через URL-парсинг (?/& не ломаются). Конфликтует — фиксируем в отчёте.

## Автор
main (Kimi) — код и тесты; ревью — Codex `review`.

## План
1. `lib/journey/communityConsent.ts`: чистая функция
   `sharedTastingIsPublic(isAuthenticated, consent)` — инвариант приватности
   в одном тестируемом месте (аноним + consent=true → false).
2. `app/(site)/passport/[lotId]/taste/page.tsx`: состояние чекбокса
   (default false), чекбокс на шаге 'barista' только для вошедших,
   `isPublic: sharedTastingIsPublic(...)` в `addTastingRecord`.
3. Тесты: `communityConsent.test.ts` (матрица 2×2), в `store.test.ts` —
   round-trip `isPublic ↔ is_public` через `recordToRow`/`rowToRecord`.
4. Проверки: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
5. Codex review (до 2 раундов) → PR → REGISTRY. После закрытия задачи —
   `git stash drop` (образец больше не нужен), актуализировать статус в
   `docs/reports/COMMUNITY_LAYER_PRODUCT_AUDIT.md`.

## Критерии готовности
- Все 4 команды проверки зелёные.
- Codex-ревью без открытых находок (или закрытых с причиной).
- `isPublic: false` по умолчанию; аноним не видит чекбокс.

## НЕ трогать
- Бэкенд: миграции, view, RLS — всё уже есть.
- `app/auth/actions.ts` (withErrorParam не применяем — есть authErrorPath).
- Прод-ветку и деплой.
