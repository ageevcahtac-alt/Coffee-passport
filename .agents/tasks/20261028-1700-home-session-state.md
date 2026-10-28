# 20261028-1700-home-session-state — главная и меню: «вошёл / не вошёл»

## Цель
Главная и меню честно показывают состояние входа. Сессия живёт до «Выйти» для всех ролей.

## Разбор (до правок)
- Меню (`components/shared/Navbar.tsx`) получает только `userEmail` из `app/(site)/layout.tsx` (`supabase.auth.getUser()` по cookie `sb-*-auth-token`). Личные пункты (Journey, Coffee Kitchen, Мои карты) показываются **только при живой сессии**. Данные гостя в браузере (`coffee-passport:anon-id`, `lib/auth/currentUser.tsx`) меню не меняют: прод без cookie отдаёт только «Карта», «Рецепты», «Log in».
- Главная (`app/(site)/page.tsx`) показывает формы входа/регистрации и партнёрскую форму **всегда**, даже с живой сессией. Отсюда видимость «не вошёл, но в меню личное».
- Меню не знает роли: обжарщик/кофейня/бариста/админ видят пункты энтузиаста, ссылки на свой кабинет нет.
- `middleware.ts` нет: обновлённый токен Supabase не записывается в cookie при серверном рендере (`lib/supabase/server.ts` глотает ошибку set «safe when middleware is refreshing» — middleware не было никогда).

## Автор
Claude (UI и логика), ревью — Codex `review`.

## План
1. `lib/auth/cabinet.ts`: кабинет роли (enthusiast → `/journey`, admin, roaster_admin, cafe_admin, barista → `/dashboard/*`) и пункты меню по состоянию (`navItemsFor`). `app/auth/actions.ts` берёт карту отсюда.
2. `lib/auth/siteSession.ts`: `getSiteSession()` (React `cache`) — email + роль из `profiles` или `null`.
3. `middleware.ts`: стандартное обновление сессии `@supabase/ssr` (`getAll`/`setAll`), статика и тайлы мимо.
4. `Navbar`: пункты из `navItemsFor`; гость — «Карта кофеен», «Топовые рецепты», «Войти», «Регистрация», «Для партнёров»; вошедший — пункты роли, «Выйти».
5. Главная: сессия → «Вы вошли как <email>» + «Перейти в кабинет»; формы и партнёрская секция — только без сессии. Якорь `#partners`, `/auth/login?mode=signup`.
6. Тесты сначала красные: `lib/auth/cabinet.test.ts`, `app/(site)/page.test.ts`, `middleware.test.ts`.
7. Прод-проверка: workflow `verify-session-state` (временные учётки 5 ролей + гость, уборка до и после при любом исходе), скриншоты 390 px.

## Критерии готовности
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` — зелёные.
- `verify-session-state` на проде — все PASS, уборка 0 оставшихся учёток.
- `verify-external-domains` — 0 внешних доменов; `site-health` — fails 0.

## НЕ трогать
Скан QR и оценку гостя (`app/(site)/passport/**`, `lib/journey/*`), `claimAnonymousData` — только проверить.
