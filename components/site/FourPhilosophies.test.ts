import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// next/font работает только в сборке Next — в тесте нужен лишь className шрифта.
vi.mock('next/font/google', () => {
  const font = () => ({ className: 'font', variable: 'font-var', style: {} });
  return { Forum: font, Lora: font, Manrope: font };
});

// Same classic-runtime JSX note as components/coffee/TastingForm.test.ts; значки собираются при импорте модуля,
// поэтому React нужен глобально до импорта.
vi.stubGlobal('React', React);
const { FourPhilosophies } = await import('./FourPhilosophies');

// Тексты, вшитые в public/images/coffee-passport-four-philosophies.png, — дословно, построчно.
const TEXTS = [
  'COFFEE PASSPORT',
  'ОДИН LOT. ЧЕТЫРЕ ФИЛОСОФИИ.',
  'ОДИН КОФЕ. РАЗНЫЕ ЛЮДИ. РАЗНЫЕ ПОДХОДЫ. РАЗНЫЙ ОПЫТ.',
  'БОЛЬШЕ', 'ЧЕМ ЧАШКА', 'КОФЕ',
  'ЛИЧНАЯ', 'ИСТОРИЯ', 'ВКУСА',
  'ФИЛОСОФИЯ',
  'БАРИСТА', 'Искусство', 'раскрыть потенциал', 'каждого кофе', 'в чашке.',
  'ПРИГОТОВЛЕНИЕ', 'РЕЦЕПТ', 'ЭКСТРАКЦИЯ', 'ТЕМПЕРАТУРА', 'ДИСЦИПЛИНА',
  'ОБЖАРЩИКА', 'Подчеркнуть', 'уникальность лота', 'и раскрыть его', 'характер.',
  'ВЫБОР ЛОТА', 'ПРОФИЛЬ ОБЖАРКИ', 'КОНТРОЛЬ КАЧЕСТВА', 'Q-SCORE', 'УНИКАЛЬНЫЙ ХАРАКТЕР',
  'КОФЕЙНИ', 'Создать пространство,', 'где хороший кофе', 'становится', 'открытием.',
  'ПОДАЧА', 'АТМОСФЕРА', 'КАЧЕСТВО ВОДЫ', 'ОБОРУДОВАНИЕ', 'КОМАНДА',
  'КОФЕЙНОГО', 'ЭНТУЗИАСТА', 'Пробовать.', 'Запоминать.', 'Понимать.', 'Открывать свой вкус.',
  'ЛИЧНЫЙ ОПЫТ', 'СОХРАНЕНИЕ', 'СРАВНЕНИЕ', 'РАЗВИТИЕ ВКУСА', 'СВОЯ ИСТОРИЯ',
  'CANONICAL LOT', 'ETHIOPIA GUJI', 'LOT #001', '87.0',
  'СТРАНА', 'Ethiopia', 'РЕГИОН', 'Guji', 'УРОЖАЙ', '2026', 'ОБРАБОТКА', 'Washed', 'Pure Roast',
  'ВКУСОВЫЕ ДЕСКРИПТОРЫ', 'Peach', 'Jasmine', 'Citrus', 'Honey',
  'КАНОНИЧЕСКИЙ ЛОТ', 'Один и тот же кофе,', 'который раскрывается по-разному', 'в руках разных людей.',
];

describe('FourPhilosophies', () => {
  beforeAll(() => vi.stubGlobal('React', React));
  afterAll(() => vi.unstubAllGlobals());

  const html = () => renderToStaticMarkup(React.createElement(FourPhilosophies));

  it('renders every text of the former image as HTML, verbatim', () => {
    const text = html().replace(/<[^>]+>/g, '\n');
    const lines = new Set(text.split('\n').map((line) => line.replace(/&#x27;/g, "'").trim()));
    expect(TEXTS.filter((t) => !lines.has(t))).toEqual([]);
  });

  it('uses the cut photos from our domain and SVG icons only', () => {
    const markup = html();
    const sources = [...markup.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    expect(sources.sort()).toEqual(
      ['barista', 'beans', 'cafe', 'enthusiast', 'lot-card', 'roaster'].map((n) => `/images/four-philosophies/${n}.png`),
    );
    expect(markup).not.toMatch(/https?:\/\//);
    expect(markup.match(/<li><svg/g)).toHaveLength(20);
  });
});
