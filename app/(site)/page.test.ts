import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { session } = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('@/lib/auth/siteSession', () => ({ getSiteSession: session }));
vi.mock('@/app/auth/actions', () => ({ signInWithPassword: vi.fn(), signUpWithPassword: vi.fn() }));
vi.mock('@/components/site/FourPhilosophies', () => ({ FourPhilosophies: () => null }));
vi.mock('@/components/site/PartnerLeadModal', () => ({ PartnerLeadModal: () => null }));

// Classic-runtime JSX, как в components/site/FourPhilosophies.test.ts.
vi.stubGlobal('React', React);
const { default: LandingPage } = await import('./page');

const render = async () => renderToStaticMarkup(await LandingPage({ searchParams: {} }));

const CABINETS = {
  enthusiast: '/journey',
  roaster_admin: '/dashboard/roaster',
  cafe_admin: '/dashboard/cafe',
  barista: '/dashboard/barista',
  admin: '/dashboard/admin',
} as const;

describe('landing page', () => {
  beforeEach(() => session.mockReset());

  it('without a session: login/signup form and the partner form', async () => {
    session.mockResolvedValue(null);
    const html = await render();
    expect(html).toContain('id="enthusiast-email"');
    expect(html).toContain('Регистрация');
    expect(html).toContain('Стать партнёром');
    expect(html).toContain('id="partners"');
    expect(html).not.toContain('Вы вошли как');
  });

  for (const [role, cabinet] of Object.entries(CABINETS)) {
    it(`with a ${role} session: «Вы вошли как», «Перейти в кабинет» → ${cabinet}, no forms`, async () => {
      session.mockResolvedValue({ email: 'someone@example.test', role });
      const html = await render();
      expect(html).toContain('Вы вошли как');
      expect(html).toContain('someone@example.test');
      expect(html).toMatch(new RegExp(`<a[^>]*href="${cabinet}"[^>]*>Перейти в кабинет</a>`));
      expect(html).not.toContain('id="enthusiast-email"');
      expect(html).not.toContain('Регистрация');
      expect(html).not.toContain('Стать партнёром');
    });
  }
});
