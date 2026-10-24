import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { UntastedShopLots } from './UntastedShopLots';

describe('UntastedShopLots', () => {
  // Same classic-runtime JSX note as TastingForm.test.ts.
  beforeAll(() => vi.stubGlobal('React', React));
  afterAll(() => vi.unstubAllGlobals());

  it('marks a store lot as not tasted with a button into the blind path', () => {
    const html = renderToStaticMarkup(React.createElement(UntastedShopLots, {
      lots: [{ lotId: 'XO-ETH-01', lotName: 'Эфиопия Гуджи', roasterName: 'XO Coffee' }],
    }));
    expect(html).toContain('Эфиопия Гуджи');
    expect(html).toContain('XO Coffee');
    expect(html).toContain('Не попробован');
    expect(html).toMatch(/<a[^>]*href="\/passport\/XO-ETH-01\?entry=cafe"[^>]*>Пройти каппинг<\/a>/);
  });

  it('renders nothing without store lots', () => {
    expect(renderToStaticMarkup(React.createElement(UntastedShopLots, { lots: [] }))).toBe('');
  });
});
