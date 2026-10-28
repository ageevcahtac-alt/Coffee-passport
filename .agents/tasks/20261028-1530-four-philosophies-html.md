# 20261028-1530-four-philosophies-html — блок «Один лот. Четыре философии»: текст HTML вместо вшитого в картинку

## Цель
Текст блока на главной был вшит в `public/images/coffee-passport-four-philosophies.png` и размывался. Весь текст — HTML,
фото и карточка лота — куски исходника.

## Автор
Claude (UI). Ревью — Codex.

## Решения владельца (2026-10-28)
- Текст колонок лежит поверх фото → стереть буквы с фото: пиксели меняются только под буквами и значками, вне маски — 0.
- Телефон: горизонтальная прокрутка карточек (из двух вариантов со скриншотами).

## План
1. `scripts/images/split_four_philosophies.py`: куски `public/images/four-philosophies/{barista,roaster,cafe,enthusiast,lot-card,beans}.png`,
   маска букв по рамкам строк, cv2.inpaint, проверка «вне маски изменено 0».
2. `components/site/FourPhilosophies.tsx` + `.module.css`: текст в HTML, значки SVG, шрифты next/font (Forum, Lora, Manrope — self-host).
   ≥1024 px — композиция исходника (координаты 1672×941, масштаб cqw), <1024 — лента карточек с прокруткой.
3. `app/(site)/page.tsx` — блок вместо картинки. Проверки прода (`verify-home-colors.cjs`, `check-landing.cjs`) — на блок.
4. Тест `components/site/FourPhilosophies.test.ts` — все тексты дословно, картинки только свои, 20 SVG.

## Критерии готовности
- Скрипт: «Вне маски букв изменено пикселей: 0».
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` — зелёные.
- Прод: verify-external-domains — 0 внешних доменов; site-health — fails 0; verify-home-colors (push) — «Расхождений: 0».

## Не трогать
Формы входа и заявки, глобальные шрифты сайта (`app/layout.tsx`), исходную картинку.

## Итог 20261028-1530-four-philosophies-html
Запланировано: 1. Куски фото без изменения пикселей вне букв. 2. Весь текст блока — HTML, значки SVG, шрифты со своего домена.
3. Компьютер — композиция картинки; телефон — лента карточек (выбор владельца). 4. Проверки прода на блок. 5. Тест дословности.
Доводка по просьбе владельца (390 px): карточки одной высоты, сплошная золотая линия через ленту с точкой у каждой философии.
Написал: Claude — `scripts/images/split_four_philosophies.py`, `public/images/four-philosophies/*.png` (+ `*-m.png` для телефона,
без вшитой линии), `components/site/FourPhilosophies.{tsx,module.css,test.ts}`, `app/(site)/page.tsx`,
`scripts/ops/verify-home-colors.cjs`, `.github/workflows/verify-home-colors.yml`, `deploy/timeweb/check-landing.cjs`.
Ревью: Codex, 2/2 по основному diff + 1/2 по доводке для телефона
  принято: маска описания задевала волосы энтузиаста → рамка на строку (`split_four_philosophies.py`)
  принято: тест проверял только наличие строк → полная последовательность строк по порядку (`FourPhilosophies.test.ts`)
  доводка: findings none
Проверки:
  скрипт нарезки → «Вне маски букв изменено пикселей: 0» (включая -m копии)
  npm test → «Test Files 58 passed (58), Tests 515 passed (515)»; tsc — без ошибок; lint — «lint ok: no new findings»; build — код 0
  390 px, все 5 карточек 286.39 × 612.53 px (было 612.53 / 659.22 / 674.38 / 655.22 / 612.53), линия 335.88 px от верха каждой
  карточки, в зазорах 335.89 px; на 320–1000 px совпадает (≤ 0.01 px); компьютер 1280/1920 — 0 px отличий от локальной сборки (1920), 21 px (1280)
  прод после деплоя: verify-home-colors → «Расхождений: 0»; verify-external-domains → «Все внешние домены: нет (0)»;
  site-health → «checked 89 urls, pages 18, fails 0»; на проде те же замеры 390 px
Merge: PR #63 (merge 669982a), CI check pass, verify pass; deploy success
Результат: done
