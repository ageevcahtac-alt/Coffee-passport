import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuestQrModal } from './GuestQrModal';

// Задача 3 (0051): в ЛК гостя рядом с QR показывается постоянный 5-значный
// код крупно; длинная UUID-строка из-под QR убрана (гостю не нужна).
// SSR-разметка: QR рисуется асинхронно (qrUrl=null) — «Готовим код…», но
// код/плейсхолдер рендерятся сразу.
describe('GuestQrModal — 5-значный код вместо UUID (0051)', () => {
  it('с кодом: крупно «Ваш код для бариста: XXXXX», UUID не светится', () => {
    const html = renderToStaticMarkup(
      createElement(GuestQrModal, { guestId: '2c012ffb-ea3e-407e-b3cf-f1ea0e2f2ed0', guestCode: '00123', onClose: () => {} })
    );

    expect(html).toContain('Ваш код для бариста');
    expect(html).toContain('00123');
    // Длинная UUID-строка из интерфейса убрана.
    expect(html).not.toContain('2c012ffb-ea3e-407e-b3cf-f1ea0e2f2ed0');
  });

  it('код с ведущими нулями показывается как есть, без обрезки', () => {
    const html = renderToStaticMarkup(
      createElement(GuestQrModal, { guestId: 'u1', guestCode: '00007', onClose: () => {} })
    );

    expect(html).toContain('00007');
  });

  it('код не выдан (null): понятный фолбэк, без undefined', () => {
    const html = renderToStaticMarkup(
      createElement(GuestQrModal, { guestId: 'u1', guestCode: null, onClose: () => {} })
    );

    expect(html).toContain('Персональный код не выдан');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('u1');
  });
});
