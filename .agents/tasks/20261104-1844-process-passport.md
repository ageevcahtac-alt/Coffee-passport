# Process Passport (бэклог #3)

## Цель
Структурированный блок «Процесс» (семья обработки, дни ферментации, тип сосуда,
заметка обжарщика) + значки прозрачности происхождения в паспорте лота.
Без изменения схемы БД — едет на механизме seed + localStorage-override
(`lib/data/lotsStore.ts`), как и остальные поля Lot (см. план в PRODUCT_BACKLOG.md #3).

## Автор
Claude (главная сессия), по таблице ролей в ORCHESTRATION.md.

## План
1. `lib/types/coffee.ts` — `ProcessFamily`, `ProcessDetail`, `SustainabilityBadgeId`,
   `SUSTAINABILITY_BADGES`; `ProducerProfile` += опциональные `processDetail`,
   `sustainabilityBadges` (аддитивно, сид-лоты без правок продолжают работать).
2. `lib/utils/processPassport.ts` — ядро: `PROCESS_FAMILY_LABELS`,
   `inferProcessFamily(text)` (маппинг RU/EN свободного текста → семья, null при
   неуверенности), `parseFermentationDays(raw)`, `formatFermentationDays(days)`
   (плюрализация), `hasProcessPassportContent`.
3. `lib/utils/processPassport.test.ts` — тесты ядра (образец: extraction.test.ts).
4. `components/coffee/ProcessPassportCard.tsx` — read-only карточка по образцу
   ProducerRoasterCard; null при пустых данных; значки — moss, дисклеймер
   «заявлено обжарщиком».
5. `components/roaster/LotBuilderForm.tsx` — секция «Процесс и происхождение»
   (семья select с преселектом через inferProcessFamily из свободного текста,
   дни, сосуд, заметка, значки-чипы). Сохраняет processDetail только если
   что-то введено.
6. `app/(site)/passport/[lotId]/page.tsx` — монтаж карточки после
   ProducerRoasterCard во всех трёх вьюшках, где виден профиль лота
   (preview / lot-info / revealed — см. isLotProfileVisible).
7. `lib/data/lotsStore.ts` — `rowToLot` сохраняет новые поля producer из
   fallback (как story). Тест в lotsStore.test.ts.

## Критерии готовности
- `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` — зелёные.
- Codex review ≤ 2 раундов, находки воспроизведены и закрыты.
- PR в fix/pre-pilot-shortlist, CI зелёный.

## НЕ трогать
- Учётный контур зерна (green_lots/coffees записись), auth, verify-скрипты,
  XO-интеграции, Grind/Extraction (закрытые фичи).
- Схему БД — новых миграций НЕТ.

## Продуктовые решения (консервативно)
- Чтение: карточка показывает ТОЛЬКО явно введённые ростерией данные —
  никакого угадывания семьи на гостевой стороне.
- Преселект семьи в форме из свободного текста — маппинг уже введённых
  ростерией данных, не выдумка.
- Значки — заявка обжарщика без независимой проверки, с честной подписью.
