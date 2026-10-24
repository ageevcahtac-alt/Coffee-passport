# 20261024-2100-barista-accounts — доступ бариста из кабинета кофейни

## Разбор (до изменений)
- Кабинет кофейни: «Команда» → «+ Добавить сотрудника» (`app/dashboard/cafe/(hub)/team/page.tsx`,
  `app/dashboard/cafe/staff/new/page.tsx`, `components/cafe/StaffForm.tsx`). Это HR-карточка
  (имя, роль, дата найма, заметки) в localStorage (`lib/data/cafeStaffStore.ts`): ни email, ни пароля,
  ни учётки в Supabase. Бариста через неё доступ не получает.
- Доступ бариста сейчас: только демо-учётка `barista@test.com` (`lib/auth/pilotStaff.ts`,
  `dev_seed_staff_profile`, выключено kill switch 0029) или ручная правка `profiles` в БД.
- Кабинет бариста `/dashboard/barista` (`app/dashboard/barista/page.tsx`, гейт `requireStaffRole('barista')`):
  профиль, лояльность `components/loyalty/BaristaLoyaltyPanel.tsx` (скан QR гостя или ввод кода →
  статус гостя в этой кофейне → продать абонемент / списание визита и баланса абонемента, RPC
  `loyalty_sell_subscription` / `loyalty_redeem`, 0012), отзывы гостей, рецепты по лотам меню.
- Второй баг: имя/кофейня бариста берутся только из статического `BARISTAS`
  (`lib/data/baristaProfileStore.ts`), страница возвращает `null` для любого нового бариста.

## Цель
Кофейня задаёт email и временный пароль бариста → бариста входит, при первом входе меняет пароль →
попадает в свой кабинет со сканом лояльности и списанием. Регистрацию с главной не трогать.

## Автор
- Claude: API, UI, смена пароля, исправление стора, тесты (п. 1–5).
- Codex (write): workflow проверки на проде (п. 6).

## План
1. `POST /api/cafe/staff/barista-accounts` (cafe_admin; `cafe_id` из сессии): Admin API создаёт
   пользователя (email подтверждён, `app_metadata.must_change_password=true`), строку
   `barista_profiles`, профиль `role=barista`. Чужой существующий email — 409, не перезаписывать.
   Сбой после создания — откат (удалить пользователя). Нет service key — 503.
2. `requireStaffRole`: флаг `must_change_password` → `/auth/change-password?next=…`.
3. `/auth/change-password` + server action: пароль 12–128, совпадение, Admin API одним вызовом
   ставит пароль и снимает флаг, редирект через `safeNextPath`.
4. Форма «Доступ в кабинет бариста» на странице «Команда».
5. `baristaProfileStore`: бариста из `barista_profiles`, которых нет в seed, попадают в список.
6. Workflow `verify-barista-access`: вход кофейни → форма → вход бариста (временный → смена пароля →
   кабинет, панель лояльности) → временный гость с абонементом → списание через панель → баланс
   изменился → операция видна в кабинете кофейни → уборка гостя → проверка, что его строк нет,
   а чужие строки не изменились.

## Критерии готовности
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` — зелёные; новые тесты сначала красные.
- Прогон `verify-barista-access` на проде зелёный, вывод до и после уборки.
- `site-health` — fails 0.

## Не трогать
`signUpWithPassword` и форму регистрации на главной; миграции; реальных гостей и их баллы.

## Итог 20261024-2100-barista-accounts
Запланировано: 1. API создания учётки бариста 2. гейт смены пароля 3. /auth/change-password 4. форма в «Команде» 5. новые бариста в сторе 6. проверка на проде.
Написал: Claude — всё (п. 6 тоже, по прецеденту 20261024-1900: проверочный стенд к своей фиче).
Ревью: Codex, PR #21 — 2/2 раунда; PR #22 — 1; PR #23 — 1 (находок нет).
  принято: safeNextPath пропускал `/\evil.example` → lib/auth/safeRedirect.ts; снимок чужих строк построчно, на сервере, с пагинацией и без ложного FAIL при реальных продажах → verify-barista-access.py; settle() ждал недостаточно → verify-barista-access.cjs.
  отклонено: RPC лояльности не проверяют флаг смены пароля — временный пароль знает только кофейня, у которой те же права в этой кофейне; purge по шаблону email — адрес создаёт только этот workflow.
Найдено прогоном на проде и исправлено (PR #23): после смены пароля сессия завершалась; кабинет нового бариста был пустым (синк профилей только в app/(site)).
Проверки: verify-barista-access run 40113823353 — все PASS до и после уборки; site-health run 40113985543 — fails 0.
Merge: PR #21, #22, #23 → fix/pre-pilot-shortlist, deploy зелёный, main синхронизирован.
Результат: done
