import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuestIdentityHint } from './BaristaLoyaltyPanel';

// Задача 3 (0051): ручной ввод 5-значного кода — фолбэк к QR. SSR-разметка
// idle-режима (react-dom/server, без jsdom): рядом со сканером — поле ручного
// ввода кода (5 цифр), старое поле ID не тронуто (verify-barista-access
// зависит от его плейсхолдера). Поведение «карточка до списания + сверка
// личности голосом» зафиксировано компонентом GuestIdentityHint: он рендерится
// на карточке гостя при поиске по коду (viaCode) — до любой кнопки списания.
describe('BaristaLoyaltyPanel — ручной ввод кода гостя (0051)', () => {
  it('idle: поле «Код гостя: 5 цифр» рядом со сканером, старое поле ID на месте', async () => {
    const { BaristaLoyaltyPanel } = await import('./BaristaLoyaltyPanel');
    const html = renderToStaticMarkup(createElement(BaristaLoyaltyPanel, { shopId: 'shop-x' }));

    expect(html).toContain('Сканировать карту гостя');
    expect(html).toContain('Код гостя: 5 цифр');
    // Старое ручное поле не тронуто — verify-barista-access вбивает QR-токен
    // именно в него (getByPlaceholder('Или введите ID гостя вручную')).
    expect(html).toContain('Или введите ID гостя вручную');
    // Код — только 5 цифр: numeric-ввод, maxlength=5.
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('maxLength="5"');
  });

  it('кнопка «Найти» по коду задизейблена, пока не 5 цифр (SSR: первичный рендер)', async () => {
    const { BaristaLoyaltyPanel } = await import('./BaristaLoyaltyPanel');
    const html = renderToStaticMarkup(createElement(BaristaLoyaltyPanel, { shopId: 'shop-x' }));

    // SSR-разметка кнопки кода: value пустое → disabled присутствует.
    expect(html).toContain('disabled');
  });

  it('GuestIdentityHint: сверка личности голосом до списания', () => {
    const html = renderToStaticMarkup(createElement(GuestIdentityHint));

    expect(html).toContain('Найдено по коду');
    expect(html).toContain('перед списанием');
    expect(html).toContain('как его зовут');
  });

  it('idle: подсказки сверки личности ещё нет — она только на карточке по коду', async () => {
    const { BaristaLoyaltyPanel } = await import('./BaristaLoyaltyPanel');
    const html = renderToStaticMarkup(createElement(BaristaLoyaltyPanel, { shopId: 'shop-x' }));

    expect(html).not.toContain('Найдено по коду');
  });
});
