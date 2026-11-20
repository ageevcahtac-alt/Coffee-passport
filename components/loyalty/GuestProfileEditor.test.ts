import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuestProfileEditor } from './GuestProfileEditor';

// Регрессия багов пакетов №3–4. Пакет №3: блок «Профиль» в ЛК гостя
// исчезал целиком, когда fetchOwnProfile возвращал null — контракт теперь:
// блок рендерится ВСЕГДА, ошибка чтения — видимое предупреждение в блоке.
// Пакет №4: блок компактный — свёрнуто видно имя и любимый напиток (или
// плейсхолдер «Как к вам обращаться?») + чипса «Изменить профиль»; форма
// раскрывается только по клику, поэтому в SSR-разметке её полей нет.
// Почта из блока убрана полностью (задача 3 пакета №4) — это логин, в
// профиле не нужна. Тестируем SSR-разметку (react-dom/server — без jsdom,
// который в проект намеренно не ставится).

describe('GuestProfileEditor — компактный блок, рендерится всегда (пакеты №3–4)', () => {
  it('при null-профиле: свёрнутый блок с плейсхолдером и чипсой, без undefined', () => {
    const html = renderToStaticMarkup(
      createElement(GuestProfileEditor, { profile: null, onSaved: () => {} })
    );

    expect(html).toContain('Профиль');
    expect(html).toContain('Как к вам обращаться?');
    expect(html).toContain('Изменить профиль');
    // Форма свёрнута — её поля и кнопка сохранения не рендерятся.
    expect(html).not.toContain('Сохранить профиль');
    expect(html).not.toContain('Любимый напиток');
    expect(html).not.toContain('undefined');
  });

  it('при ошибке загрузки: понятное предупреждение прямо в блоке', () => {
    const html = renderToStaticMarkup(
      createElement(GuestProfileEditor, { profile: null, loadError: 'RLS denied', onSaved: () => {} })
    );

    expect(html).toContain('Профиль не загрузился');
    expect(html).toContain('RLS denied');
    // Чипса при этом доступна — форму можно раскрыть и заполнить.
    expect(html).toContain('Изменить профиль');
  });

  it('свёрнуто видно имя и любимый напиток гостя', () => {
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

    expect(html).toContain('Михаил');
    expect(html).toContain('Флэт уайт');
  });

  it('почта в блоке отсутствует полностью — ни поля, ни строки про логин', () => {
    const html = renderToStaticMarkup(
      createElement(GuestProfileEditor, {
        profile: {
          id: 'user-1',
          displayName: 'Михаил',
          email: 'mihail@test.com',
          phone: null,
          city: null,
          favoriteDrink: null,
        },
        onSaved: () => {},
      })
    );

    expect(html).not.toContain('mihail@test.com');
    expect(html).not.toContain('логин');
    expect(html).not.toContain('Почта');
  });
});
