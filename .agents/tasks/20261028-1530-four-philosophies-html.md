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
