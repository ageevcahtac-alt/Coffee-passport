import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuestProfileEditor } from './GuestProfileEditor';

// Регрессия бага пакета №3: в ЛК гостя блок «Профиль» исчезал целиком, когда
// fetchOwnProfile возвращал null (пустой/недоступный профиль) — условие
// {profile && …} на странице. Контракт теперь: блок рендерится ВСЕГДА,
// ошибка чтения — видимое предупреждение в блоке. Тестируем SSR-разметку
// (react-dom/server — без jsdom, который в проект намеренно не ставится).

describe('GuestProfileEditor — блок профиля рендерится всегда (баг пакета №3)', () => {
  it('при null-профиле: форма с пустыми полями и заглушкой почты, без undefined', () => {
    const html = renderToStaticMarkup(
      createElement(GuestProfileEditor, { profile: null, onSaved: () => {} })
    );

    expect(html).toContain('Профиль');
    expect(html).toContain('Как к вам обращаться?');
    expect(html).toContain('Сохранить профиль');
    expect(html).toContain('Любимый напиток');
    expect(html).not.toContain('undefined');
  });

  it('при ошибке загрузки: понятное предупреждение прямо в блоке', () => {
    const html = renderToStaticMarkup(
      createElement(GuestProfileEditor, { profile: null, loadError: 'RLS denied', onSaved: () => {} })
    );

    expect(html).toContain('Профиль не загрузился');
    expect(html).toContain('RLS denied');
    // Форма при этом остаётся доступна для заполнения.
    expect(html).toContain('Сохранить профиль');
  });

  it('при загруженном профиле: имя и почта подставлены в форму', () => {
    const html = renderToStaticMarkup(
      createElement(GuestProfileEditor, {
        profile: {
          id: 'user-1',
          displayName: 'Михаил',
          email: 'mihail@test.com',
          phone: null,
          city: 'Санкт-Петербург',
          favoriteDrink: 'Флэт уайт',
        },
        onSaved: () => {},
      })
    );

    expect(html).toContain('mihail@test.com');
    expect(html).toContain('value="Михаил"');
  });
});
